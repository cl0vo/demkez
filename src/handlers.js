import { InlineKeyboard } from "grammy";

import {
  DEFAULT_LOCALE,
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
  SUPPORTED_LOCALES,
  formatCabinetMessage,
  formatExternalSearchResultCaption,
  formatExternalSearchResultButton,
  formatExternalUploadPrompt,
  formatLanguagePrompt,
  formatLanguageSavedPrompt,
  formatPaySupportMessage,
  formatRulesMessage,
  formatStarsBalanceMessage,
  formatStarsPaymentSuccessMessage,
  formatStarsSupportMessage,
  formatTrackRenamedMessage,
  formatTrackRenamePrompt,
  formatTrackButton,
  formatTrackCaption,
  formatUploadDailyLimitMessage,
  formatUploadTooLargeMessage,
  formatUploadTitlePrompt,
  formatWithdrawMessage,
  formatWithdrawRequestMessage,
  getText,
  getUiLabels,
  normalizeLocale,
  normalizeQuery,
} from "./messages.js";
import { noopLogger, serializeError } from "./logger.js";
import { noopReplayStore } from "./replay-store.js";

const HTML_MODE = "HTML";
const SEARCH_PAGE_SIZE = 8;
const SEARCH_MAX_PAGES = 7;
const SEARCH_RESULT_LIMIT = SEARCH_PAGE_SIZE * SEARCH_MAX_PAGES;

