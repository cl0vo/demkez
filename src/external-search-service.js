const ITUNES_ENDPOINT = "https://itunes.apple.com/search";
const MUSICBRAINZ_ENDPOINT = "https://musicbrainz.org/ws/2/recording";
const DEFAULT_MUSICBRAINZ_USER_AGENT = "DemoHubBot/1.0 ( https://github.com/cl0vo/demkez )";
const MAX_EXTERNAL_RESULTS = 20;
const MAX_QUERY_VARIANTS = 3;
const MIN_CANDIDATE_POOL = 8;
const MUSICBRAINZ_REQUEST_GAP_MS = 1100;
const MUSICBRAINZ_FALLBACK_SCORE = 180;

export function createExternalSearchService({
  fetchImpl = globalThis.fetch,
  endpoint = ITUNES_ENDPOINT,
  musicBrainzEndpoint = MUSICBRAINZ_ENDPOINT,
  musicBrainzUserAgent = DEFAULT_MUSICBRAINZ_USER_AGENT,
  musicBrainzMinIntervalMs = MUSICBRAINZ_REQUEST_GAP_MS,
} = {}) {
  const scheduleMusicBrainzRequest = createRequestScheduler(musicBrainzMinIntervalMs);

  return {
    async searchTracks(query, limit = 5) {
      const normalizedQuery = String(query ?? "").trim();
      const safeLimit = Math.max(1, Math.min(Number(limit) || 5, MAX_EXTERNAL_RESULTS));

      if (!normalizedQuery || typeof fetchImpl !== "function") {
        return [];
      }

      const candidatePool = Math.min(MAX_EXTERNAL_RESULTS, Math.max(MIN_CANDIDATE_POOL, safeLimit * 4));
      const queryVariants = createQueryVariants(normalizedQuery);
      const appleAttempts = await Promise.allSettled(
        queryVariants.map((variant) => fetchAppleTracks(fetchImpl, endpoint, variant, candidatePool)),
      );
      const appleSucceeded = appleAttempts.filter((attempt) => attempt.status === "fulfilled");
      const appleResults = dedupeExternalResults(
        appleSucceeded.flatMap((attempt) => attempt.value),
      );
      const appleRankedEntries = rankExternalResults(appleResults, queryVariants);
      let musicBrainzResults = [];
      let musicBrainzError = null;

      if (shouldSearchMusicBrainz(appleRankedEntries)) {
        try {
          musicBrainzResults = await fetchMusicBrainzTracks({
            endpoint: musicBrainzEndpoint,
            fetchImpl,
            limit: candidatePool,
            query: normalizedQuery,
            scheduleRequest: scheduleMusicBrainzRequest,
            userAgent: musicBrainzUserAgent,
          });
        } catch (error) {
          musicBrainzError = error;
        }
      }

      if (appleSucceeded.length === 0 && musicBrainzError) {
        throw appleAttempts[0]?.reason ?? musicBrainzError;
      }

      const mergedResults = dedupeExternalResults([
        ...appleRankedEntries.map((entry) => entry.result),
        ...musicBrainzResults,
      ]);

      return rankExternalResults(mergedResults, queryVariants)
        .slice(0, safeLimit)
        .map((entry) => entry.result);
    },
  };
}

async function fetchAppleTracks(fetchImpl, endpoint, query, limit) {
  const url = new URL(endpoint);
  url.searchParams.set("term", query);
  url.searchParams.set("entity", "song");
  url.searchParams.set("media", "music");
  url.searchParams.set("limit", String(Math.max(1, Math.min(limit, MAX_EXTERNAL_RESULTS))));

  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`External search failed with status ${response.status}`);
  }

  const payload = await response.json();
  const results = Array.isArray(payload?.results) ? payload.results : [];

  return results
    .map(toAppleTrackResult)
    .filter(Boolean);
}

async function fetchMusicBrainzTracks({
  endpoint,
  fetchImpl,
  limit,
  query,
  scheduleRequest,
  userAgent,
}) {
  return scheduleRequest(async () => {
    const url = new URL(endpoint);
    url.searchParams.set("query", query);
    url.searchParams.set("fmt", "json");
    url.searchParams.set("limit", String(Math.max(1, Math.min(limit, MAX_EXTERNAL_RESULTS))));
    url.searchParams.set("dismax", "true");

    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent,
      },
    });

    if (!response.ok) {
      throw new Error(`MusicBrainz search failed with status ${response.status}`);
    }

    const payload = await response.json();
    const results = Array.isArray(payload?.recordings) ? payload.recordings : [];

    return results
      .map(toMusicBrainzTrackResult)
      .filter(Boolean);
  });
}

