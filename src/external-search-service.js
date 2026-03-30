const ITUNES_ENDPOINT = "https://itunes.apple.com/search";

export function createExternalSearchService({
  fetchImpl = globalThis.fetch,
  endpoint = ITUNES_ENDPOINT,
} = {}) {
  return {
    async searchTracks(query, limit = 5) {
      const normalizedQuery = String(query ?? "").trim();

      if (!normalizedQuery || typeof fetchImpl !== "function") {
        return [];
      }

      const url = new URL(endpoint);
      url.searchParams.set("term", normalizedQuery);
      url.searchParams.set("entity", "song");
      url.searchParams.set("media", "music");
      url.searchParams.set("limit", String(Math.max(1, Math.min(limit, 20))));

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
        .map(toExternalTrackResult)
        .filter(Boolean);
    },
  };
}

function toExternalTrackResult(entry) {
  const trackId = entry?.trackId ?? entry?.collectionId ?? entry?.artistId;
  const title = normalizeText(entry?.trackName);
  const artist = normalizeText(entry?.artistName);

  if (!trackId || !title) {
    return null;
  }

  return {
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
  };
}

function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || "";
}
