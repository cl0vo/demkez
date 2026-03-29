import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { serializeError } from "./logger.js";

const DEFAULT_FAILED_REPLAY_DIR = resolve(process.cwd(), ".runtime", "replays", "failed");

export const noopReplayStore = {
  async capture() {
    return null;
  },
};

export function createReplayStore({ failedDir = DEFAULT_FAILED_REPLAY_DIR } = {}) {
  let dirReadyPromise;

  async function ensureDirReady() {
    dirReadyPromise ??= mkdir(failedDir, { recursive: true });
    await dirReadyPromise;
  }

  return {
    async capture(kind, payload) {
      const timestamp = new Date().toISOString();
      const updateId = payload?.context?.updateId ?? "no-update";
      const fileName = sanitizeFileName(`${timestamp}-${kind}-${updateId}.json`);
      const filePath = resolve(failedDir, fileName);
      const snapshot = {
        capturedAt: timestamp,
        context: payload?.context ?? {},
        error: serializeError(payload?.error),
        kind,
        update: payload?.update ?? null,
      };

      try {
        await ensureDirReady();
        await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
        return filePath;
      } catch (error) {
        console.error("Replay snapshot write failed:", error);
        return null;
      }
    },
  };
}

function sanitizeFileName(value) {
  return value.replaceAll(":", "-").replaceAll(/[<>"/\\|?*]/g, "_");
}