function toAppleTrackResult(entry) {
  const trackId = entry?.trackId ?? entry?.collectionId ?? entry?.artistId;
  const title = normalizeText(entry?.trackName);
  const artist = normalizeText(entry?.artistName);

  if (!trackId || !title) {
    return null;
  }

  return withSourceMetadata({
    artist,
    artworkUrl: normalizeText(entry?.artworkUrl100),
    durationSeconds: Number.isFinite(Number(entry?.trackTimeMillis))
      ? Math.round(Number(entry.trackTimeMillis) / 1000)
      : 0,
    externalId: `itunes:${trackId}`,
    externalUrl: normalizeText(entry?.trackViewUrl || entry?.collectionViewUrl || entry?.artistViewUrl),
    previewUrl: normalizeText(entry?.previewUrl),
    source: "Apple Music",
    title,
    type: "external",
  });
}

function toMusicBrainzTrackResult(entry) {
  const recordingId = normalizeText(entry?.id);
  const title = normalizeText(entry?.title);
  const artist = normalizeArtistCredit(entry?.["artist-credit"]);

  if (!recordingId || !title) {
    return null;
  }

  return withSourceMetadata({
    artist,
    artworkUrl: "",
    durationSeconds: Number.isFinite(Number(entry?.length))
      ? Math.round(Number(entry.length) / 1000)
      : 0,
    externalId: `musicbrainz:${recordingId}`,
    externalUrl: `https://musicbrainz.org/recording/${recordingId}`,
    previewUrl: "",
    source: "MusicBrainz",
    title,
    type: "external",
  });
}

function normalizeArtistCredit(value) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((entry) => normalizeText(entry?.name || entry?.artist?.name || entry?.joinphrase))
    .join("")
    .trim();
}

function withSourceMetadata(result) {
  const sources = mergeSourceNames([], [result.source]);
  return {
    ...result,
    provider: result.source,
    source: formatSourceNames(sources),
    sources,
  };
}

function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || "";
}

function createQueryVariants(query) {
  const variants = [];
  const pushVariant = (value) => {
    const candidate = String(value ?? "").trim();

    if (!candidate || variants.includes(candidate)) {
      return;
    }

    variants.push(candidate);
  };

  const normalized = normalizeForSearch(query);
  pushVariant(query);
  pushVariant(normalized);
  pushVariant(normalized.replace(/\bfeat\b/gu, " ").replace(/\s+/g, " ").trim());

  return variants.slice(0, MAX_QUERY_VARIANTS);
}

function dedupeExternalResults(results) {
  const uniqueResults = new Map();

  for (const result of results) {
    const identityKey = buildTrackIdentityKey(result);
    const existing = uniqueResults.get(identityKey);

    if (!existing) {
      uniqueResults.set(identityKey, result);
      continue;
    }

    uniqueResults.set(identityKey, mergeExternalResults(existing, result));
  }

  return Array.from(uniqueResults.values());
}

function mergeExternalResults(existing, incoming) {
  const preferred = pickPreferredExternalResult(existing, incoming);
  const fallback = preferred === existing ? incoming : existing;
  const sources = mergeSourceNames(existing.sources, incoming.sources);

  return {
    ...fallback,
    ...preferred,
    artworkUrl: preferred.artworkUrl || fallback.artworkUrl || "",
    durationSeconds: preferred.durationSeconds || fallback.durationSeconds || 0,
    externalUrl: preferred.externalUrl || fallback.externalUrl || "",
    previewUrl: preferred.previewUrl || fallback.previewUrl || "",
    provider: preferred.provider || fallback.provider,
    source: formatSourceNames(sources),
    sources,
  };
}

function pickPreferredExternalResult(left, right) {
  const leftScore = getProviderPriority(left.provider || left.source) * 100
    + (left.artworkUrl ? 10 : 0)
    + (left.previewUrl ? 6 : 0)
    + (left.durationSeconds ? 2 : 0);
  const rightScore = getProviderPriority(right.provider || right.source) * 100
    + (right.artworkUrl ? 10 : 0)
    + (right.previewUrl ? 6 : 0)
    + (right.durationSeconds ? 2 : 0);

  return leftScore >= rightScore ? left : right;
}

function getProviderPriority(provider) {
  if (provider === "Apple Music") {
    return 3;
  }

  if (provider === "MusicBrainz") {
    return 2;
  }

  return 1;
}

function mergeSourceNames(left = [], right = []) {
  return Array.from(new Set([...left, ...right]))
    .filter(Boolean)
    .sort((first, second) => getProviderPriority(second) - getProviderPriority(first) || first.localeCompare(second));
}

function formatSourceNames(sources) {
  return sources.filter(Boolean).join(" + ");
}

function buildTrackIdentityKey(result) {
  const artist = normalizeForSearch(result.artist);
  const title = normalizeForSearch(stripTrackDecorators(result.title));

  return `${artist}::${title}`;
}

