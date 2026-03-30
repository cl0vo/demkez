import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DB_PATH = resolve(process.cwd(), "data", "db.json");
const EMPTY_DB = {
  supportIntents: [],
  supportPayments: [],
  tracks: [],
  users: {},
};

export function createCatalogService({ dbPath = DB_PATH, feeBps = 300, starsHoldDays = 7 } = {}) {
  let writeQueue = Promise.resolve();

  async function mutateDb(mutate) {
    const task = writeQueue.then(async () => {
      const db = await readDb(dbPath);
      const result = await mutate(db);
      await mkdir(dirname(dbPath), { recursive: true });
      await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
      return result;
    });

    writeQueue = task.catch(() => {});
    return task;
  }

  return {
    async beginUpload(upload) {
      return mutateDb(async (db) => {
        db.users[String(upload.userId)] = {
          ...(db.users[String(upload.userId)] ?? {}),
          pendingUpload: {
            createdAt: new Date().toISOString(),
            durationSeconds: Number(upload.durationSeconds ?? 0),
            fileId: upload.fileId,
            fileName: upload.fileName ?? "",
            fileType: upload.fileType,
            mimeType: upload.mimeType ?? "",
            sourceChatId: upload.sourceChatId ?? null,
            sourceMessageId: upload.sourceMessageId ?? null,
            suggestedTitle: upload.suggestedTitle ?? "",
            title: upload.title ?? "",
            uploaderName: upload.uploaderName,
            uploaderUsername: upload.uploaderUsername ?? "",
          },
        };

        return db.users[String(upload.userId)].pendingUpload;
      });
    },

    async clearPendingUpload(userId) {
      return mutateDb(async (db) => {
        const user = db.users[String(userId)];

        if (!user?.pendingUpload) {
          return false;
        }

        delete user.pendingUpload;
        return true;
      });
    },

    async clearPendingAction(userId) {
      return mutateDb(async (db) => {
        const user = ensureUserRecord(db, userId);
        delete user.pendingAction;
        return true;
      });
    },

    async clearUiPanel(userId) {
      return mutateDb(async (db) => {
        const user = ensureUserRecord(db, userId);
        delete user.uiPanel;
        return true;
      });
    },

    async finalizePendingUpload(userId) {
      return mutateDb(async (db) => {
        const user = db.users[String(userId)] ?? {};
        const pending = user.pendingUpload;

        if (!pending?.title) {
          return null;
        }

        const track = {
          createdAt: new Date().toISOString(),
          durationSeconds: Number(pending.durationSeconds ?? 0),
          fileId: pending.fileId,
          fileName: pending.fileName,
          fileType: pending.fileType,
          id: randomUUID(),
          mimeType: pending.mimeType,
          searchIndex: buildSearchIndex(pending.title),
          sourceChatId: pending.sourceChatId ?? null,
          sourceMessageId: pending.sourceMessageId ?? null,
          title: pending.title,
          uploaderName: pending.uploaderName,
          uploaderUserId: Number(userId),
          uploaderUsername: pending.uploaderUsername ?? "",
        };

        db.tracks.unshift(track);
        delete user.pendingUpload;
        db.users[String(userId)] = user;

        return toTrackResult(track, db);
      });
    },

    async getPendingUpload(userId) {
      const db = await readDb(dbPath);
      return db.users[String(userId)]?.pendingUpload ?? null;
    },

    async getUserLocale(userId) {
      const db = await readDb(dbPath);
      return db.users[String(userId)]?.locale ?? null;
    },

    async getRecentUploadCount(userId, windowHours = 24) {
      const db = await readDb(dbPath);
      const cutoff = Date.now() - windowHours * 60 * 60 * 1000;

      return db.tracks.filter((track) => (
        track.uploaderUserId === Number(userId)
        && Date.parse(track.createdAt) >= cutoff
      )).length;
    },

    async getPendingAction(userId) {
      const db = await readDb(dbPath);
      return db.users[String(userId)]?.pendingAction ?? null;
    },

    async getUiPanel(userId) {
      const db = await readDb(dbPath);
      return db.users[String(userId)]?.uiPanel ?? null;
    },

    async getSearchSession(userId) {
      const db = await readDb(dbPath);
      return db.users[String(userId)]?.searchSession ?? null;
    },

    async getUserProfile(userId) {
      const db = await readDb(dbPath);
      const user = db.users[String(userId)] ?? {};
      const stars = deriveCreatorStarsLedger(db, Number(userId), new Date());

      return {
        isBanned: Boolean(user.moderation?.banned),
        starsAvailableXtr: stars.available,
        starsFrozenXtr: stars.frozen,
        starsPendingXtr: stars.pending,
        starsTotalXtr: stars.total,
        supportPaymentsCount: stars.paymentsCount,
        trackCount: db.tracks.filter((track) => track.uploaderUserId === Number(userId)).length,
      };
    },

    async listUserTracks(userId, limit = 20) {
      const db = await readDb(dbPath);

      return db.tracks
        .filter((track) => track.uploaderUserId === Number(userId))
        .slice(0, limit)
        .map((track) => toTrackResult(track, db));
    },

    async lookupTrack(trackId) {
      const db = await readDb(dbPath);
      const track = db.tracks.find((entry) => entry.id === trackId);
      return track ? toTrackResult(track, db) : null;
    },

    async savePendingTitle(userId, title) {
      return mutateDb(async (db) => {
        const pending = db.users[String(userId)]?.pendingUpload;

        if (!pending) {
          return null;
        }

        pending.title = title;
        return pending;
      });
    },

    async updateTrackTitle(userId, trackId, title) {
      return mutateDb(async (db) => {
        const track = db.tracks.find((entry) => entry.id === trackId && entry.uploaderUserId === Number(userId));

        if (!track) {
          return null;
        }

        track.title = title;
        track.searchIndex = buildSearchIndex(title);
        track.updatedAt = new Date().toISOString();

        return toTrackResult(track, db);
      });
    },

    async deleteTrack(trackId) {
      return mutateDb(async (db) => {
        const index = db.tracks.findIndex((entry) => entry.id === trackId);

        if (index === -1) {
          return null;
        }

        const [deletedTrack] = db.tracks.splice(index, 1);
        db.supportIntents = db.supportIntents.filter((entry) => entry.trackId !== trackId);
        db.supportPayments = db.supportPayments.filter((entry) => entry.trackId !== trackId);

        for (const user of Object.values(db.users)) {
          if (Array.isArray(user?.searchSession?.results)) {
            user.searchSession.results = user.searchSession.results.filter((entry) => entry.trackId !== trackId);
          }

          if (Array.isArray(user?.searchSession?.trackIds)) {
            user.searchSession.trackIds = user.searchSession.trackIds.filter((entry) => entry !== trackId);
          }
        }

        return toTrackResult(deletedTrack, db);
      });
    },

    async setSearchSession(userId, session) {
      return mutateDb(async (db) => {
        const user = ensureUserRecord(db, userId);
        user.searchSession = session;
        return user.searchSession;
      });
    },

    async setPendingAction(userId, action) {
      return mutateDb(async (db) => {
        const user = ensureUserRecord(db, userId);
        user.pendingAction = action;
        return user.pendingAction;
      });
    },

    async setUserLocale(userId, locale) {
      return mutateDb(async (db) => {
        const user = ensureUserRecord(db, userId);
        user.locale = locale;
        return user.locale;
      });
    },

    async setUiPanel(userId, panel) {
      return mutateDb(async (db) => {
        const user = ensureUserRecord(db, userId);
        user.uiPanel = panel;
        return user.uiPanel;
      });
    },

    async createStarsSupportIntent({ amountXtr, donorUserId, trackId }) {
      return mutateDb(async (db) => {
        const track = db.tracks.find((entry) => entry.id === trackId);

        if (!track) {
          return null;
        }

        const uploader = db.users[String(track.uploaderUserId)] ?? {};

        if (uploader.moderation?.banned) {
          return null;
        }

        const intentId = randomUUID();
        const payload = `stars:${intentId}`;
        const amount = Math.max(1, Number.parseInt(String(amountXtr), 10) || 0);
        const authorShareXtr = calculateAuthorShare(amount, feeBps);
        const platformShareXtr = amount - authorShareXtr;
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000);

        const intent = {
          amountXtr: amount,
          authorShareXtr,
          authorUserId: track.uploaderUserId,
          createdAt: createdAt.toISOString(),
          donorUserId: Number(donorUserId),
          expiresAt: expiresAt.toISOString(),
          id: intentId,
          payload,
          platformShareXtr,
          status: "created",
          trackId: track.id,
          trackTitle: track.title,
          uploaderName: track.uploaderName,
        };

        db.supportIntents.unshift(intent);
        return intent;
      });
    },

    async getStarsSupportIntent(payload) {
      const db = await readDb(dbPath);
      return db.supportIntents.find((intent) => intent.payload === payload) ?? null;
    },

    async approveStarsSupportIntent(payload, donorUserId) {
      return mutateDb(async (db) => {
        const intent = db.supportIntents.find((entry) => entry.payload === payload);

        if (!isIntentValid(intent, donorUserId)) {
          return null;
        }

        intent.status = "prechecked";
        intent.precheckedAt = new Date().toISOString();
        return intent;
      });
    },

    async completeStarsSupportPayment({
      donorUserId,
      payload,
      providerPaymentChargeId,
      telegramPaymentChargeId,
      totalAmountXtr,
    }) {
      return mutateDb(async (db) => {
        const existing = db.supportPayments.find((payment) => payment.telegramPaymentChargeId === telegramPaymentChargeId);

        if (existing) {
          return existing;
        }

        const intent = db.supportIntents.find((entry) => entry.payload === payload);

        if (!isIntentValid(intent, donorUserId)) {
          return null;
        }

        if (Number(totalAmountXtr) !== Number(intent.amountXtr)) {
          return null;
        }

        const paidAt = new Date();
        const releaseAt = new Date(paidAt.getTime() + starsHoldDays * 24 * 60 * 60 * 1000);
        const payment = {
          amountXtr: intent.amountXtr,
          authorShareXtr: intent.authorShareXtr,
          authorUserId: intent.authorUserId,
          donorUserId: Number(donorUserId),
          id: randomUUID(),
          intentId: intent.id,
          paidAt: paidAt.toISOString(),
          payload,
          platformShareXtr: intent.platformShareXtr,
          providerPaymentChargeId: providerPaymentChargeId ?? "",
          releaseAt: releaseAt.toISOString(),
          status: "successful",
          telegramPaymentChargeId,
          trackId: intent.trackId,
          trackTitle: intent.trackTitle,
          uploaderName: intent.uploaderName,
        };

        intent.status = "paid";
        intent.paidAt = paidAt.toISOString();
        db.supportPayments.unshift(payment);

        return payment;
      });
    },

    async searchTracks(query, limit = 5) {
      const normalizedQuery = normalizeText(query);
      const db = await readDb(dbPath);

      return db.tracks
        .map((track) => ({
          score: scoreTrack(track, normalizedQuery),
          track,
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || Date.parse(right.track.createdAt) - Date.parse(left.track.createdAt))
        .slice(0, limit)
        .map((entry) => toTrackResult(entry.track, db));
    },
  };
}

async function readDb(dbPath) {
  try {
    const raw = await readFile(dbPath, "utf8");
    return normalizeDb(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") {
      await mkdir(dirname(dbPath), { recursive: true });
      await writeFile(dbPath, `${JSON.stringify(EMPTY_DB, null, 2)}\n`, "utf8");
      return structuredClone(EMPTY_DB);
    }

    throw error;
  }
}

function normalizeDb(db) {
  return {
    supportIntents: Array.isArray(db?.supportIntents) ? db.supportIntents : [],
    supportPayments: Array.isArray(db?.supportPayments) ? db.supportPayments : [],
    tracks: Array.isArray(db?.tracks) ? db.tracks : [],
    users: typeof db?.users === "object" && db.users !== null ? db.users : {},
  };
}

function ensureUserRecord(db, userId) {
  db.users[String(userId)] ??= {};
  return db.users[String(userId)];
}

function buildSearchIndex(title) {
  return normalizeText(title);
}

function normalizeText(value) {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTrack(track, query) {
  if (!query) {
    return 0;
  }

  const title = normalizeText(track.title);
  const searchIndex = buildSearchIndex(track.title);

  if (title === query) {
    return 100;
  }

  if (title.startsWith(query)) {
    return 80;
  }

  if (title.includes(query)) {
    return 60;
  }

  if (searchIndex.includes(query)) {
    return 40;
  }

  return 0;
}

function calculateAuthorShare(amountXtr, feeBps) {
  const gross = Number.parseInt(String(amountXtr), 10) || 0;
  return Math.max(0, Math.floor((gross * (10000 - feeBps)) / 10000));
}

function deriveCreatorStarsLedger(db, userId, now) {
  let available = 0;
  let frozen = 0;
  let pending = 0;
  let paymentsCount = 0;
  const isBanned = Boolean(db.users[String(userId)]?.moderation?.banned);

  for (const payment of db.supportPayments) {
    if (payment.authorUserId !== userId || payment.status !== "successful") {
      continue;
    }

    paymentsCount += 1;

    if (isBanned) {
      frozen += payment.authorShareXtr;
      continue;
    }

    if (Date.parse(payment.releaseAt) > now.getTime()) {
      pending += payment.authorShareXtr;
      continue;
    }

    available += payment.authorShareXtr;
  }

  return {
    available,
    frozen,
    paymentsCount,
    pending,
    total: available + pending + frozen,
  };
}

function isIntentValid(intent, donorUserId) {
  if (!intent) {
    return false;
  }

  if (intent.status === "paid" || intent.status === "expired") {
    return false;
  }

  if (intent.donorUserId !== Number(donorUserId)) {
    return false;
  }

  if (Date.parse(intent.expiresAt) <= Date.now()) {
    return false;
  }

  return true;
}

function toTrackResult(track, db) {
  const uploader = db.users[String(track.uploaderUserId)] ?? {};

  return {
    createdAt: track.createdAt,
    durationSeconds: Number(track.durationSeconds ?? 0),
    fileId: track.fileId,
    fileType: track.fileType,
    id: track.id,
    mimeType: track.mimeType,
    sourceChatId: track.sourceChatId ?? null,
    sourceMessageId: track.sourceMessageId ?? null,
    suggestedTitle: track.suggestedTitle ?? "",
    supportsStars: !uploader.moderation?.banned,
    title: track.title,
    uploaderName: track.uploaderName,
    uploaderUserId: track.uploaderUserId,
    uploaderUsername: track.uploaderUsername ?? "",
  };
}
