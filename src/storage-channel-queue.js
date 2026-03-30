import { noopLogger } from "./logger.js";

const DEFAULT_MIN_INTERVAL_MS = 1250;
const DEFAULT_MAX_RETRIES = 3;

export function createStorageChannelQueue({
  logger = noopLogger,
  maxRetries = DEFAULT_MAX_RETRIES,
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
} = {}) {
  let tail = Promise.resolve();
  let nextReadyAt = 0;

  return {
    async schedule(task, meta = {}) {
      const job = tail.catch(() => undefined).then(async () => {
        const waitMs = Math.max(0, nextReadyAt - Date.now());

        if (waitMs > 0) {
          await sleep(waitMs);
        }

        const result = await runWithRetry(task, meta, {
          logger,
          maxRetries,
        });

        nextReadyAt = Date.now() + Math.max(0, minIntervalMs);
        return result;
      });

      tail = job.then(() => undefined, () => undefined);
      return job;
    },
  };
}

async function runWithRetry(task, meta, { logger, maxRetries }) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      const retryAfterMs = getRetryAfterMs(error);

      if (retryAfterMs <= 0 || attempt >= maxRetries) {
        throw error;
      }

      await logger.log("storage_copy_rate_limited", {
        ...meta,
        attempt: attempt + 1,
        retryAfterMs,
      });
      await sleep(retryAfterMs);
    }
  }

  return task();
}

function getRetryAfterMs(error) {
  const retryAfterSeconds = Number(
    error?.parameters?.retry_after
    ?? error?.error?.parameters?.retry_after
    ?? Number.NaN,
  );

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  const description = String(error?.description ?? error?.message ?? "");
  const match = /retry after\s+(\d+)/i.exec(description);

  if (!match) {
    return 0;
  }

  const parsedSeconds = Number.parseInt(match[1], 10);
  return Number.isFinite(parsedSeconds) && parsedSeconds > 0 ? parsedSeconds * 1000 : 0;
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