function stripTrackDecorators(value) {
  return String(value ?? "")
    .replace(/\((feat(?:uring)?|ft\.?)[^)]+\)/giu, "")
    .replace(/\[(feat(?:uring)?|ft\.?)[^\]]+\]/giu, "")
    .replace(/\s*[\[(][^\])]+[\])]\s*$/gu, "")
    .trim();
}

function rankExternalResults(results, queryVariants) {
  return results
    .map((result, index) => ({
      index,
      result,
      score: scoreExternalTrack(result, queryVariants),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
}

function shouldSearchMusicBrainz(appleRankedEntries) {
  if (appleRankedEntries.length === 0) {
    return true;
  }

  return appleRankedEntries[0].score < MUSICBRAINZ_FALLBACK_SCORE;
}

function scoreExternalTrack(result, queryVariants) {
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const variant of queryVariants) {
    const normalizedVariant = normalizeForSearch(variant);

    if (!normalizedVariant) {
      continue;
    }

    bestScore = Math.max(bestScore, scoreExternalTrackVariant(result, normalizedVariant));
  }

  return bestScore + getProviderPriority(result.provider || result.source) * 5;
}

function scoreExternalTrackVariant(result, normalizedQuery) {
  const queryTokens = tokenize(normalizedQuery);
  const artist = normalizeForSearch(result.artist);
  const title = normalizeForSearch(result.title);
  const combined = normalizeForSearch([result.artist, result.title].filter(Boolean).join(" "));
  const artistTokens = tokenize(artist);
  const titleTokens = tokenize(title);
  const combinedTokens = tokenize(combined);
  let score = 0;

  if (combined === normalizedQuery) {
    score += 420;
  }

  if (title === normalizedQuery) {
    score += 340;
  }

  if (combined.includes(normalizedQuery)) {
    score += 160;
  }

  if (title.includes(normalizedQuery)) {
    score += 120;
  }

  score += scoreTokenCoverage(queryTokens, combinedTokens) * 140;
  score += scoreTokenCoverage(queryTokens.slice(0, -1), artistTokens) * 90;
  score += scoreTokenCoverage(queryTokens.slice(-1), titleTokens) * 110;
  score += scoreTokenCoverage(queryTokens, titleTokens) * 40;

  return score;
}

function scoreTokenCoverage(queryTokens, candidateTokens) {
  if (!queryTokens.length || !candidateTokens.length) {
    return 0;
  }

  let total = 0;

  for (const queryToken of queryTokens) {
    total += findBestTokenSimilarity(queryToken, candidateTokens);
  }

  return total / queryTokens.length;
}

function findBestTokenSimilarity(queryToken, candidateTokens) {
  let best = 0;

  for (const candidateToken of candidateTokens) {
    best = Math.max(best, scoreTokenSimilarity(queryToken, candidateToken));

    if (best >= 1) {
      break;
    }
  }

  return best;
}

function scoreTokenSimilarity(left, right) {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const shorter = left.length <= right.length ? left : right;
  const longer = shorter === left ? right : left;

  if (shorter.length >= 3 && longer.startsWith(shorter)) {
    return 0.94;
  }

  if (shorter.length >= 4 && longer.includes(shorter)) {
    return 0.82;
  }

  const distance = damerauLevenshtein(left, right);
  const similarity = 1 - (distance / Math.max(left.length, right.length));

  return Math.max(0, similarity);
}

function tokenize(value) {
  return normalizeForSearch(value)
    .split(" ")
    .filter(Boolean);
}

function normalizeForSearch(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[@]/g, " a ")
    .replace(/[!]/g, "i")
    .replace(/[$]/g, "s")
    .replace(/\b(featuring|feat\.?|ft\.?)\b/gu, " feat ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function damerauLevenshtein(left, right) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;

      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + substitutionCost,
      );

      if (
        row > 1
        && col > 1
        && left[row - 1] === right[col - 2]
        && left[row - 2] === right[col - 1]
      ) {
        matrix[row][col] = Math.min(matrix[row][col], matrix[row - 2][col - 2] + substitutionCost);
      }
    }
  }

  return matrix[left.length][right.length];
}

function createRequestScheduler(minIntervalMs = 0) {
  let queue = Promise.resolve();
  let lastCompletedAt = 0;

  return async (task) => {
    const scheduledTask = queue.then(async () => {
      const waitMs = Math.max(0, lastCompletedAt + minIntervalMs - Date.now());

      if (waitMs > 0) {
        await delay(waitMs);
      }

      const result = await task();
      lastCompletedAt = Date.now();
      return result;
    });

    queue = scheduledTask.catch(() => {});
    return scheduledTask;
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