export function createHandlers({
  musicService,
  previewSearchService = { async searchTracks() { return []; } },
  logger = noopLogger,
  platformSettings = { feeBps: 300, feePercentLabel: "3%", starsHoldDays: 7, starsSupportAmounts: [10, 25, 50], withdrawMinStars: 100 },
  replayStore = noopReplayStore,
}) {
  return {
    async handleStart(ctx) {
      const meta = getContextMeta(ctx);

      await resetPendingState(musicService, meta.userId);
      await logger.log("start_received", meta);
      const locale = await getStoredLocale(musicService, meta.userId);

      if (!locale) {
        await showLanguagePicker(ctx, musicService, DEFAULT_LOCALE);
        await logger.log("start_locale_requested", meta);
        return;
      }

      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createHomeKeyboard(locale),
        text: getText(locale, "START_PROMPT"),
      });
      await logger.log("start_replied", meta);
    },

    async handleLanguageCommand(ctx) {
      const meta = getContextMeta(ctx);
      const locale = await getLocaleOrDefault(musicService, meta.userId);

      await resetPendingState(musicService, meta.userId);
      await showLanguagePicker(ctx, musicService, locale);
    },

    async handleLanguageCallback(ctx, localeCode) {
      const meta = getContextMeta(ctx);
      const locale = normalizeLocale(localeCode);

      await ctx.answerCallbackQuery();

      if (!meta.userId || !locale) {
        await showLanguagePicker(ctx, musicService, DEFAULT_LOCALE);
        return;
      }

      await musicService.setUserLocale(meta.userId, locale);
      await resetPendingState(musicService, meta.userId);
      await logger.log("language_selected", {
        ...meta,
        locale,
      });
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createHomeKeyboard(locale),
        text: formatLanguageSavedPrompt(locale),
      });
    },

    async handleMyTracks(ctx) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      await resetPendingState(musicService, meta.userId);
      await openCabinetReply(ctx, musicService, logger, platformSettings, locale);
    },

    async handleBalance(ctx) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      const profile = meta.userId ? await musicService.getUserProfile(meta.userId) : emptyProfile();

      await logger.log("balance_requested", {
        ...meta,
        starsAvailableXtr: profile.starsAvailableXtr,
      });

      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createWithdrawKeyboard(profile, platformSettings, locale),
        text: formatStarsBalanceMessage(profile, platformSettings, locale),
      });
    },

    async handlePaySupport(ctx) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createInfoKeyboard(locale),
        text: formatPaySupportMessage(platformSettings, locale),
      });
    },

    async handleRules(ctx) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createInfoKeyboard(locale),
        text: formatRulesMessage(platformSettings, locale),
      });
    },

    async handleTextMessage(ctx) {
      const meta = getContextMeta(ctx);
      const rawText = ctx.message?.text ?? "";
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      if (rawText.startsWith("/")) {
        if (isStartCommandText(rawText) || isMyCommandText(rawText) || isBalanceCommandText(rawText) || isLanguageCommandText(rawText) || isPaySupportCommandText(rawText) || isRulesCommandText(rawText)) {
          return;
        }

        await logger.log("command_redirected", {
          ...meta,
          command: rawText,
        });
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createHomeKeyboard(locale),
          text: getText(locale, "START_PROMPT"),
        });
        return;
      }

      const pendingUpload = meta.userId ? await musicService.getPendingUpload(meta.userId) : null;

      if (pendingUpload) {
        await handlePendingUploadText(ctx, meta, rawText, pendingUpload, musicService, logger, locale);
        return;
      }

      const pendingAction = meta.userId ? await musicService.getPendingAction(meta.userId) : null;

      if (pendingAction?.type === "edit_track_title") {
        await handleEditTrackTitleText(ctx, meta, rawText, pendingAction, musicService, logger, locale);
        return;
      }

      const query = normalizeQuery(rawText);

      if (!query) {
        await logger.log("empty_query_received", meta);
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createSearchPromptKeyboard(locale),
          text: getText(locale, "EMPTY_QUERY_PROMPT"),
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
        const { error: externalSearchError, results: externalResults } = await loadExternalSearchResults(
          previewSearchService,
          query,
        );
        const results = [
          ...tracks.map((track) => toStoredSearchResult(track)),
          ...externalResults.map((track) => ({
            ...track,
            type: "external",
          })),
        ].slice(0, SEARCH_RESULT_LIMIT);

        if (externalSearchError && results.length > 0) {
          await logger.log("search_external_failed_partial", {
            ...meta,
            query,
            error: serializeError(externalSearchError),
          });
        }

        if (results.length === 0) {
          if (externalSearchError) {
            throw externalSearchError;
          }

          await logger.log("search_empty", {
            ...meta,
            query,
          });
          await showPanel(ctx, musicService, {
            parseMode: HTML_MODE,
            replyMarkup: createSearchPromptKeyboard(locale),
            text: getText(locale, "EMPTY_RESULTS_PROMPT"),
          });
          return;
        }

        await musicService.setSearchSession(meta.userId, {
          createdAt: new Date().toISOString(),
          page: 0,
          query,
          results,
        });

        await renderSearchResultsPanel(ctx, musicService, meta.userId, 0, locale);

        await logger.log("search_results_rendered", {
          ...meta,
          query,
          resultsCount: results.length,
          resultKinds: summarizeResultKinds(results),
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
          replyMarkup: createSearchPromptKeyboard(locale),
          text: getText(locale, "SEARCH_ERROR_PROMPT"),
        });
      }
    },

    async handleNonTextMessage(ctx) {
      const upload = extractUploadFromMessage(ctx.message);
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      if (!upload) {
        await logger.log("non_text_received", meta);
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createHomeKeyboard(locale),
          text: getText(locale, "NON_TEXT_PROMPT"),
        });
        return;
      }

      const titleFromCaption = normalizeQuery(ctx.message?.caption ?? "");
      const pendingAction = meta.userId ? await musicService.getPendingAction(meta.userId) : null;
      const suggestedTitle = titleFromCaption
        || pendingAction?.suggestedTitle
        || buildSuggestedTitle(ctx.message, upload.fileName);

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
          replyMarkup: createUploadPromptKeyboard(locale),
          text: formatUploadTooLargeMessage(platformSettings, locale),
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
          replyMarkup: createHomeKeyboard(locale),
          text: formatUploadDailyLimitMessage(platformSettings, locale),
        });
        return;
      }

      let storedUpload = upload;

      try {
        storedUpload = await storeUploadSourceMessage(ctx, upload, platformSettings);
      } catch (error) {
        const replayPath = await replayStore.capture("upload_storage_failed", {
          context: {
            ...meta,
            fileType: upload.fileType,
            sizeBytes: upload.sizeBytes,
          },
          error,
          update: ctx.update,
        });

        await logger.log("upload_storage_failed", {
          ...meta,
          error: serializeError(error),
          replayPath,
          storageChatId: platformSettings.storageChatId ?? null,
        });

        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createUploadPromptKeyboard(locale),
          text: getText(locale, "UPLOAD_STORAGE_ERROR_PROMPT"),
        });
        return;
      }

      if (storedUpload.sourceChatId !== upload.sourceChatId || storedUpload.sourceMessageId !== upload.sourceMessageId) {
        await logger.log("upload_stored_in_channel", {
          ...meta,
          storageChatId: storedUpload.sourceChatId,
          storageMessageId: storedUpload.sourceMessageId,
        });
      }

      await musicService.beginUpload({
        ...storedUpload,
        catalogVisible: true,
        suggestedTitle,
        title: titleFromCaption || "",
        userId: meta.userId,
        uploaderName: getUploaderName(ctx),
        uploaderUsername: ctx.from?.username ?? "",
      });
      const pendingUpload = await musicService.getPendingUpload(meta.userId);

      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createUploadTitleKeyboard(pendingUpload, locale),
        text: formatUploadTitlePrompt(pendingUpload, locale),
      });
      await musicService.clearPendingAction(meta.userId);
    },

    async handleSearchResultCallback(ctx, resultIndex) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      await logger.log("selection_requested", {
        ...meta,
        resultIndex,
      });

      await ctx.answerCallbackQuery();
      let track = null;

      try {
        const result = await getSearchSessionResult(musicService, meta.userId, resultIndex);

        if (!result) {
          await logger.log("selection_missing", {
            ...meta,
            resultIndex,
          });
          await ctx.editMessageText(getText(locale, "LOOKUP_ERROR_PROMPT"), {
            reply_markup: createHomeKeyboard(locale),
          });
          return;
        }

        if (result.type === "external") {
          await showPanel(ctx, musicService, {
            parseMode: HTML_MODE,
            replyMarkup: createExternalResultKeyboard(result, resultIndex, locale),
            text: formatExternalSearchResultCaption(result, locale),
          });

          await logger.log("selection_external_rendered", {
            ...meta,
            externalId: result.externalId,
            resultIndex,
            source: result.source,
          });
          return;
        }

        track = await enrichTrack(await musicService.lookupTrack(result.trackId), musicService);

        if (!track) {
          await logger.log("selection_missing", {
            ...meta,
            resultIndex,
            trackId: result.trackId,
          });
          await ctx.editMessageText(getText(locale, "LOOKUP_ERROR_PROMPT"), {
            reply_markup: createHomeKeyboard(locale),
          });
          return;
        }

        await sendStoredTrack(ctx, track, {
          includeFollowUp: false,
          logger,
          musicService,
          platformSettings,
          locale,
          viewerUserId: meta.userId,
        });
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createInfoKeyboard(locale),
          text: getText(locale, "TRACK_OPENED_PROMPT"),
        });

        await logger.log("selection_completed", {
          ...meta,
          resultIndex,
          supportsStars: Boolean(track.supportsStars),
          trackId: track.id,
        });
      } catch (error) {
        if (await cleanupBrokenTrackSend(error, track, musicService, logger, {
          ...meta,
          resultIndex,
        })) {
          await ctx.editMessageText(getText(locale, "TRACK_REMOVED_BROKEN_PROMPT"), {
            reply_markup: createHomeKeyboard(locale),
          });
          return;
        }

        const replayPath = await replayStore.capture("selection_failed", {
          context: {
            ...meta,
            resultIndex,
          },
          error,
          update: ctx.update,
        });

        await logger.log("selection_failed", {
          ...meta,
          resultIndex,
          error: serializeError(error),
          replayPath,
        });

        await ctx.editMessageText(getText(locale, "LOOKUP_ERROR_PROMPT"), {
          reply_markup: createHomeKeyboard(locale),
        });
      }
    },

    async handlePickCallback(ctx, trackId) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      await logger.log("selection_requested", {
        ...meta,
        trackId,
      });

      await ctx.answerCallbackQuery();
      let track = null;

      try {
        track = await enrichTrack(await musicService.lookupTrack(trackId), musicService);

        if (!track) {
          await logger.log("selection_missing", {
            ...meta,
            trackId,
          });
          await ctx.editMessageText(getText(locale, "LOOKUP_ERROR_PROMPT"), {
            reply_markup: createHomeKeyboard(locale),
          });
          return;
        }

        await sendStoredTrack(ctx, track, {
          includeFollowUp: false,
          logger,
          musicService,
          platformSettings,
          locale,
          viewerUserId: meta.userId,
        });
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createInfoKeyboard(locale),
          text: getText(locale, "TRACK_OPENED_PROMPT"),
        });

        await logger.log("selection_completed", {
          ...meta,
          supportsStars: Boolean(track.supportsStars),
          trackId,
        });
      } catch (error) {
        if (await cleanupBrokenTrackSend(error, track, musicService, logger, {
          ...meta,
          trackId,
        })) {
          await ctx.editMessageText(getText(locale, "TRACK_REMOVED_BROKEN_PROMPT"), {
            reply_markup: createHomeKeyboard(locale),
          });
          return;
        }

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

        await ctx.editMessageText(getText(locale, "LOOKUP_ERROR_PROMPT"), {
          reply_markup: createHomeKeyboard(locale),
        });
      }
    },

    async handleExternalUploadCallback(ctx, resultIndex) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      const result = await getSearchSessionResult(musicService, meta.userId, resultIndex);

      await ctx.answerCallbackQuery();

      if (!result || result.type !== "external") {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createSearchPromptKeyboard(locale),
          text: getText(locale, "SEARCH_BUTTON_PROMPT"),
        });
        return;
      }

      await musicService.setPendingAction(meta.userId, {
        createdAt: new Date().toISOString(),
        externalId: result.externalId,
        source: result.source,
        suggestedTitle: buildExternalSuggestedTitle(result),
        type: "external_upload",
      });

      await logger.log("external_upload_requested", {
        ...meta,
        externalId: result.externalId,
        resultIndex,
        source: result.source,
      });

      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createUploadPromptKeyboard(locale),
        text: formatExternalUploadPrompt(result, locale),
      });
    },

    async handleCabinetTrackCallback(ctx, trackId) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      await logger.log("cabinet_track_requested", {
        ...meta,
        trackId,
      });

      await ctx.answerCallbackQuery();
      let track = null;

      try {
        track = await enrichTrack(await musicService.lookupTrack(trackId), musicService);

        if (!track) {
          await logger.log("cabinet_track_missing", {
            ...meta,
            trackId,
          });
          await ctx.reply(getText(locale, "LOOKUP_ERROR_PROMPT"), {
            reply_markup: createInfoKeyboard(locale),
          });
          return;
        }

        await sendStoredTrack(ctx, track, {
          includeFollowUp: false,
          logger,
          musicService,
          platformSettings,
          locale,
          viewerUserId: meta.userId,
        });
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createInfoKeyboard(locale),
          text: getText(locale, "TRACK_OPENED_PROMPT"),
        });

        await logger.log("cabinet_track_completed", {
          ...meta,
          trackId,
        });
      } catch (error) {
        if (await cleanupBrokenTrackSend(error, track, musicService, logger, {
          ...meta,
          trackId,
        })) {
          const tracks = await musicService.listUserTracks(meta.userId, 20);
          await showPanel(ctx, musicService, {
            parseMode: HTML_MODE,
            replyMarkup: createCabinetTracksKeyboard(tracks, locale),
            text: getText(locale, "TRACK_REMOVED_BROKEN_PROMPT"),
          });
          return;
        }

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

        await ctx.reply(getText(locale, "LOOKUP_ERROR_PROMPT"), {
          reply_markup: createInfoKeyboard(locale),
        });
      }
    },

    async handleCabinetEditTrackCallback(ctx, trackId) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      await ctx.answerCallbackQuery();

      const track = await musicService.lookupTrack(trackId);

      if (!track || track.uploaderUserId !== Number(meta.userId)) {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createCabinetTracksKeyboard([], locale),
          text: getText(locale, "TRACK_RENAME_ERROR_PROMPT"),
        });
        return;
      }

      await musicService.setPendingAction(meta.userId, {
        createdAt: new Date().toISOString(),
        currentTitle: track.title,
        trackId,
        type: "edit_track_title",
      });

      await logger.log("cabinet_track_edit_started", {
        ...meta,
        trackId,
      });

      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createTrackRenameKeyboard(locale),
        text: formatTrackRenamePrompt(track, locale),
      });
    },

    async handleUseSuggestedTitle(ctx) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }
      const pendingUpload = meta.userId ? await musicService.getPendingUpload(meta.userId) : null;
      const suggestedTitle = pendingUpload?.suggestedTitle ?? "";

      await ctx.answerCallbackQuery();

      if (!pendingUpload || !suggestedTitle) {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createUploadTitleKeyboard("", locale),
          text: getText(locale, "UPLOAD_TITLE_PROMPT"),
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
      await musicService.clearPendingAction(meta.userId);
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createHomeKeyboard(locale),
        text: getText(locale, "UPLOAD_DONE_PROMPT"),
      });
    },

    async handlePublishUpload(ctx) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      await ctx.answerCallbackQuery();
      const pendingUpload = meta.userId ? await musicService.getPendingUpload(meta.userId) : null;

      if (!pendingUpload?.title) {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createUploadTitleKeyboard(pendingUpload, locale),
          text: formatUploadTitlePrompt(pendingUpload, locale),
        });
        return;
      }

      await logger.log("upload_title_saved", {
        ...meta,
        title: pendingUpload.title,
        via: "publish_existing",
      });

      const track = await musicService.finalizePendingUpload(meta.userId);
      await logger.log("upload_completed", {
        ...meta,
        catalogVisible: track?.catalogVisible !== false,
        trackId: track?.id ?? null,
        via: "publish_existing",
      });
      await musicService.clearPendingAction(meta.userId);
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createHomeKeyboard(locale),
        text: getText(locale, "UPLOAD_DONE_PROMPT"),
      });
    },

    async handleUploadVisibilityToggle(ctx) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      await ctx.answerCallbackQuery();
      const pendingUpload = meta.userId ? await musicService.getPendingUpload(meta.userId) : null;

      if (!pendingUpload) {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createUploadPromptKeyboard(locale),
          text: getText(locale, "UPLOAD_MENU_PROMPT"),
        });
        return;
      }

      const updatedPendingUpload = await musicService.savePendingCatalogVisibility(
        meta.userId,
        pendingUpload.catalogVisible === false,
      );

      await logger.log("upload_catalog_visibility_changed", {
        ...meta,
        catalogVisible: updatedPendingUpload?.catalogVisible !== false,
      });

      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createUploadTitleKeyboard(updatedPendingUpload, locale),
        text: formatUploadTitlePrompt(updatedPendingUpload, locale),
      });
    },

    async handleSkipDonation(ctx) {
      const meta = getContextMeta(ctx);
      const locale = await getLocaleOrDefault(musicService, meta.userId);
      await ctx.answerCallbackQuery();
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createHomeKeyboard(locale),
        text: getText(locale, "UPLOAD_DONE_PROMPT"),
      });
    },

    async handleCancelUpload(ctx) {
      const meta = getContextMeta(ctx);
      const locale = await getLocaleOrDefault(musicService, meta.userId);

      await ctx.answerCallbackQuery();
      await musicService.clearPendingUpload(meta.userId);
      await logger.log("upload_cancelled", meta);
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createHomeKeyboard(locale),
        text: getText(locale, "START_PROMPT"),
      });
    },

    async handleMenuCallback(ctx, action) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      await ctx.answerCallbackQuery();
      await resetPendingState(musicService, meta.userId);

      if (action === "home") {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createHomeKeyboard(locale),
          text: getText(locale, "START_PROMPT"),
        });
        return;
      }

      if (action === "search") {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createSearchPromptKeyboard(locale),
          text: getText(locale, "SEARCH_BUTTON_PROMPT"),
        });
        return;
      }

      if (action === "upload") {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createUploadPromptKeyboard(locale),
          text: getText(locale, "UPLOAD_MENU_PROMPT"),
        });
        return;
      }

      if (action === "cabinet") {
        await openCabinetEdit(ctx, musicService, logger, platformSettings, locale);
      }
    },

    async handleCabinetCallback(ctx, action) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      const profile = meta.userId ? await musicService.getUserProfile(meta.userId) : emptyProfile();

      await ctx.answerCallbackQuery();
      await musicService.clearPendingAction(meta.userId);

      if (action === "tracks") {
        const tracks = await musicService.listUserTracks(meta.userId, 20);
        const text = tracks.length === 0 ? getText(locale, "MY_TRACKS_EMPTY_PROMPT") : getText(locale, "MY_TRACKS_TITLE");

        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createCabinetTracksKeyboard(tracks, locale),
          text,
        });
        return;
      }

      if (action === "withdraw") {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createWithdrawKeyboard(profile, platformSettings, locale),
          text: formatWithdrawMessage(profile, platformSettings, locale),
        });
        return;
      }
    },

    async handleSearchPageCallback(ctx, page) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      await ctx.answerCallbackQuery();

      const session = meta.userId ? await musicService.getSearchSession(meta.userId) : null;

      if (!session?.results?.length) {
        await showPanel(ctx, musicService, {
          parseMode: HTML_MODE,
          replyMarkup: createSearchPromptKeyboard(locale),
          text: getText(locale, "SEARCH_BUTTON_PROMPT"),
        });
        return;
      }

      await renderSearchResultsPanel(ctx, musicService, meta.userId, page, locale);
    },

    async handleWithdrawRequest(ctx) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      await ctx.answerCallbackQuery();
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createWithdrawBackKeyboard(locale),
        text: formatWithdrawRequestMessage(platformSettings, locale),
      });
    },

    async handleDonateCallback(ctx, trackId) {
      const meta = getContextMeta(ctx);
      const locale = await requireLocale(ctx, musicService, meta.userId);

      if (!locale) {
        return;
      }

      const track = await enrichTrack(await musicService.lookupTrack(trackId), musicService);

      await ctx.answerCallbackQuery();

      if (!track?.supportsStars) {
        await ctx.reply(getText(locale, "STARS_SUPPORT_UNAVAILABLE_PROMPT"), {
          reply_markup: createInfoKeyboard(locale),
        });
        return;
      }

      await logger.log("stars_support_opened", {
        ...meta,
        trackId,
      });
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createStarsAmountKeyboard(trackId, platformSettings.starsSupportAmounts, locale),
        text: formatStarsSupportMessage(track, platformSettings, locale),
      });
    },

    async handleStarsAmountCallback(ctx, trackId, amountXtr) {
      const meta = getContextMeta(ctx);
      const locale = await getLocaleOrDefault(musicService, meta.userId);
      const track = await enrichTrack(await musicService.lookupTrack(trackId), musicService);

      await ctx.answerCallbackQuery();

      if (!track?.supportsStars) {
        await ctx.reply(getText(locale, "STARS_SUPPORT_UNAVAILABLE_PROMPT"), {
          reply_markup: createInfoKeyboard(locale),
        });
        return;
      }

      const intent = await musicService.createStarsSupportIntent({
        amountXtr,
        donorUserId: meta.userId,
        trackId,
      });

      if (!intent) {
        await ctx.reply(getText(locale, "STARS_SUPPORT_UNAVAILABLE_PROMPT"), {
          reply_markup: createInfoKeyboard(locale),
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
        getText(locale, "TRACK_SUPPORT_INVOICE_TITLE"),
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
      const locale = await getLocaleOrDefault(musicService, meta.userId);
      const payload = ctx.preCheckoutQuery?.invoice_payload ?? "";
      const intent = await musicService.approveStarsSupportIntent(payload, meta.userId);

      if (!intent) {
        await logger.log("stars_precheckout_rejected", {
          ...meta,
          payload,
        });
        await ctx.answerPreCheckoutQuery(false, getText(locale, "STARS_INVOICE_EXPIRED_PROMPT"));
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
      const locale = await getLocaleOrDefault(musicService, meta.userId);
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
          replyMarkup: createInfoKeyboard(locale),
          text: getText(locale, "STARS_INVOICE_EXPIRED_PROMPT"),
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
        replyMarkup: createInfoKeyboard(locale),
        text: formatStarsPaymentSuccessMessage(savedPayment, locale),
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

function isLanguageCommandText(text) {
  return /^\/language(?:@\w+)?(?:\s|$)/i.test(text);
}

function isPaySupportCommandText(text) {
  return /^\/paysupport(?:@\w+)?(?:\s|$)/i.test(text);
}

function isRulesCommandText(text) {
  return /^\/rules(?:@\w+)?(?:\s|$)/i.test(text);
}

async function handlePendingUploadText(ctx, meta, rawText, pendingUpload, musicService, logger, locale = DEFAULT_LOCALE) {
  const normalized = normalizeQuery(rawText);

  if (!normalized) {
    await showPanel(ctx, musicService, {
      parseMode: HTML_MODE,
      replyMarkup: createUploadTitleKeyboard(pendingUpload, locale),
      text: formatUploadTitlePrompt(pendingUpload, locale),
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
    await ctx.reply(getText(locale, "UPLOAD_ONLY_MP3_PROMPT"), {
      reply_markup: createUploadPromptKeyboard(locale),
    });
    return;
  }

  await logger.log("upload_completed", {
    ...meta,
    catalogVisible: track.catalogVisible !== false,
    trackId: track.id,
  });
  await musicService.clearPendingAction(meta.userId);
  await showPanel(ctx, musicService, {
    parseMode: HTML_MODE,
    replyMarkup: createHomeKeyboard(locale),
    text: getText(locale, "UPLOAD_DONE_PROMPT"),
  });
}

async function handleEditTrackTitleText(ctx, meta, rawText, pendingAction, musicService, logger, locale = DEFAULT_LOCALE) {
  const normalized = normalizeQuery(rawText);

  if (!normalized) {
    const track = await musicService.lookupTrack(pendingAction.trackId);

    if (!track) {
      await musicService.clearPendingAction(meta.userId);
      await showPanel(ctx, musicService, {
        parseMode: HTML_MODE,
        replyMarkup: createCabinetTracksKeyboard([], locale),
        text: getText(locale, "TRACK_RENAME_ERROR_PROMPT"),
      });
      return;
    }

    await showPanel(ctx, musicService, {
      parseMode: HTML_MODE,
      replyMarkup: createTrackRenameKeyboard(locale),
      text: formatTrackRenamePrompt(track, locale),
    });
    return;
  }

  const updatedTrack = await musicService.updateTrackTitle(meta.userId, pendingAction.trackId, normalized);
  await musicService.clearPendingAction(meta.userId);

  if (!updatedTrack) {
    await showPanel(ctx, musicService, {
      parseMode: HTML_MODE,
      replyMarkup: createCabinetTracksKeyboard([], locale),
      text: getText(locale, "TRACK_RENAME_ERROR_PROMPT"),
    });
    return;
  }

  await logger.log("cabinet_track_renamed", {
    ...meta,
    title: normalized,
    trackId: updatedTrack.id,
  });

  const tracks = await musicService.listUserTracks(meta.userId, 20);
  await showPanel(ctx, musicService, {
    parseMode: HTML_MODE,
    replyMarkup: createCabinetTracksKeyboard(tracks, locale),
    text: formatTrackRenamedMessage(updatedTrack, locale),
  });
}

async function cleanupBrokenTrackSend(error, track, musicService, logger, meta = {}) {
  if (!track || !isBrokenTrackSendError(error)) {
    return false;
  }

  await musicService.deleteTrack(track.id);
  await logger.log("track_deleted_broken_send", {
    ...meta,
    error: serializeError(error),
    trackId: track.id,
  });
  return true;
}

function isBrokenTrackSendError(error) {
  const message = String(error?.description ?? error?.message ?? "");
  return message.includes("wrong file identifier/HTTP URL specified");
}

async function resetPendingState(musicService, userId) {
  if (!userId) {
    return;
  }

  await musicService.clearPendingAction(userId);
  await musicService.clearPendingUpload(userId);
}

async function loadExternalSearchResults(previewSearchService, query) {
  try {
    return {
      error: null,
      results: await previewSearchService.searchTracks(query, SEARCH_RESULT_LIMIT),
    };
  } catch (error) {
    return {
      error,
      results: [],
    };
  }
}

async function getStoredLocale(musicService, userId) {
  if (!userId) {
    return null;
  }

  return normalizeLocale(await musicService.getUserLocale(userId));
}

async function getLocaleOrDefault(musicService, userId) {
  return await getStoredLocale(musicService, userId) ?? DEFAULT_LOCALE;
}

async function requireLocale(ctx, musicService, userId) {
  const locale = await getStoredLocale(musicService, userId);

  if (locale) {
    return locale;
  }

  await showLanguagePicker(ctx, musicService, DEFAULT_LOCALE);
  return null;
}

async function showLanguagePicker(ctx, musicService, locale) {
  await showPanel(ctx, musicService, {
    parseMode: HTML_MODE,
    replyMarkup: createLanguageKeyboard(),
    text: formatLanguagePrompt(locale),
  });
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
      sourceChatId: message.chat?.id ?? null,
      sourceMessageId: message.message_id ?? null,
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
      sourceChatId: message.chat?.id ?? null,
      sourceMessageId: message.message_id ?? null,
    };
  }

  return null;
}

function getUploaderName(ctx) {
  return ctx.from?.username
    ? `@${ctx.from.username}`
    : [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ").trim() || "Unknown";
}

async function storeUploadSourceMessage(ctx, upload, platformSettings = {}) {
  if (!platformSettings.storageChatId || !upload.sourceChatId || !upload.sourceMessageId) {
    return upload;
  }

  const copiedMessage = await ctx.api.copyMessage(
    platformSettings.storageChatId,
    upload.sourceChatId,
    upload.sourceMessageId,
  );

  return {
    ...upload,
    sourceChatId: platformSettings.storageChatId,
    sourceMessageId: copiedMessage?.message_id ?? upload.sourceMessageId,
  };
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
    locale = DEFAULT_LOCALE,
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
  const caption = formatTrackCaption(track, supportLink, locale);
  const commonOptions = {
    caption,
    parse_mode: "HTML",
  };

  const targetChatId = getContextMeta(ctx).chatId;

  if (targetChatId && track.sourceChatId && track.sourceMessageId) {
    try {
      await ctx.api.copyMessage(targetChatId, track.sourceChatId, track.sourceMessageId, commonOptions);
      return;
    } catch {
      // Fall back to file_id for legacy or unavailable source messages.
    }
  }

  if (track.fileType === "document") {
    await ctx.replyWithDocument(track.fileId, commonOptions);
  } else {
    await ctx.replyWithAudio(track.fileId, commonOptions);
  }

  if (includeFollowUp) {
    await showPanel(ctx, musicService, {
      parseMode: HTML_MODE,
      replyMarkup: createInfoKeyboard(locale),
      text: getText(locale, "SENT_TRACK_PROMPT"),
    });
  }
}

async function openCabinetReply(ctx, musicService, logger, platformSettings, locale = DEFAULT_LOCALE) {
  const meta = getContextMeta(ctx);
  const profile = meta.userId ? await musicService.getUserProfile(meta.userId) : emptyProfile();

  await logger.log("cabinet_requested", {
    ...meta,
    starsAvailableXtr: profile.starsAvailableXtr,
    trackCount: profile.trackCount,
  });

  await showPanel(ctx, musicService, {
    parseMode: HTML_MODE,
    replyMarkup: createCabinetKeyboard(locale),
    text: formatCabinetMessage(profile, platformSettings, locale),
  });
}

async function openCabinetEdit(ctx, musicService, logger, platformSettings, locale = DEFAULT_LOCALE) {
  const meta = getContextMeta(ctx);
  const profile = meta.userId ? await musicService.getUserProfile(meta.userId) : emptyProfile();

  await logger.log("cabinet_requested", {
    ...meta,
    starsAvailableXtr: profile.starsAvailableXtr,
    trackCount: profile.trackCount,
  });

  await showPanel(ctx, musicService, {
    parseMode: HTML_MODE,
    replyMarkup: createCabinetKeyboard(locale),
    text: formatCabinetMessage(profile, platformSettings, locale),
  });
}

function createHomeKeyboard(locale = DEFAULT_LOCALE) {
  const labels = getUiLabels(locale);
  return new InlineKeyboard()
    .text(labels.search, "menu:search")
    .row()
    .text(labels.upload, "menu:upload")
    .row()
    .text(labels.cabinet, "menu:cabinet");
}

function createSearchPromptKeyboard(locale = DEFAULT_LOCALE) {
  const labels = getUiLabels(locale);
  return new InlineKeyboard()
    .text(labels.back, "menu:home");
}

function createUploadPromptKeyboard(locale = DEFAULT_LOCALE) {
  const labels = getUiLabels(locale);
  return new InlineKeyboard()
    .text(labels.home, "menu:home");
}

function createUploadTitleKeyboard(suggestedTitle, locale = DEFAULT_LOCALE) {
  const pendingUpload = normalizePendingUploadState(suggestedTitle);
  const labels = getUiLabels(locale);
  const keyboard = new InlineKeyboard();

  if (pendingUpload.title) {
    keyboard.text(
      getText(locale, "UPLOAD_PUBLISH_LABEL", { title: shortenLabel(pendingUpload.title, 24) }),
      "upload:publish",
    ).row();
  } else if (pendingUpload.suggestedTitle) {
    keyboard.text(
      getText(locale, "KEEP_SUGGESTED_LABEL", { title: shortenLabel(pendingUpload.suggestedTitle, 24) }),
      "upload:title:use",
    ).row();
  }

  keyboard.text(
    getText(
      locale,
      pendingUpload.catalogVisible ? "UPLOAD_VISIBILITY_VISIBLE_LABEL" : "UPLOAD_VISIBILITY_HIDDEN_LABEL",
    ),
    "upload:visibility:toggle",
  ).row();

  keyboard.text(labels.cancelUpload, "upload:cancel");

  return keyboard;
}

function createSearchResultsKeyboard(results, locale = DEFAULT_LOCALE, options = {}) {
  return createSearchResultsKeyboardPage(results, {
    page: 0,
    totalPages: 1,
  }, locale, options);
}

function createSearchResultsKeyboardPage(results, pagination, locale = DEFAULT_LOCALE, { showSectionHeaders = false } = {}) {
  const keyboard = new InlineKeyboard();
  let lastRenderedType = null;

  for (const result of results) {
    if (showSectionHeaders && result.type !== lastRenderedType) {
      keyboard.text(getSearchSectionLabel(result.type, locale), "searchpage:stay").row();
      lastRenderedType = result.type;
    }

    keyboard.text(formatSearchResultButton(result), `searchpick:${result.sessionIndex}`).row();
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

    const locale = await getLocaleOrDefault(musicService, viewerUserId);
    const invoiceLink = await createStarsInvoiceLink(ctx, track, intent, locale);

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

async function createStarsInvoiceLink(ctx, track, intent, locale = DEFAULT_LOCALE) {
  return ctx.api.raw.createInvoiceLink({
    currency: "XTR",
    description: `${track.title} | ${track.uploaderName}`,
    payload: intent.payload,
    prices: [{ amount: intent.amountXtr, label: `${intent.amountXtr} XTR` }],
    title: getText(locale, "TRACK_SUPPORT_INVOICE_TITLE"),
  });
}

function createCabinetKeyboard(locale = DEFAULT_LOCALE) {
  const labels = getUiLabels(locale);
  return new InlineKeyboard()
    .text(labels.tracks, "cab:tracks")
    .row()
    .text(labels.withdraw, "cab:withdraw")
    .row()
    .text(labels.back, "menu:home");
}

function createCabinetTracksKeyboard(tracks, locale = DEFAULT_LOCALE) {
  const labels = getUiLabels(locale);
  const keyboard = new InlineKeyboard();

  for (const track of tracks) {
    keyboard
      .text(formatTrackButton(track), `cabtrack:${track.id}`)
      .text(getText(locale, "EDIT_TRACK_LABEL"), `cabedit:${track.id}`)
      .row();
  }

  keyboard.text(labels.back, "menu:cabinet");

  return keyboard;
}

function createTrackRenameKeyboard(locale = DEFAULT_LOCALE) {
  const labels = getUiLabels(locale);
  return new InlineKeyboard()
    .text(labels.back, "cab:tracks");
}

function createWithdrawKeyboard(profile, platformSettings, locale = DEFAULT_LOCALE) {
  const labels = getUiLabels(locale);
  const keyboard = new InlineKeyboard();

  if (profile.starsAvailableXtr >= platformSettings.withdrawMinStars) {
    keyboard.text(labels.requestWithdraw, "withdraw:request").row();
  }

  keyboard.text(labels.back, "menu:cabinet");

  return keyboard;
}

function createWithdrawBackKeyboard(locale = DEFAULT_LOCALE) {
  const labels = getUiLabels(locale);
  return new InlineKeyboard()
    .text(labels.back, "menu:cabinet");
}

function createStarsAmountKeyboard(trackId, amounts, locale = DEFAULT_LOCALE) {
  const labels = getUiLabels(locale);
  const keyboard = new InlineKeyboard();

  for (const amount of amounts) {
    keyboard.text(`${amount} XTR`, `starspay:${trackId}:${amount}`).row();
  }

  keyboard.text(labels.back, `pick:${trackId}`);

  return keyboard;
}

function createInfoKeyboard(locale = DEFAULT_LOCALE) {
  const labels = getUiLabels(locale);
  return new InlineKeyboard()
    .text(labels.searchNew, "menu:search")
    .row()
    .text(labels.cabinet, "menu:cabinet");
}

function createExternalResultKeyboard(result, resultIndex, locale = DEFAULT_LOCALE) {
  const labels = getUiLabels(locale);
  const keyboard = new InlineKeyboard();

  if (result.externalUrl) {
    keyboard.url(getText(locale, "OPEN_ON_PLATFORM_LABEL"), result.externalUrl).row();
  }

  keyboard
    .text(getText(locale, "UPLOAD_EXTERNAL_TRACK_LABEL"), `extupload:${resultIndex}`)
    .row()
    .text(labels.back, "menu:search");

  return keyboard;
}

function createLanguageKeyboard() {
  const keyboard = new InlineKeyboard();

  for (let index = 0; index < SUPPORTED_LOCALES.length; index += 2) {
    const row = SUPPORTED_LOCALES.slice(index, index + 2);

    keyboard.text(`${row[0].flag} ${row[0].name}`, `lang:${row[0].code}`);

    if (row[1]) {
      keyboard.text(`${row[1].flag} ${row[1].name}`, `lang:${row[1].code}`);
    }

    if (index + 2 < SUPPORTED_LOCALES.length) {
      keyboard.row();
    }
  }

  return keyboard;
}

async function renderSearchResultsPanel(ctx, musicService, userId, requestedPage, locale = DEFAULT_LOCALE) {
  const session = userId ? await musicService.getSearchSession(userId) : null;

  if (!session?.results?.length) {
    await showPanel(ctx, musicService, {
      parseMode: HTML_MODE,
      replyMarkup: createSearchPromptKeyboard(locale),
      text: getText(locale, "SEARCH_BUTTON_PROMPT"),
    });
    return;
  }

  const totalPages = Math.max(1, Math.ceil(session.results.length / SEARCH_PAGE_SIZE));
  const safePage = Math.max(0, Math.min(requestedPage, totalPages - 1));
  const showSectionHeaders = hasMixedSearchResultKinds(session.results);
  const pageResults = session.results
    .slice(safePage * SEARCH_PAGE_SIZE, (safePage + 1) * SEARCH_PAGE_SIZE)
    .map((result, index) => ({
      ...result,
      sessionIndex: safePage * SEARCH_PAGE_SIZE + index,
    }))
    .filter(Boolean);

  await musicService.setSearchSession(userId, {
    ...session,
    page: safePage,
  });

  await showPanel(ctx, musicService, {
    parseMode: HTML_MODE,
    replyMarkup: createSearchResultsKeyboardPage(pageResults, {
      page: safePage,
      totalPages,
    }, locale, {
      showSectionHeaders,
    }),
    text: getText(locale, "SEARCH_RESULTS_PROMPT"),
  });
}

function formatSearchResultButton(result) {
  if (result.type === "external") {
    return formatExternalSearchResultButton(result);
  }

  return formatTrackButton(result);
}

function toStoredSearchResult(track) {
  return {
    durationSeconds: track.durationSeconds,
    title: track.title,
    trackId: track.id,
    type: "local",
  };
}

function summarizeResultKinds(results) {
  return results.reduce((summary, result) => {
    summary[result.type] = (summary[result.type] ?? 0) + 1;
    return summary;
  }, {});
}

function hasMixedSearchResultKinds(results) {
  return new Set(results.map((result) => result.type)).size > 1;
}

async function getSearchSessionResult(musicService, userId, resultIndex) {
  const session = userId ? await musicService.getSearchSession(userId) : null;
  return session?.results?.[resultIndex] ?? null;
}

function buildExternalSuggestedTitle(result) {
  return [result.artist, result.title].filter(Boolean).join(" - ") || result.title || "";
}

function shortenLabel(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizePendingUploadState(pendingUpload) {
  if (typeof pendingUpload === "string") {
    return {
      catalogVisible: true,
      suggestedTitle: pendingUpload,
      title: "",
    };
  }

  return {
    catalogVisible: pendingUpload?.catalogVisible !== false,
    suggestedTitle: String(pendingUpload?.suggestedTitle ?? "").trim(),
    title: String(pendingUpload?.title ?? "").trim(),
  };
}

function getSearchSectionLabel(type, locale = DEFAULT_LOCALE) {
  const safeLocale = normalizeLocale(locale) ?? DEFAULT_LOCALE;

  if (type === "local") {
    return "🎵 DemoHub";
  }

  if (safeLocale === "ru") {
    return "🌐 Внешний каталог";
  }

  return "🌐 External Catalog";
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
