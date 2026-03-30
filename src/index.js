import { getBotToken, getPlatformSettings } from "./config.js";
import { createBot } from "./bot.js";
import { createCatalogService } from "./catalog-service.js";
import { isMainModule, startBotRuntime } from "./bootstrap.js";
import { createExternalSearchService } from "./external-search-service.js";
import { createLogger, serializeError } from "./logger.js";
import { createReplayStore } from "./replay-store.js";

const logger = createLogger();
const platformSettings = getPlatformSettings();
const replayStore = createReplayStore();
const musicService = createCatalogService({
  feeBps: platformSettings.feeBps,
  starsHoldDays: platformSettings.starsHoldDays,
});
const previewSearchService = createExternalSearchService({
  requestTimeoutMs: platformSettings.externalSearchTimeoutMs,
});

const bot = createBot({
  token: getBotToken(),
  logger,
  previewSearchService,
  replayStore,
  musicService,
  platformSettings,
});

export async function bootstrap() {
  await startBotRuntime({
    bot,
    logger,
    platformSettings,
  });
}

if (isMainModule(import.meta.url)) {
  bootstrap().catch(async (error) => {
    await logger.log("bot_bootstrap_failed", {
      error: serializeError(error),
    });
    console.error(error);
    process.exitCode = 1;
  });
}
