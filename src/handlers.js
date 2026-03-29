import { InlineKeyboard } from "grammy";

import {
  SEARCH_BUTTON_PROMPT,
  EMPTY_QUERY_PROMPT,
  EMPTY_RESULTS_PROMPT,
  LOOKUP_ERROR_PROMPT,
  MY_TRACKS_EMPTY_PROMPT,
  MY_TRACKS_TITLE,
  NON_TEXT_PROMPT,
  SEARCH_ERROR_PROMPT,
  SEARCH_RESULTS_PROMPT,
  SENT_TRACK_PROMPT,
  START_PROMPT,
  STARS_INVOICE_EXPIRED_PROMPT,
  STARS_SUPPORT_UNAVAILABLE_PROMPT,
  TRACK_OPENED_PROMPT,
  TRACK_SUPPORT_INVOICE_TITLE,
  TITLE_SUGGESTION_SAVED_PROMPT,
  UPLOAD_DONE_PROMPT,
  UPLOAD_MENU_PROMPT,
  UPLOAD_ONLY_MP3_PROMPT,
  UPLOAD_TITLE_PROMPT,
  formatCabinetMessage,
  formatPaySupportMessage,
  formatRulesMessage,
  formatStarsBalanceMessage,
  formatStarsPaymentSuccessMessage,
  formatStarsSupportMessage,
  formatTrackButton,
  formatTrackCaption,
  formatUploadDailyLimitMessage,
  formatUploadTooLargeMessage,
  formatUploadTitlePrompt,
  formatWithdrawMessage,
  formatWithdrawRequestMessage,
  normalizeQuery,
} from "./messages.js";
import { noopLogger, serializeError } from "./logger.js";
import { noopReplayStore } from "./replay-store.js";

const HOME_LABEL = "🏠 Главная";
const BACK_LABEL = "← Назад";
const SEARCH_LABEL = "🔎 Поиск";
const SEARCH_NEW_LABEL = "🎧 Новый поиск";
const UPLOAD_LABEL = "⬆️ Загрузить mp3";
const CABINET_LABEL = "👤 Кабинет";
const TRACKS_LABEL = "🎵 Мои треки";
const WITHDRAW_LABEL = "💸 Вывод";
const REQUEST_WITHDRAW_LABEL = "✉️ Запросить вывод";
const CANCEL_UPLOAD_LABEL = "✖️ Отменить";
const HTML_MODE = "HTML";
const SEARCH_PAGE_SIZE = 8;
const SEARCH_RESULT_LIMIT = 96;

