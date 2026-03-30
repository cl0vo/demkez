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
  const preCheckoutQuery = update.pre_checkout_query ?? null;
  const chat = message?.chat ?? callbackQuery?.message?.chat ?? preCheckoutQuery?.from ?? null;
  const from = message?.from ?? callbackQuery?.from ?? preCheckoutQuery?.from ?? null;

  const ctx = {
    api: {
      raw: {
        async createInvoiceLink(invoice) {
          actions.push({
            invoice,
            type: "create_invoice_link",
          });

          return `https://t.me/invoice/${invoice.payload}`;
        },
      },
      async deleteMessage(chatId, messageId) {
        actions.push({
          chatId,
          messageId,
          type: "delete_message",
        });
      },
      async copyMessage(chatId, fromChatId, messageId, options = {}) {
        actions.push({
          chatId,
          fromChatId,
          messageId,
          options,
          type: "copy_message",
        });
      },
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
    async answerPreCheckoutQuery(ok, other = {}) {
      actions.push({
        ok,
        options: typeof other === "string" ? { error_message: other } : other,
        type: "answer_pre_checkout_query",
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
      if (file === "broken-file-id") {
        const error = new Error("Call to 'sendAudio' failed! (400: Bad Request: wrong file identifier/HTTP URL specified)");
        error.name = "GrammyError";
        throw error;
      }

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
    async replyWithInvoice(title, description, payload, currency, prices, options = {}) {
      actions.push({
        currency,
        description,
        options,
        payload,
        prices,
        title,
        type: "reply_with_invoice",
      });

      return {
        invoice: {
          currency,
          payload,
        },
        message_id: 4000 + actions.length,
      };
    },
    callbackQuery,
    chat,
    from,
    message,
    preCheckoutQuery,
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

  if (update.message?.text === "/balance") {
    await handlers.handleBalance(ctx);
    return "command:balance";
  }

  if (update.message?.text === "/language") {
    await handlers.handleLanguageCommand(ctx);
    return "command:language";
  }

  if (update.message?.text === "/paysupport") {
    await handlers.handlePaySupport(ctx);
    return "command:paysupport";
  }

  if (update.message?.text === "/rules") {
    await handlers.handleRules(ctx);
    return "command:rules";
  }

  if (update.message?.successful_payment) {
    await handlers.handleSuccessfulPayment(ctx);
    return "message:successful_payment";
  }

  if (update.pre_checkout_query) {
    await handlers.handlePreCheckout(ctx);
    return "pre_checkout_query";
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
    const pickMatch = /^searchpick:(\d+)$/.exec(update.callback_query.data);

    if (pickMatch) {
      await handlers.handleSearchResultCallback(ctx, Number.parseInt(pickMatch[1], 10));
      return "callback:searchpick";
    }

    const directPickMatch = /^pick:(.+)$/.exec(update.callback_query.data);

    if (directPickMatch) {
      await handlers.handlePickCallback(ctx, directPickMatch[1]);
      return "callback:pick";
    }

    const externalUploadMatch = /^extupload:(\d+)$/.exec(update.callback_query.data);

    if (externalUploadMatch) {
      await handlers.handleExternalUploadCallback(ctx, Number.parseInt(externalUploadMatch[1], 10));
      return "callback:extupload";
    }

    const cabinetTrackMatch = /^cabtrack:(.+)$/.exec(update.callback_query.data);

    if (cabinetTrackMatch) {
      await handlers.handleCabinetTrackCallback(ctx, cabinetTrackMatch[1]);
      return "callback:cabtrack";
    }

    const cabinetEditMatch = /^cabedit:(.+)$/.exec(update.callback_query.data);

    if (cabinetEditMatch) {
      await handlers.handleCabinetEditTrackCallback(ctx, cabinetEditMatch[1]);
      return "callback:cabedit";
    }

    const searchPageMatch = /^searchpage:(stay|\d+)$/.exec(update.callback_query.data);

    if (searchPageMatch) {
      if (searchPageMatch[1] === "stay") {
        await ctx.answerCallbackQuery();
        return "callback:searchpage";
      }

      await handlers.handleSearchPageCallback(ctx, Number.parseInt(searchPageMatch[1], 10));
      return "callback:searchpage";
    }

    const languageMatch = /^lang:([a-z]{2})$/.exec(update.callback_query.data);

    if (languageMatch) {
      await handlers.handleLanguageCallback(ctx, languageMatch[1]);
      return "callback:language";
    }

    const starsPayMatch = /^starspay:(.+):(\d+)$/.exec(update.callback_query.data);

    if (starsPayMatch) {
      await handlers.handleStarsAmountCallback(ctx, starsPayMatch[1], Number.parseInt(starsPayMatch[2], 10));
      return "callback:starspay";
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

    const cabinetMatch = /^cab:(tracks|withdraw)$/.exec(update.callback_query.data);

    if (cabinetMatch) {
      await handlers.handleCabinetCallback(ctx, cabinetMatch[1]);
      return "callback:cabinet";
    }

    if (update.callback_query.data === "withdraw:request") {
      await handlers.handleWithdrawRequest(ctx);
      return "callback:withdraw_request";
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
