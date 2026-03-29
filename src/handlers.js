import { InlineKeyboard } from "grammy";

import {
  DONATION_INFO_UNAVAILABLE_PROMPT,
  EMPTY_QUERY_PROMPT,
  EMPTY_RESULTS_PROMPT,
  LOOKUP_ERROR_PROMPT,
  MY_TRACKS_EMPTY_PROMPT,
  NON_TEXT_PROMPT,
  SEARCH_ERROR_PROMPT,
  SEARCH_RESULTS_PROMPT,
  SENT_TRACK_PROMPT,
  START_PROMPT,
  TITLE_SUGGESTION_SAVED_PROMPT,
  TON_WALLET_DISABLED_PROMPT,
  TON_WALLET_INVALID_PROMPT,
  TON_WALLET_PROMPT,
  TON_WALLET_SAVED_PROMPT,
  UPLOAD_DONATION_PROMPT,
  UPLOAD_DONE_PROMPT,
  UPLOAD_LINK_ERROR_PROMPT,
  UPLOAD_ONLY_MP3_PROMPT,
  UPLOAD_TITLE_PROMPT,
  formatCabinetMessage,
  formatDonationInfoMessage,
  formatSelectionMessage,
  formatTrackButton,
  formatTrackCaption,
  formatUploadTitlePrompt,
  normalizeQuery,
} from "./messages.js";
import { noopLogger, serializeError } from "./logger.js";
import { noopReplayStore } from "./replay-store.js";
import { isValidTonAddress } from "./ton.js";

const HOME_LABEL = "В меню";
const BACK_LABEL = "Назад";
const SEARCH_LABEL = "Поиск трека";
const SEARCH_NEW_LABEL = "Новый поиск";
const UPLOAD_LABEL = "Загрузить MP3";
const CABINET_LABEL = "Кабинет";
const TRACKS_LABEL = "Мои треки";
const WALLET_LABEL = "TON кошелек";
const WALLET_DISABLE_LABEL = "Отключить TON";
const SKIP_DONATION_LABEL = "Без доната";
const CANCEL_UPLOAD_LABEL = "Отменить загрузку";

