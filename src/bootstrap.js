import { pathToFileURL } from "node:url";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, getCommandDescriptions } from "./messages.js";
import { serializeError } from "./logger.js";

export const BOT_ALLOWED_UPDATES = ["message", "callback_query", "pre_checkout_query"];

export async function startBotRuntime({
  bot,
  logger,
  platformSettings,
  processRef = process,
} = {}) {
  installProcessHandlers({ bot, logger, processRef });
  await logger.log("bot_starting", { mode: "polling" });

  try {
    await syncBotCommands(bot, logger, platformSettings);
  } catch (error) {
    await logger.log("bot_command_sync_failed", {
      error: serializeError(error),
    });
  }

  await logger.log("bot_polling_started", { mode: "polling" });
  await bot.start({
    allowed_updates: BOT_ALLOWED_UPDATES,
  });
}

export async function syncBotCommands(bot, logger, platformSettings = {}) {
  const attempts = Math.max(1, Number(platformSettings.commandSyncRetryCount) || 1);
  const delayMs = Math.max(250, Number(platformSettings.commandSyncRetryDelayMs) || 2500);
  const locales = [DEFAULT_LOCALE, ...SUPPORTED_LOCALES.map((entry) => entry.code).filter((code) => code !== DEFAULT_LOCALE)];

  for (const locale of locales) {
    const commands = getCommandDescriptions(locale);
    const payload = [
      { command: "start", description: commands.start },
      { command: "my", description: commands.my },
      { command: "balance", description: commands.balance },
      { command: "language", description: commands.language },
      { command: "paysupport", description: commands.paysupport },
      { command: "rules", description: commands.rules },
    ];
    const options = locale === DEFAULT_LOCALE ? undefined : { language_code: locale };

    await retryAsync(() => bot.api.setMyCommands(payload, options), {
      attempts,
      delayMs,
      onRetry: async (error, attempt) => {
        await logger.log("bot_command_sync_retry", {
          attempt,
          error: serializeError(error),
          locale,
        });
      },
    });
  }
}

export function installProcessHandlers({ bot, logger, processRef = process } = {}) {
  let stopping = false;

  const shutdown = async (signal, error = null) => {
    if (stopping) {
      return;
    }

    stopping = true;

    if (error) {
      await logger.log("process_uncaught_exception", {
        error: serializeError(error),
      });
    }

    if (signal) {
      await logger.log("bot_stopping", { signal });
    }

    try {
      await bot.stop();
    } catch (stopError) {
      await logger.log("bot_stop_failed", {
        error: serializeError(stopError),
        signal,
      });
    }
  };

  processRef.on("unhandledRejection", (reason) => {
    void logger.log("process_unhandled_rejection", {
      error: serializeError(reason),
    });
  });

  processRef.on("uncaughtException", (error) => {
    void shutdown("uncaughtException", error).finally(() => {
      processRef.exitCode = 1;
      processRef.exit?.(1);
    });
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    processRef.once(signal, () => {
      void shutdown(signal).finally(() => {
        processRef.exitCode = 0;
        processRef.exit?.(0);
      });
    });
  }
}

export function isMainModule(metaUrl, argv = process.argv) {
  return Boolean(argv?.[1]) && metaUrl === pathToFileURL(argv[1]).href;
}

async function retryAsync(task, { attempts, delayMs, onRetry }) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;

      if (attempt >= attempts) {
        throw error;
      }

      await onRetry?.(error, attempt);
      await delay(delayMs);
    }
  }

  throw lastError ?? new Error("Retry attempts exhausted");
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