export function createHandlers({
  musicService,
  logger = noopLogger,
  platformSettings = { feeBps: 300, feePercentLabel: "3%", starsHoldDays: 7, starsSupportAmounts: [10, 25, 50], withdrawMinStars: 100 },
  replayStore = noopReplayStore,
}) {
  return {
    async handleStart(ctx) {
      const meta = getContextMeta(ctx);

      await resetPendingState(musicService, meta.userId);
      await logger.log("start_received", meta);
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createHomeKeyboard(),
        text: START_PROMPT,
      });
      await logger.log("start_replied", meta);
    },

    async handleMyTracks(ctx) {
      const meta = getContextMeta(ctx);
      await resetPendingState(musicService, meta.userId);
      await openCabinetReply(ctx, musicService, logger, platformSettings);
    },

    async handleBalance(ctx) {
      const meta = getContextMeta(ctx);
      const profile = meta.userId ? await musicService.getUserProfile(meta.userId) : emptyProfile();

      await logger.log("balance_requested", {
        ...meta,
        starsAvailableXtr: profile.starsAvailableXtr,
      });

      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createWithdrawKeyboard(profile, platformSettings),
        text: formatStarsBalanceMessage(profile, platformSettings),
      });
    },

    async handlePaySupport(ctx) {
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createInfoKeyboard(),
        text: formatPaySupportMessage(platformSettings),
      });
    },

    async handleRules(ctx) {
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createInfoKeyboard(),
        text: formatRulesMessage(platformSettings),
      });
    },

    async handleTextMessage(ctx) {
      const meta = getContextMeta(ctx);
      const rawText = ctx.message?.text ?? "";

      if (rawText.startsWith("/")) {
        if (isStartCommandText(rawText) || isMyCommandText(rawText) || isBalanceCommandText(rawText) || isPaySupportCommandText(rawText) || isRulesCommandText(rawText)) {
          return;
        }

        await logger.log("command_redirected", {
          ...meta,
          command: rawText,
        });
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createHomeKeyboard(),
          text: START_PROMPT,
        });
        return;
      }

      const pendingUpload = meta.userId ? await musicService.getPendingUpload(meta.userId) : null;

      if (pendingUpload) {
        await handlePendingUploadText(ctx, meta, rawText, pendingUpload, musicService, logger);
        return;
      }

      const query = normalizeQuery(rawText);

      if (!query) {
        await logger.log("empty_query_received", meta);
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createSearchPromptKeyboard(),
          text: EMPTY_QUERY_PROMPT,
        });
        return;
      }

      await logger.log("search_requested", {
        ...meta,
        query,
      });

      try {
        if (ctx.chat?.id) {
          await ctx.api.sendChatAction(ctx.chat.id, "typing");
        }

        const tracks = await musicService.searchTracks(query, SEARCH_RESULT_LIMIT);

        if (tracks.length === 0) {
          await logger.log("search_empty", {
            ...meta,
            query,
          });
          await showPanel(ctx, musicService, {
            parseMode: HTML_MODE,
            replyMarkup: createSearchPromptKeyboard(),
            text: EMPTY_RESULTS_PROMPT,
          });
          return;
        }

        await musicService.setSearchSession(meta.userId, {
          createdAt: new Date().toISOString(),
          page: 0,
          query,
          trackIds: tracks.map((track) => track.id),
        });

        await renderSearchResultsPanel(ctx, musicService, meta.userId, 0);

        await logger.log("search_results_rendered", {
          ...meta,
          query,
          resultsCount: tracks.length,
          trackIds: tracks.map((track) => track.id),
        });
      } catch (error) {
        const replayPath = await replayStore.capture("search_failed", {
          context: {
            ...meta,
            query,
          },
          error,
          update: ctx.update,
        });

        await logger.log("search_failed", {
          ...meta,
          query,
          error: serializeError(error),
          replayPath,
        });

        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createSearchPromptKeyboard(),
          text: SEARCH_ERROR_PROMPT,
        });
      }
    },

    async handleNonTextMessage(ctx) {
      const upload = extractUploadFromMessage(ctx.message);
      const meta = getContextMeta(ctx);

      if (!upload) {
        await logger.log("non_text_received", meta);
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createHomeKeyboard(),
          text: NON_TEXT_PROMPT,
        });
        return;
      }

      const titleFromCaption = normalizeQuery(ctx.message?.caption ?? "");
      const suggestedTitle = titleFromCaption || buildSuggestedTitle(ctx.message, upload.fileName);

      await logger.log("upload_received", {
        ...meta,
        fileType: upload.fileType,
        sizeBytes: upload.sizeBytes,
        suggestedTitle,
      });

      if (upload.sizeBytes > platformSettings.uploadMaxBytes) {
        await logger.log("upload_rejected_size", {
          ...meta,
          sizeBytes: upload.sizeBytes,
        });
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createUploadPromptKeyboard(),
          text: formatUploadTooLargeMessage(platformSettings),
        });
        return;
      }

      const recentUploads = await musicService.getRecentUploadCount(meta.userId, platformSettings.uploadWindowHours);

      if (recentUploads >= platformSettings.uploadDailyLimit) {
        await logger.log("upload_rejected_daily_limit", {
          ...meta,
          recentUploads,
        });
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createHomeKeyboard(),
          text: formatUploadDailyLimitMessage(platformSettings),
        });
        return;
      }

      await musicService.beginUpload({
        ...upload,
        suggestedTitle,
        title: titleFromCaption || "",
        userId: meta.userId,
        uploaderName: getUploaderName(ctx),
        uploaderUsername: ctx.from?.username ?? "",
      });

      if (titleFromCaption) {
        await logger.log("upload_title_saved", {
          ...meta,
          title: titleFromCaption,
        });
        const track = await musicService.finalizePendingUpload(meta.userId);
        await logger.log("upload_completed", {
          ...meta,
          trackId: track?.id ?? null,
          via: "caption",
        });
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createHomeKeyboard(),
          text: UPLOAD_DONE_PROMPT,
        });
        return;
      }

      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createUploadTitleKeyboard(suggestedTitle),
        text: formatUploadTitlePrompt(suggestedTitle),
      });
    },

    async handlePickCallback(ctx, trackId) {
      const meta = getContextMeta(ctx);

      await logger.log("selection_requested", {
        ...meta,
        trackId,
      });

      await ctx.answerCallbackQuery();

      try {
        const track = await enrichTrack(await musicService.lookupTrack(trackId), musicService);

        if (!track) {
          await logger.log("selection_missing", {
            ...meta,
            trackId,
          });
          await ctx.editMessageText(LOOKUP_ERROR_PROMPT, {
            reply_markup: createHomeKeyboard(),
          });
          return;
        }

        await sendStoredTrack(ctx, track, {
          includeFollowUp: false,
          logger,
          musicService,
          platformSettings,
          viewerUserId: meta.userId,
        });
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createInfoKeyboard(),
          text: TRACK_OPENED_PROMPT,
        });

        await logger.log("selection_completed", {
          ...meta,
          supportsStars: Boolean(track.supportsStars),
          trackId,
        });
      } catch (error) {
        const replayPath = await replayStore.capture("selection_failed", {
          context: {
            ...meta,
            trackId,
          },
          error,
          update: ctx.update,
        });

        await logger.log("selection_failed", {
          ...meta,
          trackId,
          error: serializeError(error),
          replayPath,
        });

        await ctx.editMessageText(LOOKUP_ERROR_PROMPT, {
          reply_markup: createHomeKeyboard(),
        });
      }
    },

    async handleCabinetTrackCallback(ctx, trackId) {
      const meta = getContextMeta(ctx);

      await logger.log("cabinet_track_requested", {
        ...meta,
        trackId,
      });

      await ctx.answerCallbackQuery();

      try {
        const track = await enrichTrack(await musicService.lookupTrack(trackId), musicService);

        if (!track) {
          await logger.log("cabinet_track_missing", {
            ...meta,
            trackId,
          });
          await ctx.reply(LOOKUP_ERROR_PROMPT, {
            reply_markup: createInfoKeyboard(),
          });
          return;
        }

        await sendStoredTrack(ctx, track, {
          includeFollowUp: false,
          logger,
          musicService,
          platformSettings,
          viewerUserId: meta.userId,
        });
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createInfoKeyboard(),
          text: TRACK_OPENED_PROMPT,
        });

        await logger.log("cabinet_track_completed", {
          ...meta,
          trackId,
        });
      } catch (error) {
        const replayPath = await replayStore.capture("cabinet_track_failed", {
          context: {
            ...meta,
            trackId,
          },
          error,
          update: ctx.update,
        });

        await logger.log("cabinet_track_failed", {
          ...meta,
          trackId,
          error: serializeError(error),
          replayPath,
        });

        await ctx.reply(LOOKUP_ERROR_PROMPT, {
          reply_markup: createInfoKeyboard(),
        });
      }
    },

    async handleUseSuggestedTitle(ctx) {
      const meta = getContextMeta(ctx);
      const pendingUpload = meta.userId ? await musicService.getPendingUpload(meta.userId) : null;
      const suggestedTitle = pendingUpload?.suggestedTitle ?? "";

      await ctx.answerCallbackQuery();

      if (!pendingUpload || !suggestedTitle) {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createUploadTitleKeyboard(""),
          text: UPLOAD_TITLE_PROMPT,
        });
        return;
      }

      await musicService.savePendingTitle(meta.userId, suggestedTitle);

      await logger.log("upload_title_saved", {
        ...meta,
        title: suggestedTitle,
        via: "suggestion",
      });

      const track = await musicService.finalizePendingUpload(meta.userId);
      await logger.log("upload_completed", {
        ...meta,
        trackId: track?.id ?? null,
        via: "suggestion",
      });
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createHomeKeyboard(),
        text: TITLE_SUGGESTION_SAVED_PROMPT,
      });
    },

    async handleSkipDonation(ctx) {
      await ctx.answerCallbackQuery();
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createHomeKeyboard(),
        text: UPLOAD_DONE_PROMPT,
      });
    },

    async handleCancelUpload(ctx) {
      const meta = getContextMeta(ctx);

      await ctx.answerCallbackQuery();
      await musicService.clearPendingUpload(meta.userId);
      await logger.log("upload_cancelled", meta);
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createHomeKeyboard(),
        text: START_PROMPT,
      });
    },

    async handleMenuCallback(ctx, action) {
      const meta = getContextMeta(ctx);

      await ctx.answerCallbackQuery();
      await resetPendingState(musicService, meta.userId);

      if (action === "home") {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createHomeKeyboard(),
          text: START_PROMPT,
        });
        return;
      }

      if (action === "search") {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createSearchPromptKeyboard(),
          text: SEARCH_BUTTON_PROMPT,
        });
        return;
      }

      if (action === "upload") {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createUploadPromptKeyboard(),
          text: UPLOAD_MENU_PROMPT,
        });
        return;
      }

      if (action === "cabinet") {
        await openCabinetEdit(ctx, musicService, logger, platformSettings);
      }
    },

    async handleCabinetCallback(ctx, action) {
      const meta = getContextMeta(ctx);
      const profile = meta.userId ? await musicService.getUserProfile(meta.userId) : emptyProfile();

      await ctx.answerCallbackQuery();

      if (action === "tracks") {
        const tracks = await musicService.listUserTracks(meta.userId, 20);
        const text = tracks.length === 0 ? MY_TRACKS_EMPTY_PROMPT : MY_TRACKS_TITLE;

        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createCabinetTracksKeyboard(tracks),
          text,
        });
        return;
      }

      if (action === "withdraw") {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createWithdrawKeyboard(profile, platformSettings),
          text: formatWithdrawMessage(profile, platformSettings),
        });
        return;
      }
    },

    async handleSearchPageCallback(ctx, page) {
      const meta = getContextMeta(ctx);

      await ctx.answerCallbackQuery();

      const session = meta.userId ? await musicService.getSearchSession(meta.userId) : null;

      if (!session?.trackIds?.length) {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createSearchPromptKeyboard(),
          text: SEARCH_BUTTON_PROMPT,
        });
        return;
      }

      await renderSearchResultsPanel(ctx, musicService, meta.userId, page);
    },

    async handleWithdrawRequest(ctx) {
      await ctx.answerCallbackQuery();
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createWithdrawBackKeyboard(),
        text: formatWithdrawRequestMessage(platformSettings),
      });
    },

    async handleDonateCallback(ctx, trackId) {
      const meta = getContextMeta(ctx);
      const track = await enrichTrack(await musicService.lookupTrack(trackId), musicService);

      await ctx.answerCallbackQuery();

      if (!track?.supportsStars) {
        await ctx.reply(STARS_SUPPORT_UNAVAILABLE_PROMPT, {
          reply_markup: createInfoKeyboard(),
        });
        return;
      }

      await logger.log("stars_support_opened", {
        ...meta,
        trackId,
      });
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createStarsAmountKeyboard(trackId, platformSettings.starsSupportAmounts),
        text: formatStarsSupportMessage(track, platformSettings),
      });
    },

    async handleStarsAmountCallback(ctx, trackId, amountXtr) {
      const meta = getContextMeta(ctx);
      const track = await enrichTrack(await musicService.lookupTrack(trackId), musicService);

      await ctx.answerCallbackQuery();

      if (!track?.supportsStars) {
        await ctx.reply(STARS_SUPPORT_UNAVAILABLE_PROMPT, {
          reply_markup: createInfoKeyboard(),
        });
        return;
      }

      const intent = await musicService.createStarsSupportIntent({
        amountXtr,
        donorUserId: meta.userId,
        trackId,
      });

      if (!intent) {
        await ctx.reply(STARS_SUPPORT_UNAVAILABLE_PROMPT, {
          reply_markup: createInfoKeyboard(),
        });
        return;
      }

      await logger.log("stars_invoice_created", {
        ...meta,
        amountXtr,
        payload: intent.payload,
        trackId,
      });

      await ctx.replyWithInvoice(
        TRACK_SUPPORT_INVOICE_TITLE,
        `${track.title} | ${track.uploaderName}`,
        intent.payload,
        "XTR",
        [{ amount: intent.amountXtr, label: `${intent.amountXtr} XTR` }],
        {
          start_parameter: `support_${trackId.slice(0, 12)}`,
        },
      );
    },

    async handlePreCheckout(ctx) {
      const meta = getContextMeta(ctx);
      const payload = ctx.preCheckoutQuery?.invoice_payload ?? "";
      const intent = await musicService.approveStarsSupportIntent(payload, meta.userId);

      if (!intent) {
        await logger.log("stars_precheckout_rejected", {
          ...meta,
          payload,
        });
        await ctx.answerPreCheckoutQuery(false, STARS_INVOICE_EXPIRED_PROMPT);
        return;
      }

      await logger.log("stars_precheckout_approved", {
        ...meta,
        payload,
      });
      await ctx.answerPreCheckoutQuery(true);
    },

    async handleSuccessfulPayment(ctx) {
      const meta = getContextMeta(ctx);
      const payment = ctx.message?.successful_payment;

      if (!payment) {
        return;
      }

      const savedPayment = await musicService.completeStarsSupportPayment({
        donorUserId: meta.userId,
        payload: payment.invoice_payload,
        providerPaymentChargeId: payment.provider_payment_charge_id,
        telegramPaymentChargeId: payment.telegram_payment_charge_id,
        totalAmountXtr: payment.total_amount,
      });

      if (!savedPayment) {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createInfoKeyboard(),
          text: STARS_INVOICE_EXPIRED_PROMPT,
        });
        return;
      }

      await logger.log("stars_payment_completed", {
        ...meta,
        amountXtr: savedPayment.amountXtr,
        authorShareXtr: savedPayment.authorShareXtr,
        payload: payment.invoice_payload,
        platformShareXtr: savedPayment.platformShareXtr,
        telegramPaymentChargeId: payment.telegram_payment_charge_id,
        trackId: savedPayment.trackId,
      });

      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createInfoKeyboard(),
        text: formatStarsPaymentSuccessMessage(savedPayment),
      });
    },
  };
}

