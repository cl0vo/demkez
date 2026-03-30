import { getBotToken, getPlatformSettings } from "./config.js";
import { createBot } from "./bot.js";
import { createCatalogService } from "./catalog-service.js";
import { createExternalSearchService } from "./external-search-service.js";
import { createLogger } from "./logger.js";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, getCommandDescriptions } from "./messages.js";
import { createReplayStore } from "./replay-store.js";

const logger = createLogger();
const platformSettings = getPlatformSettings();
const replayStore = createReplayStore();
const musicService = createCatalogService({
  feeBps: platformSettings.feeBps,
  starsHoldDays: platformSettings.starsHoldDays,
});
const previewSearchService = createExternalSearchService();

const bot = createBot({
  token: getBotToken(),
  logger,
  previewSearchService,
  replayStore,
  musicService,
  platformSettings,
});

async function bootstrap() {
  await logger.log("bot_starting", { mode: "polling" });
  const defaultCommands = getCommandDescriptions(DEFAULT_LOCALE);
  await bot.api.setMyCommands([
    { command: "start", description: defaultCommands.start },
    { command: "my", description: defaultCommands.my },
    { command: "balance", description: defaultCommands.balance },
    { command: "language", description: defaultCommands.language },
    { command: "paysupport", description: defaultCommands.paysupport },
    { command: "rules", description: defaultCommands.rules },
  ]);

  for (const locale of SUPPORTED_LOCALES.map((entry) => entry.code).filter((code) => code !== DEFAULT_LOCALE)) {
    const commands = getCommandDescriptions(locale);

    await bot.api.setMyCommands([
      { command: "start", description: commands.start },
      { command: "my", description: commands.my },
      { command: "balance", description: commands.balance },
      { command: "language", description: commands.language },
      { command: "paysupport", description: commands.paysupport },
      { command: "rules", description: commands.rules },
    ], {
      language_code: locale,
    });
  }
  await logger.log("bot_polling_started", { mode: "polling" });
  await bot.start();
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
