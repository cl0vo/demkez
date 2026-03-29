import { getBotToken, getPlatformSettings } from "./config.js";
import { createBot } from "./bot.js";
import { createCatalogService } from "./catalog-service.js";
import { createLogger } from "./logger.js";
import { createReplayStore } from "./replay-store.js";

const logger = createLogger();
const platformSettings = getPlatformSettings();
const replayStore = createReplayStore();
const musicService = createCatalogService({
  feeBps: platformSettings.feeBps,
  starsHoldDays: platformSettings.starsHoldDays,
});

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
    { command: "start", description: "Открыть DemoHub" },
    { command: "my", description: "Твои треки" },
    { command: "balance", description: "Stars-баланс" },
    { command: "paysupport", description: "Помощь с оплатой" },
    { command: "rules", description: "Правила DemoHub" },
  ]);
  await logger.log("bot_polling_started", { mode: "polling" });
  await bot.start();
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