export function createHandlers({
  musicService,
  logger = noopLogger,
  platformSettings = { feeBps: 300, feePercentLabel: "3%", platformTonAddress: "" },
  replayStore = noopReplayStore,
}) {
  return {
    async handleStart(ctx) {
      const meta = getContextMeta(ctx);

      await resetPendingState(musicService, meta.userId);
      await logger.log("start_received", meta);
      await ctx.reply(START_PROMPT, {
        reply_markup: createHomeKeyboard(),
      });
      await logger.log("start_replied", meta);
    },

    async handleMyTracks(ctx) {
      const meta = getContextMeta(ctx);
      await resetPendingState(musicService, meta.userId);
      await openCabinetReply(ctx, musicService, logger, platformSettings);
    },

    async handleTextMessage(ctx) {
      const meta = getContextMeta(ctx);
      const rawText = ctx.message?.text ?? "";

      if (rawText.startsWith("/")) {
        if (isStartCommandText(rawText) || isMyCommandText(rawText)) {
          return;
        }

        await logger.log("command_redirected", {
          ...meta,
          command: rawText,
        });
        await ctx.reply(START_PROMPT, {
          reply_markup: createHomeKeyboard(),
        });
        return;
      }

      const pendingUpload = meta.userId ? await musicService.getPendingUpload(meta.userId) : null;

      if (pendingUpload) {
        await handlePendingUploadText(ctx, meta, rawText, pendingUpload, musicService, logger);
        return;
      }

      const pendingAction = meta.userId ? await musicService.getPendingAction(meta.userId) : null;

      if (pendingAction?.type === "set_ton_wallet") {
        await handlePendingWalletText(ctx, meta, rawText, musicService, logger);
        return;
      }

      const query = normalizeQuery(rawText);

      if (!query) {
        await logger.log("empty_query_received", meta);
        await ctx.reply(EMPTY_QUERY_PROMPT, {
          reply_markup: createSearchPromptKeyboard(),
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

        const tracks = await musicService.searchTracks(query, 5);

        if (tracks.length === 0) {
          await logger.log("search_empty", {
            ...meta,
            query,
          });
          await ctx.reply(EMPTY_RESULTS_PROMPT, {
            reply_markup: createSearchPromptKeyboard(),
          });
          return;
        }

        await ctx.reply(SEARCH_RESULTS_PROMPT, {
          reply_markup: createSearchResultsKeyboard(tracks),
        });

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

        await ctx.reply(SEARCH_ERROR_PROMPT, {
          reply_markup: createSearchPromptKeyboard(),
        });
      }
    },

    async handleNonTextMessage(ctx) {
      const upload = extractUploadFromMessage(ctx.message);
      const meta = getContextMeta(ctx);

      if (!upload) {
        await logger.log("non_text_received", meta);
        await ctx.reply(NON_TEXT_PROMPT, {
          reply_markup: createHomeKeyboard(),
        });
        return;
      }

      const titleFromCaption = normalizeQuery(ctx.message?.caption ?? "");
      const suggestedTitle = titleFromCaption || buildSuggestedTitle(ctx.message, upload.fileName);

      await logger.log("upload_received", {
        ...meta,
        fileType: upload.fileType,
        suggestedTitle,
      });

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
        await ctx.reply(UPLOAD_DONATION_PROMPT, {
          reply_markup: createDonationPromptKeyboard(),
        });
        return;
      }

      await ctx.reply(formatUploadTitlePrompt(suggestedTitle), {
        reply_markup: createUploadTitleKeyboard(suggestedTitle),
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
        const track = await enrichTrackWithDonation(await musicService.lookupTrack(trackId), musicService);

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

        await sendStoredTrack(ctx, track);

        await ctx.editMessageText(formatSelectionMessage(track), {
          parse_mode: "HTML",
          reply_markup: createSelectionKeyboard(track),
        });

        await logger.log("selection_completed", {
          ...meta,
          hasTonAddress: Boolean(track.tonAddress),
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
        const track = await enrichTrackWithDonation(await musicService.lookupTrack(trackId), musicService);

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

        await sendStoredTrack(ctx, track, { includeFollowUp: false });

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
        await ctx.editMessageText(UPLOAD_TITLE_PROMPT, {
          reply_markup: createUploadTitleKeyboard(""),
        });
        return;
      }

      await musicService.savePendingTitle(meta.userId, suggestedTitle);

      await logger.log("upload_title_saved", {
        ...meta,
        title: suggestedTitle,
        via: "suggestion",
      });

      await ctx.editMessageText(TITLE_SUGGESTION_SAVED_PROMPT, {
        reply_markup: createDonationPromptKeyboard(),
      });
    },

    async handleSkipDonation(ctx) {
      const meta = getContextMeta(ctx);
      const track = await musicService.finalizePendingUpload(meta.userId, null);

      await ctx.answerCallbackQuery();

      if (!track) {
        await ctx.editMessageText(UPLOAD_DONATION_PROMPT, {
          reply_markup: createDonationPromptKeyboard(),
        });
        return;
      }

      await logger.log("upload_completed", {
        ...meta,
        trackId: track.id,
        via: "skip_donation",
      });

      await ctx.editMessageText(UPLOAD_DONE_PROMPT, {
        reply_markup: createHomeKeyboard(),
      });
    },

    async handleCancelUpload(ctx) {
      const meta = getContextMeta(ctx);

      await ctx.answerCallbackQuery();
      await musicService.clearPendingUpload(meta.userId);
      await logger.log("upload_cancelled", meta);
      await ctx.editMessageText(START_PROMPT, {
        reply_markup: createHomeKeyboard(),
      });
    },

    async handleMenuCallback(ctx, action) {
      const meta = getContextMeta(ctx);

      await ctx.answerCallbackQuery();
      await resetPendingState(musicService, meta.userId);

      if (action === "home") {
        await ctx.editMessageText(START_PROMPT, {
          reply_markup: createHomeKeyboard(),
        });
        return;
      }

      if (action === "search") {
        await ctx.editMessageText("Напиши название трека", {
          reply_markup: createSearchPromptKeyboard(),
        });
        return;
      }

      if (action === "upload") {
        await ctx.editMessageText("Пришли mp3 файлом или аудио", {
          reply_markup: createUploadPromptKeyboard(),
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
        const text = tracks.length === 0 ? MY_TRACKS_EMPTY_PROMPT : "Твои треки";

        await ctx.editMessageText(text, {
          reply_markup: createCabinetTracksKeyboard(tracks),
        });
        return;
      }

      if (action === "wallet") {
        await musicService.setPendingAction(meta.userId, { type: "set_ton_wallet" });

        await ctx.editMessageText(TON_WALLET_PROMPT, {
          reply_markup: createWalletPromptKeyboard(profile),
        });
        return;
      }

      if (action === "wallet:clear") {
        await musicService.clearUserTonAddress(meta.userId);
        await musicService.clearPendingAction(meta.userId);

        const refreshedProfile = await musicService.getUserProfile(meta.userId);
        await logger.log("ton_wallet_cleared", meta);
        await ctx.editMessageText(`${TON_WALLET_DISABLED_PROMPT}\n\n${formatCabinetMessage(refreshedProfile, platformSettings)}`, {
          parse_mode: "HTML",
          reply_markup: createCabinetKeyboard(),
        });
      }
    },

    async handleDonateCallback(ctx, trackId) {
      const meta = getContextMeta(ctx);
      const track = await enrichTrackWithDonation(await musicService.lookupTrack(trackId), musicService);

      await ctx.answerCallbackQuery();

      if (!track?.tonAddress) {
        await ctx.reply(DONATION_INFO_UNAVAILABLE_PROMPT, {
          reply_markup: createInfoKeyboard(),
        });
        return;
      }

      await logger.log("donation_info_opened", {
        ...meta,
        hasTonAddress: true,
        trackId,
      });
      await ctx.reply(formatDonationInfoMessage(track, platformSettings), {
        parse_mode: "HTML",
        reply_markup: createInfoKeyboard(),
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

async function handlePendingUploadText(ctx, meta, rawText, pendingUpload, musicService, logger) {
  const normalized = normalizeQuery(rawText);

  if (!pendingUpload.title) {
    if (!normalized) {
      await ctx.reply(formatUploadTitlePrompt(pendingUpload.suggestedTitle ?? ""), {
        reply_markup: createUploadTitleKeyboard(pendingUpload.suggestedTitle ?? ""),
      });
      return;
    }

    await musicService.savePendingTitle(meta.userId, normalized);
    await logger.log("upload_title_saved", {
      ...meta,
      title: normalized,
    });
    await ctx.reply(UPLOAD_DONATION_PROMPT, {
      reply_markup: createDonationPromptKeyboard(),
    });
    return;
  }

  const donationUrl = parseDonationUrl(normalized);

  if (normalized && donationUrl === undefined) {
    await ctx.reply(UPLOAD_LINK_ERROR_PROMPT, {
      reply_markup: createDonationPromptKeyboard(),
    });
    return;
  }

  const track = await musicService.finalizePendingUpload(meta.userId, donationUrl ?? null);

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
  await ctx.reply(UPLOAD_DONE_PROMPT, {
    reply_markup: createHomeKeyboard(),
  });
}

async function handlePendingWalletText(ctx, meta, rawText, musicService, logger) {
  const normalized = normalizeQuery(rawText);
  const profile = await musicService.getUserProfile(meta.userId);

  if (!normalized) {
    await ctx.reply(TON_WALLET_PROMPT, {
      reply_markup: createWalletPromptKeyboard(profile),
    });
    return;
  }

  if (normalized === "-" || /^нет$/i.test(normalized)) {
    await musicService.clearUserTonAddress(meta.userId);
    await musicService.clearPendingAction(meta.userId);
    await logger.log("ton_wallet_cleared", meta);
    await ctx.reply(TON_WALLET_DISABLED_PROMPT, {
      reply_markup: createHomeKeyboard(),
    });
    return;
  }

  if (!isValidTonAddress(normalized)) {
    await ctx.reply(TON_WALLET_INVALID_PROMPT, {
      reply_markup: createWalletPromptKeyboard(profile),
    });
    return;
  }

  await musicService.setUserTonAddress(meta.userId, normalized);
  await musicService.clearPendingAction(meta.userId);
  await logger.log("ton_wallet_saved", {
    ...meta,
    tonAddress: normalized,
  });
  await ctx.reply(TON_WALLET_SAVED_PROMPT, {
    reply_markup: createHomeKeyboard(),
  });
}

async function resetPendingState(musicService, userId) {
  if (!userId) {
    return;
  }

  await musicService.clearPendingAction(userId);
  await musicService.clearPendingUpload(userId);
}

function extractUploadFromMessage(message) {
  if (message?.audio) {
    return {
      fileId: message.audio.file_id,
      fileName: message.audio.file_name ?? "",
      fileType: "audio",
      mimeType: message.audio.mime_type ?? "",
    };
  }

  if (message?.document?.mime_type === "audio/mpeg") {
    return {
      fileId: message.document.file_id,
      fileName: message.document.file_name ?? "",
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

function parseDonationUrl(value) {
  if (!value || value === "-" || /^нет$/i.test(value)) {
    return null;
  }

  return /^https?:\/\/\S+$/i.test(value) ? value : undefined;
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

async function enrichTrackWithDonation(track, musicService) {
  if (!track) {
    return null;
  }

  const profile = await musicService.getUserProfile(track.uploaderUserId);
  return {
    ...track,
    tonAddress: profile.tonAddress,
  };
}

async function sendStoredTrack(ctx, track, options = {}) {
  const { includeFollowUp = true } = options;
  const caption = formatTrackCaption(track);

  if (track.fileType === "document") {
    await ctx.replyWithDocument(track.fileId, {
      caption,
    });
  } else {
    await ctx.replyWithAudio(track.fileId, {
      caption,
    });
  }

  if (includeFollowUp) {
    await ctx.reply(SENT_TRACK_PROMPT, {
      reply_markup: createInfoKeyboard(),
    });
  }
}

async function openCabinetReply(ctx, musicService, logger, platformSettings) {
  const meta = getContextMeta(ctx);
  const profile = meta.userId ? await musicService.getUserProfile(meta.userId) : emptyProfile();

  await logger.log("cabinet_requested", {
    ...meta,
    hasTonAddress: profile.hasTonAddress,
    trackCount: profile.trackCount,
  });

  await ctx.reply(formatCabinetMessage(profile, platformSettings), {
    parse_mode: "HTML",
    reply_markup: createCabinetKeyboard(),
  });
}

async function openCabinetEdit(ctx, musicService, logger, platformSettings) {
  const meta = getContextMeta(ctx);
  const profile = meta.userId ? await musicService.getUserProfile(meta.userId) : emptyProfile();

  await logger.log("cabinet_requested", {
    ...meta,
    hasTonAddress: profile.hasTonAddress,
    trackCount: profile.trackCount,
  });

  await ctx.editMessageText(formatCabinetMessage(profile, platformSettings), {
    parse_mode: "HTML",
    reply_markup: createCabinetKeyboard(),
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

function createDonationPromptKeyboard() {
  return new InlineKeyboard()
    .text(SKIP_DONATION_LABEL, "upload:donation:skip")
    .row()
    .text(CANCEL_UPLOAD_LABEL, "upload:cancel");
}

function createSearchResultsKeyboard(tracks) {
  const keyboard = new InlineKeyboard();

  for (const track of tracks) {
    keyboard.text(formatTrackButton(track), `pick:${track.id}`).row();
  }

  keyboard
    .text(SEARCH_NEW_LABEL, "menu:search")
    .row()
    .text(CABINET_LABEL, "menu:cabinet");

  return keyboard;
}

function createSelectionKeyboard(track) {
  const keyboard = new InlineKeyboard();

  if (track.tonAddress) {
    keyboard.text("TON донат", `donate:${track.id}`).row();
  } else if (track.donationUrl) {
    keyboard.url("Поддержать автора", track.donationUrl).row();
  }

  keyboard
    .text(SEARCH_NEW_LABEL, "menu:search")
    .row()
    .text(CABINET_LABEL, "menu:cabinet");

  return keyboard;
}

function createCabinetKeyboard() {
  return new InlineKeyboard()
    .text(TRACKS_LABEL, "cab:tracks")
    .row()
    .text(WALLET_LABEL, "cab:wallet")
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

function createWalletPromptKeyboard(profile) {
  const keyboard = new InlineKeyboard()
    .text(BACK_LABEL, "menu:cabinet");

  if (profile.hasTonAddress) {
    keyboard.row().text(WALLET_DISABLE_LABEL, "cab:wallet:clear");
  }

  return keyboard;
}

function createInfoKeyboard() {
  return new InlineKeyboard()
    .text(SEARCH_NEW_LABEL, "menu:search")
    .row()
    .text(CABINET_LABEL, "menu:cabinet");
}

function shortenLabel(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function emptyProfile() {
  return {
    hasTonAddress: false,
    tonAddress: "",
    trackCount: 0,
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