function isStartCommandText(text) {
  return /^\/start(?:@\w+)?(?:\s|$)/i.test(text);
}

function isMyCommandText(text) {
  return /^\/my(?:@\w+)?(?:\s|$)/i.test(text);
}

function isBalanceCommandText(text) {
  return /^\/balance(?:@\w+)?(?:\s|$)/i.test(text);
}

function isPaySupportCommandText(text) {
  return /^\/paysupport(?:@\w+)?(?:\s|$)/i.test(text);
}

function isRulesCommandText(text) {
  return /^\/rules(?:@\w+)?(?:\s|$)/i.test(text);
}

async function handlePendingUploadText(ctx, meta, rawText, pendingUpload, musicService, logger) {
  const normalized = normalizeQuery(rawText);

  if (!pendingUpload.title) {
    if (!normalized) {
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createUploadTitleKeyboard(pendingUpload.suggestedTitle ?? ""),
        text: formatUploadTitlePrompt(pendingUpload.suggestedTitle ?? ""),
      });
      return;
    }

    await musicService.savePendingTitle(meta.userId, normalized);
    await logger.log("upload_title_saved", {
      ...meta,
      title: normalized,
    });
    const track = await musicService.finalizePendingUpload(meta.userId);

    if (!track) {
      await ctx.reply(UPLOAD_ONLY_MP3_PROMPT, {
        reply_markup: createUploadPromptKeyboard(),
      });
      return;
    }

    await logger.log("upload_completed", {
      ...meta,
      trackId: track.id,
    });
    await showPanel(ctx, musicService, {
      parseMode: HTML_MODE,
      replyMarkup: createHomeKeyboard(),
      text: UPLOAD_DONE_PROMPT,
    });
    return;
  }
}

