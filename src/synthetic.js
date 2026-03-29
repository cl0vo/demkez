import { createHandlers } from "./handlers.js";

export async function dispatchSyntheticUpdate(update, deps) {
  const handlers = createHandlers(deps);
  const { actions, ctx } = createSyntheticContext(update);
  const route = await routeSyntheticUpdate(update, ctx, handlers);

  return {
    actions,
    route,
  };
}

export function createSyntheticContext(update) {
  const actions = [];
  const message = update.message ?? null;
  const callbackQuery = update.callback_query ?? null;
  const chat = message?.chat ?? callbackQuery?.message?.chat ?? null;
  const from = message?.from ?? callbackQuery?.from ?? null;

  const ctx = {
    api: {
      async sendChatAction(chatId, action) {
        actions.push({
          action,
          chatId,
          type: "chat_action",
        });
      },
    },
    async answerCallbackQuery(options = {}) {
      actions.push({
        options,
        type: "answer_callback_query",
      });
    },
    async editMessageText(text, options = {}) {
      actions.push({
        options,
        text,
        type: "edit_message_text",
      });
    },
    async replyWithAudio(file, options = {}) {
      actions.push({
        file,
        options,
        type: "reply_with_audio",
      });

      return {
        audio: {
          file_id: typeof file === "string" ? file : "synthetic-audio-file-id",
        },
        message_id: 2000 + actions.length,
      };
    },
    async replyWithDocument(file, options = {}) {
      actions.push({
        file,
        options,
        type: "reply_with_document",
      });

      return {
        document: {
          file_id: typeof file === "string" ? file : "synthetic-document-file-id",
        },
        message_id: 3000 + actions.length,
      };
    },
    callbackQuery,
    chat,
    from,
    message,
    async reply(text, options = {}) {
      actions.push({
        options,
        text,
        type: "reply",
      });

      return {
        message_id: 1000 + actions.length,
      };
    },
    update,
  };

  return {
    actions,
    ctx,
  };
}

async function routeSyntheticUpdate(update, ctx, handlers) {
  if (update.message?.text === "/start") {
    await handlers.handleStart(ctx);
    return "command:start";
  }

  if (update.message?.text === "/my") {
    await handlers.handleMyTracks(ctx);
    return "command:my";
  }

  if (typeof update.message?.text === "string") {
    await handlers.handleTextMessage(ctx);
    return "message:text";
  }

  if (hasSupportedNonTextMessage(update.message)) {
    await handlers.handleNonTextMessage(ctx);
    return update.message?.audio || update.message?.document ? "message:upload" : "message:non_text";
  }

  if (typeof update.callback_query?.data === "string") {
    const pickMatch = /^pick:(.+)$/.exec(update.callback_query.data);

    if (pickMatch) {
      await handlers.handlePickCallback(ctx, pickMatch[1]);
      return "callback:pick";
    }

    const cabinetTrackMatch = /^cabtrack:(.+)$/.exec(update.callback_query.data);

    if (cabinetTrackMatch) {
      await handlers.handleCabinetTrackCallback(ctx, cabinetTrackMatch[1]);
      return "callback:cabtrack";
    }

    if (update.callback_query.data === "upload:title:use") {
      await handlers.handleUseSuggestedTitle(ctx);
      return "callback:upload_title";
    }

    if (update.callback_query.data === "upload:donation:skip") {
      await handlers.handleSkipDonation(ctx);
      return "callback:upload_skip_donation";
    }

    if (update.callback_query.data === "upload:cancel") {
      await handlers.handleCancelUpload(ctx);
      return "callback:upload_cancel";
    }

    const menuMatch = /^menu:(home|search|upload|cabinet)$/.exec(update.callback_query.data);

    if (menuMatch) {
      await handlers.handleMenuCallback(ctx, menuMatch[1]);
      return "callback:menu";
    }

    const cabinetMatch = /^cab:(tracks|wallet|wallet:clear)$/.exec(update.callback_query.data);

    if (cabinetMatch) {
      await handlers.handleCabinetCallback(ctx, cabinetMatch[1]);
      return "callback:cabinet";
    }

    const donateMatch = /^donate:(.+)$/.exec(update.callback_query.data);

    if (donateMatch) {
      await handlers.handleDonateCallback(ctx, donateMatch[1]);
      return "callback:donate";
    }
  }

  return "ignored";
}

function hasSupportedNonTextMessage(message) {
  if (!message) {
    return false;
  }

  return ["audio", "document", "photo", "sticker", "video", "voice"].some((key) => key in message);
}
