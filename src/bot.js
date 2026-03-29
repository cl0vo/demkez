import { Bot, GrammyError, HttpError } from "grammy";

import { createHandlers, getContextMeta } from "./handlers.js";
import { serializeError } from "./logger.js";

export function createBot({ token, musicService, logger, platformSettings, replayStore }) {
  const bot = new Bot(token);
  const handlers = createHandlers({ logger, musicService, platformSettings, replayStore });

  bot.command("start", async (ctx) => {
    await handlers.handleStart(ctx);
  });

  bot.command("my", async (ctx) => {
    await handlers.handleMyTracks(ctx);
  });

  bot.command("balance", async (ctx) => {
    await handlers.handleBalance(ctx);
  });

  bot.command("paysupport", async (ctx) => {
    await handlers.handlePaySupport(ctx);
  });

  bot.on("message:successful_payment", async (ctx) => {
    await handlers.handleSuccessfulPayment(ctx);
  });

  bot.preCheckoutQuery(/^stars:/, async (ctx) => {
    await handlers.handlePreCheckout(ctx);
  });

  bot.on("message:text", async (ctx) => {
    await handlers.handleTextMessage(ctx);
  });

  bot.on(["message:audio", "message:photo", "message:video", "message:voice", "message:sticker", "message:document"], async (ctx) => {
    await handlers.handleNonTextMessage(ctx);
  });

  bot.callbackQuery(/^pick:(.+)$/, async (ctx) => {
    await handlers.handlePickCallback(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^cabtrack:(.+)$/, async (ctx) => {
    await handlers.handleCabinetTrackCallback(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^starspay:(.+):(\d+)$/, async (ctx) => {
    await handlers.handleStarsAmountCallback(ctx, ctx.match[1], Number.parseInt(ctx.match[2], 10));
  });

  bot.callbackQuery(/^upload:title:use$/, async (ctx) => {
    await handlers.handleUseSuggestedTitle(ctx);
  });

  bot.callbackQuery(/^upload:donation:skip$/, async (ctx) => {
    await handlers.handleSkipDonation(ctx);
  });

  bot.callbackQuery(/^upload:cancel$/, async (ctx) => {
    await handlers.handleCancelUpload(ctx);
  });

  bot.callbackQuery(/^menu:(home|search|upload|cabinet)$/, async (ctx) => {
    await handlers.handleMenuCallback(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^cab:(tracks|balance)$/, async (ctx) => {
    await handlers.handleCabinetCallback(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^donate:(.+)$/, async (ctx) => {
    await handlers.handleDonateCallback(ctx, ctx.match[1]);
  });

  bot.catch(async (error) => {
    const meta = getContextMeta(error.ctx);
    const replayPath = await replayStore.capture("update_unhandled", {
      context: meta,
      error: error.error,
      update: error.ctx?.update,
    });

    await logger.log("update_unhandled", {
      ...meta,
      error: serializeError(error.error),
      replayPath,
    });

    if (error.error instanceof GrammyError) {
      console.error("Telegram API error:", error.error.description);
      return;
    }

    if (error.error instanceof HttpError) {
      console.error("Network error:", error.error);
      return;
    }

    console.error("Unhandled bot error:", error.error);
  });

  return bot;
}
