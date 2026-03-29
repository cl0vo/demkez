import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { isValidTonAddress } from "./ton.js";

const DB_PATH = resolve(process.cwd(), "data", "db.json");
const EMPTY_DB = {
  tracks: [],
  users: {},
};

export function createCatalogService({ dbPath = DB_PATH } = {}) {
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
            fileId: upload.fileId,
            fileName: upload.fileName ?? "",
            fileType: upload.fileType,
            mimeType: upload.mimeType ?? "",
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

    async finalizePendingUpload(userId, donationUrl) {
      return mutateDb(async (db) => {
        const user = db.users[String(userId)] ?? {};
        const pending = user.pendingUpload;

        if (!pending?.title) {
          return null;
        }

        const track = {
          createdAt: new Date().toISOString(),
          donationUrl: donationUrl ?? null,
          fileId: pending.fileId,
          fileName: pending.fileName,
          fileType: pending.fileType,
          id: randomUUID(),
          mimeType: pending.mimeType,
          searchIndex: buildSearchIndex(pending.title, pending.uploaderName, pending.uploaderUsername),
          title: pending.title,
          uploaderName: pending.uploaderName,
          uploaderUserId: Number(userId),
          uploaderUsername: pending.uploaderUsername ?? "",
        };

        db.tracks.unshift(track);
        delete user.pendingUpload;
        db.users[String(userId)] = user;

        return toTrackResult(track);
      });
    },

    async getPendingUpload(userId) {
      const db = await readDb(dbPath);
      return db.users[String(userId)]?.pendingUpload ?? null;
    },

    async getPendingAction(userId) {
      const db = await readDb(dbPath);
      return db.users[String(userId)]?.pendingAction ?? null;
    },

    async getUserProfile(userId) {
      const db = await readDb(dbPath);
      const user = db.users[String(userId)] ?? {};
      const tonAddress = isValidTonAddress(user.tonAddress ?? "") ? user.tonAddress : "";

      return {
        hasTonAddress: Boolean(tonAddress),
        tonAddress,
        trackCount: db.tracks.filter((track) => track.uploaderUserId === Number(userId)).length,
      };
    },

    async listUserTracks(userId, limit = 20) {
      const db = await readDb(dbPath);

      return db.tracks
        .filter((track) => track.uploaderUserId === Number(userId))
        .slice(0, limit)
        .map(toTrackResult);
    },

    async lookupTrack(trackId) {
      const db = await readDb(dbPath);
      const track = db.tracks.find((entry) => entry.id === trackId);
      return track ? toTrackResult(track) : null;
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

    async setPendingAction(userId, action) {
      return mutateDb(async (db) => {
        const user = ensureUserRecord(db, userId);
        user.pendingAction = action;
        return user.pendingAction;
      });
    },

    async setUserTonAddress(userId, tonAddress) {
      return mutateDb(async (db) => {
        const user = ensureUserRecord(db, userId);
        user.tonAddress = tonAddress;
        return user.tonAddress;
      });
    },

    async clearUserTonAddress(userId) {
      return mutateDb(async (db) => {
        const user = ensureUserRecord(db, userId);
        delete user.tonAddress;
        return true;
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
        .map((entry) => toTrackResult(entry.track));
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
    tracks: Array.isArray(db?.tracks) ? db.tracks : [],
    users: typeof db?.users === "object" && db.users !== null ? db.users : {},
  };
}

function ensureUserRecord(db, userId) {
  db.users[String(userId)] ??= {};
  return db.users[String(userId)];
}

function buildSearchIndex(title, uploaderName, uploaderUsername) {
  return normalizeText([title, uploaderName, uploaderUsername].filter(Boolean).join(" "));
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
  const searchIndex = track.searchIndex ?? buildSearchIndex(track.title, track.uploaderName, track.uploaderUsername);

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

function toTrackResult(track) {
  return {
    createdAt: track.createdAt,
    donationUrl: track.donationUrl ?? null,
    fileId: track.fileId,
    fileType: track.fileType,
    id: track.id,
    mimeType: track.mimeType,
    suggestedTitle: track.suggestedTitle ?? "",
    title: track.title,
    uploaderName: track.uploaderName,
    uploaderUserId: track.uploaderUserId,
    uploaderUsername: track.uploaderUsername ?? "",
  };
}