async function resetPendingState(musicService, userId) {
  if (!userId) {
    return;
  }

  await musicService.clearPendingAction(userId);
  await musicService.clearPendingUpload(userId);
}

async function showPanel(ctx, musicService, { text, replyMarkup, parseMode = HTML_MODE }) {
  const meta = getContextMeta(ctx);
  const currentMessageId = ctx.callbackQuery?.message?.message_id ?? null;

  if (currentMessageId) {
    try {
      await ctx.editMessageText(text, {
        parse_mode: parseMode,
        reply_markup: replyMarkup,
      });
    } catch (error) {
      if (!isMessageNotModifiedError(error)) {
        throw error;
      }
    }

    if (meta.userId && meta.chatId) {
      await musicService.setUiPanel(meta.userId, {
        chatId: meta.chatId,
        messageId: currentMessageId,
      });
    }

    return currentMessageId;
  }

  await clearPreviousPanel(ctx, musicService, meta);

  const message = await ctx.reply(text, {
    parse_mode: parseMode,
    reply_markup: replyMarkup,
  });

  if (meta.userId && meta.chatId) {
    await musicService.setUiPanel(meta.userId, {
      chatId: meta.chatId,
      messageId: message.message_id,
    });
  }

  return message.message_id;
}

async function clearPreviousPanel(ctx, musicService, meta) {
  if (!meta.userId || !meta.chatId) {
    return;
  }

  const panel = await musicService.getUiPanel(meta.userId);

  if (!panel || panel.chatId !== meta.chatId) {
    return;
  }

  try {
    await ctx.api.deleteMessage(panel.chatId, panel.messageId);
  } catch {
    // Ignore stale or already deleted panel messages.
  }

  await musicService.clearUiPanel(meta.userId);
}

