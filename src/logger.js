import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_LOG_PATH = resolve(process.cwd(), ".runtime", "logs", "events.ndjson");

export const noopLogger = {
  async log() {},
};

export function createLogger({ logPath = DEFAULT_LOG_PATH, mirrorToConsole = true } = {}) {
  let dirReadyPromise;

  async function ensureDirReady() {
    dirReadyPromise ??= mkdir(dirname(logPath), { recursive: true });
    await dirReadyPromise;
  }

  return {
    async log(event, payload = {}) {
      const record = {
        event,
        timestamp: new Date().toISOString(),
        ...payload,
      };
      const line = JSON.stringify(record);

      try {
        if (mirrorToConsole) {
          console.log(line);
        }

        await ensureDirReady();
        await appendFile(logPath, `${line}\n`, "utf8");
      } catch (error) {
        console.error("Logger write failed:", error);
      }

      return record;
    },
  };
}

export function serializeError(error) {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
      name: "NonErrorThrown",
      stack: null,
    };
  }

  return {
    message: error.message,
    name: error.name,
    stack: error.stack ?? null,
  };
}
