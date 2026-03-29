import { getBotToken, getPlatformSettings } from "./config.js";
import { createBot } from "./bot.js";
import { createCatalogService } from "./catalog-service.js";
import { createLogger } from "./logger.js";
import { createReplayStore } from "./replay-store.js";

const logger = createLogger();
const platformSettings = getPlatformSettings();
const replayStore = createReplayStore();
const musicService = createCatalogService();

const bot = createBot({
  token: getBotToken(),
  logger,
  replayStore,
  musicService,
  platformSettings,
});

async function bootstrap() {
  await logger.log("bot_starting", { mode: "polling" });
  await bot.api.setMyCommands([
    { command: "start", description: "Начать" },
    { command: "my", description: "Мои треки" },
  ]);
  await logger.log("bot_polling_started", { mode: "polling" });
  await bot.start();
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