function isMessageNotModifiedError(error) {
  return String(error?.description ?? error?.message ?? "").includes("message is not modified");
}

function extractUploadFromMessage(message) {
  if (message?.audio) {
    return {
      fileId: message.audio.file_id,
      fileName: message.audio.file_name ?? "",
      sizeBytes: Number(message.audio.file_size ?? 0),
      durationSeconds: Number(message.audio.duration ?? 0),
      fileType: "audio",
      mimeType: message.audio.mime_type ?? "",
    };
  }

  if (message?.document?.mime_type === "audio/mpeg") {
    return {
      fileId: message.document.file_id,
      fileName: message.document.file_name ?? "",
      sizeBytes: Number(message.document.file_size ?? 0),
      durationSeconds: 0,
      fileType: "document",
      mimeType: message.document.mime_type ?? "",
    };
  }

  return null;
}

function getUploaderName(ctx) {
  return ctx.from?.username
    ? `@${ctx.from.username}`
    : [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ").trim() || "Unknown";
}

function buildSuggestedTitle(message, fileName) {
  const performer = normalizeQuery(message?.audio?.performer ?? "");
  const title = normalizeQuery(message?.audio?.title ?? "");

  if (performer && title) {
    return `${performer} - ${title}`;
  }

  if (title) {
    return title;
  }

  const baseName = normalizeQuery(
    String(fileName ?? "")
      .replace(/\.[^.]+$/, "")
      .replace(/[_]+/g, " ")
      .replace(/\s*-\s*/g, " - "),
  );

  return baseName || "";
}

async function enrichTrack(track, musicService) {
  if (!track) {
    return null;
  }

  const profile = await musicService.getUserProfile(track.uploaderUserId);
  return {
    ...track,
    supportsStars: !profile.isBanned && track.supportsStars !== false,
  };
}

async function sendStoredTrack(ctx, track, options = {}) {
  const {
    includeFollowUp = false,
    logger = noopLogger,
    musicService,
    platformSettings = { feeBps: 300, feePercentLabel: "3%", starsHoldDays: 7, starsSupportAmounts: [10, 25, 50], withdrawMinStars: 100 },
    viewerUserId = null,
  } = options;
  const supportLink = await createTrackAudioSupportLink(ctx, {
    logger,
    musicService,
    platformSettings,
    track,
    viewerUserId,
  });
  const caption = formatTrackCaption(track, supportLink);
  const commonOptions = {
    caption,
    parse_mode: "HTML",
  };

  if (track.fileType === "document") {
    await ctx.replyWithDocument(track.fileId, commonOptions);
  } else {
    await ctx.replyWithAudio(track.fileId, commonOptions);
  }

  if (includeFollowUp) {
    await showPanel(ctx, musicService, {
      parseMode: HTML_MODE,
      replyMarkup: createInfoKeyboard(),
      text: SENT_TRACK_PROMPT,
    });
  }
}

async function openCabinetReply(ctx, musicService, logger, platformSettings) {
  const meta = getContextMeta(ctx);
  const profile = meta.userId ? await musicService.getUserProfile(meta.userId) : emptyProfile();

  await logger.log("cabinet_requested", {
    ...meta,
    starsAvailableXtr: profile.starsAvailableXtr,
    trackCount: profile.trackCount,
  });

  await showPanel(ctx, musicService, {
    parseMode: HTML_MODE,
    replyMarkup: createCabinetKeyboard(),
    text: formatCabinetMessage(profile, platformSettings),
  });
}

async function openCabinetEdit(ctx, musicService, logger, platformSettings) {
  const meta = getContextMeta(ctx);
  const profile = meta.userId ? await musicService.getUserProfile(meta.userId) : emptyProfile();

  await logger.log("cabinet_requested", {
    ...meta,
    starsAvailableXtr: profile.starsAvailableXtr,
    trackCount: profile.trackCount,
  });

  await showPanel(ctx, musicService, {
    parseMode: HTML_MODE,
    replyMarkup: createCabinetKeyboard(),
    text: formatCabinetMessage(profile, platformSettings),
  });
}

function createHomeKeyboard() {
  return new InlineKeyboard()
    .text(SEARCH_LABEL, "menu:search")
    .row()
    .text(UPLOAD_LABEL, "menu:upload")
    .row()
    .text(CABINET_LABEL, "menu:cabinet");
}

function createSearchPromptKeyboard() {
  return new InlineKeyboard()
    .text(BACK_LABEL, "menu:home");
}

function createUploadPromptKeyboard() {
  return new InlineKeyboard()
    .text(HOME_LABEL, "menu:home");
}

function createUploadTitleKeyboard(suggestedTitle) {
  const keyboard = new InlineKeyboard();

  if (suggestedTitle) {
    keyboard.text(`Оставить: ${shortenLabel(suggestedTitle, 24)}`, "upload:title:use").row();
  }

  keyboard.text(CANCEL_UPLOAD_LABEL, "upload:cancel");

  return keyboard;
}

function createSearchResultsKeyboard(tracks) {
  return createSearchResultsKeyboardPage(tracks, {
    page: 0,
    totalPages: 1,
  });
}

function createSearchResultsKeyboardPage(tracks, pagination) {
  const keyboard = new InlineKeyboard();

  for (const track of tracks) {
    keyboard.text(formatTrackButton(track), `pick:${track.id}`).row();
  }

  if (pagination.totalPages > 1) {
    const prevPage = Math.max(0, pagination.page - 1);
    const nextPage = Math.min(pagination.totalPages - 1, pagination.page + 1);

    keyboard
      .text("◀️", `searchpage:${prevPage}`)
      .text(`${pagination.page + 1}/${pagination.totalPages}`, "searchpage:stay")
      .text("▶️", `searchpage:${nextPage}`);
  }

  return keyboard;
}

async function createTrackAudioSupportLink(ctx, { logger, musicService, platformSettings, track, viewerUserId }) {
  if (!track.supportsStars) {
    return undefined;
  }

  const amountXtr = platformSettings.starsSupportAmounts[0] ?? 10;

  if (!musicService || !viewerUserId) {
    return undefined;
  }

  try {
    const intent = await musicService.createStarsSupportIntent({
      amountXtr,
      donorUserId: viewerUserId,
      trackId: track.id,
    });

    if (!intent) {
      return undefined;
    }

    const invoiceLink = await createStarsInvoiceLink(ctx, track, intent);

    await logger.log("stars_invoice_link_created", {
      ...getContextMeta(ctx),
      amountXtr: intent.amountXtr,
      payload: intent.payload,
      trackId: track.id,
    });

    return invoiceLink;
  } catch (error) {
    await logger.log("stars_invoice_link_failed", {
      ...getContextMeta(ctx),
      error: serializeError(error),
      trackId: track.id,
    });

    return undefined;
  }
}

async function createStarsInvoiceLink(ctx, track, intent) {
  return ctx.api.raw.createInvoiceLink({
    currency: "XTR",
    description: `${track.title} | ${track.uploaderName}`,
    payload: intent.payload,
    prices: [{ amount: intent.amountXtr, label: `${intent.amountXtr} XTR` }],
    title: TRACK_SUPPORT_INVOICE_TITLE,
  });
}

function createCabinetKeyboard() {
  return new InlineKeyboard()
    .text(TRACKS_LABEL, "cab:tracks")
    .row()
    .text(WITHDRAW_LABEL, "cab:withdraw")
    .row()
    .text(BACK_LABEL, "menu:home");
}

function createCabinetTracksKeyboard(tracks) {
  const keyboard = new InlineKeyboard();

  for (const track of tracks) {
    keyboard.text(formatTrackButton(track), `cabtrack:${track.id}`).row();
  }

  keyboard.text(BACK_LABEL, "menu:cabinet");

  return keyboard;
}

function createWithdrawKeyboard(profile, platformSettings) {
  const keyboard = new InlineKeyboard();

  if (profile.starsAvailableXtr >= platformSettings.withdrawMinStars) {
    keyboard.text(REQUEST_WITHDRAW_LABEL, "withdraw:request").row();
  }

  keyboard.text(BACK_LABEL, "menu:cabinet");

  return keyboard;
}

function createWithdrawBackKeyboard() {
  return new InlineKeyboard()
    .text(BACK_LABEL, "menu:cabinet");
}

function createStarsAmountKeyboard(trackId, amounts) {
  const keyboard = new InlineKeyboard();

  for (const amount of amounts) {
    keyboard.text(`${amount} XTR`, `starspay:${trackId}:${amount}`).row();
  }

  keyboard.text(BACK_LABEL, `pick:${trackId}`);

  return keyboard;
}

function createInfoKeyboard() {
  return new InlineKeyboard()
    .text(SEARCH_NEW_LABEL, "menu:search")
    .row()
    .text(CABINET_LABEL, "menu:cabinet");
}

async function renderSearchResultsPanel(ctx, musicService, userId, requestedPage) {
  const session = userId ? await musicService.getSearchSession(userId) : null;

  if (!session?.trackIds?.length) {
    await showPanel(ctx, musicService, {
      parseMode: HTML_MODE,
      replyMarkup: createSearchPromptKeyboard(),
      text: SEARCH_BUTTON_PROMPT,
    });
    return;
  }

  const totalPages = Math.max(1, Math.ceil(session.trackIds.length / SEARCH_PAGE_SIZE));
  const safePage = Math.max(0, Math.min(requestedPage, totalPages - 1));
  const pageTrackIds = session.trackIds.slice(safePage * SEARCH_PAGE_SIZE, (safePage + 1) * SEARCH_PAGE_SIZE);
  const tracks = (await Promise.all(pageTrackIds.map((trackId) => musicService.lookupTrack(trackId))))
    .filter(Boolean);

  await musicService.setSearchSession(userId, {
    ...session,
    page: safePage,
  });

  await showPanel(ctx, musicService, {
    parseMode: HTML_MODE,
    replyMarkup: createSearchResultsKeyboardPage(tracks, {
      page: safePage,
      totalPages,
    }),
    text: SEARCH_RESULTS_PROMPT,
  });
}

function shortenLabel(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function emptyProfile() {
  return {
    isBanned: false,
    starsAvailableXtr: 0,
    starsFrozenXtr: 0,
    starsPendingXtr: 0,
    starsTotalXtr: 0,
    trackCount: 0,
    supportPaymentsCount: 0,
  };
}

export function getContextMeta(ctx) {
  const update = ctx?.update ?? {};
  const chatId = ctx?.chat?.id
    ?? update.message?.chat?.id
    ?? update.callback_query?.message?.chat?.id
    ?? null;
  const userId = ctx?.from?.id
    ?? update.message?.from?.id
    ?? update.callback_query?.from?.id
    ?? null;

  return {
    chatId,
    updateId: update.update_id ?? null,
    userId,
  };
}
