import test from "node:test";
import assert from "node:assert/strict";

import {
  SEARCH_RESULTS_PROMPT,
  START_PROMPT,
  TITLE_SUGGESTION_SAVED_PROMPT,
} from "../src/messages.js";
import { dispatchSyntheticUpdate } from "../src/synthetic.js";

const PLATFORM_SETTINGS = {
  feeBps: 300,
  feePercentLabel: "3%",
  paySupportHandle: "@demohub_support",
  starsHoldDays: 7,
  starsSupportAmounts: [10, 25, 50],
  uploadDailyLimit: 20,
  uploadMaxBytes: 25 * 1024 * 1024,
  uploadMaxMb: 25,
  uploadWindowHours: 24,
  withdrawMinStars: 100,
};

test("start command replies with upload and search prompt", async () => {
  const deps = createTestDeps();
  const execution = await dispatchSyntheticUpdate(createTextUpdate("/start", 1), deps);

  assert.equal(execution.route, "command:start");
  assert.equal(execution.actions[0].text, START_PROMPT);
});

test("first start asks user to choose a language", async () => {
  const deps = createTestDeps({ autoLocale: false });
  const execution = await dispatchSyntheticUpdate(createTextUpdate("/start", 2), deps);

  assert.equal(execution.route, "command:start");
  assert.match(execution.actions[0].text, /Выберите язык/);
  assert.equal(execution.actions[0].options.reply_markup.inline_keyboard[0][0].callback_data, "lang:ru");
});

test("language callback saves locale and opens localized start screen", async () => {
  const deps = createTestDeps({ autoLocale: false });
  const execution = await dispatchSyntheticUpdate(createCallbackUpdate("lang:en"), deps);

  assert.equal(execution.route, "callback:language");
  assert.match(execution.actions[1].text, /Language saved/);
  assert.equal(deps.state.users["20"].locale, "en");
});

test("upload prompt includes suggested title and quick-pick button", async () => {
  const deps = createTestDeps();
  const execution = await dispatchSyntheticUpdate(createAudioUploadUpdate(), deps);

  assert.equal(execution.route, "message:upload");
  assert.match(execution.actions[0].text, /Например: <code>Travis Scott - FE!N<\/code>/);
  assert.match(execution.actions[0].text, /<b>Подсказка:<\/b> Travis Scott - FE!N/);
  assert.equal(
    execution.actions[0].options.reply_markup.inline_keyboard[0][0].callback_data,
    "upload:title:use",
  );
});

test("upload rejects file over max size", async () => {
  const deps = createTestDeps();
  const execution = await dispatchSyntheticUpdate(createAudioUploadUpdate({ fileSize: 30 * 1024 * 1024 }), deps);

  assert.equal(execution.route, "message:upload");
  assert.match(execution.actions[0].text, /Файл слишком большой/);
});

test("upload rejects when 24h limit is reached", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [],
      supportPayments: [],
      tracks: Array.from({ length: 20 }, (_, index) => track(`track-${index + 1}`, `Demo ${index + 1}`, "@tester")),
      users: {},
    },
  });

  const execution = await dispatchSyntheticUpdate(createAudioUploadUpdate(), deps);

  assert.equal(execution.route, "message:upload");
  assert.match(execution.actions[0].text, /Лимит загрузок на сегодня исчерпан/);
});

test("suggested title callback publishes track immediately", async () => {
  const deps = createTestDeps();
  await dispatchSyntheticUpdate(createAudioUploadUpdate(), deps);

  const execution = await dispatchSyntheticUpdate(createCallbackUpdate("upload:title:use"), deps);

  assert.equal(execution.route, "callback:upload_title");
  assert.equal(execution.actions[1].text, TITLE_SUGGESTION_SAVED_PROMPT);
  assert.equal(deps.state.tracks.length, 1);
});

test("cabinet opens with stars balance entry", async () => {
  const deps = createTestDeps();

  const cabinet = await dispatchSyntheticUpdate(createTextUpdate("/my", 10), deps);
  assert.equal(cabinet.route, "command:my");
  assert.match(cabinet.actions[0].text, /^👤 <b>Кабинет<\/b>/);
  assert.match(cabinet.actions[0].text, /⭐ Баланс: 0 Stars/);
  const cabinetButtons = cabinet.actions[0].options.reply_markup.inline_keyboard.flat().map((button) => button.text);
  assert.deepEqual(cabinetButtons, ["🎵 Мои треки", "💸 Вывод", "← Назад"]);

  const balance = await dispatchSyntheticUpdate(createCallbackUpdate("cab:withdraw"), deps);
  assert.equal(balance.route, "callback:cabinet");
  assert.match(balance.actions[1].text, /^💸 <b>Вывод Stars<\/b>/);
});

test("balance command opens stars balance directly", async () => {
  const deps = createTestDeps();

  const execution = await dispatchSyntheticUpdate(createTextUpdate("/balance", 14), deps);

  assert.equal(execution.route, "command:balance");
  assert.match(execution.actions[0].text, /^⭐ <b>Баланс<\/b>/);
  assert.match(execution.actions[0].text, /Вывод открывается от <b>100 Stars<\/b>/);
});

test("rules command returns upload and balance rules", async () => {
  const deps = createTestDeps();

  const execution = await dispatchSyntheticUpdate(createTextUpdate("/rules", 15), deps);

  assert.equal(execution.route, "command:rules");
  assert.match(execution.actions[0].text, /📘 <b>Как работает DemoHub<\/b>/);
  assert.match(execution.actions[0].text, /до 25 MB на файл/);
  assert.match(execution.actions[0].text, /до 20 загрузок за 24 часа/);
  assert.match(execution.actions[0].text, /Stars<\/b> за поддержку будут зачисляться владельцу трека на внутренний баланс/);
});

test("search returns saved tracks as inline buttons", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [],
      supportPayments: [],
      tracks: [track("track-1", "My Demo", "@tester")],
      users: {},
    },
  });

  const execution = await dispatchSyntheticUpdate(createTextUpdate("demo", 5), deps);

  assert.equal(execution.actions[1].text, SEARCH_RESULTS_PROMPT);
  const buttons = execution.actions[1].options.reply_markup.inline_keyboard.flat().map((button) => button.text);

  assert.deepEqual(buttons.slice(0, 1), ["My Demo"]);
  assert.ok(!buttons.includes("@tester"));
  assert.equal(execution.actions[1].options.reply_markup.inline_keyboard[0][0].callback_data, "searchpick:0");
});

test("search does not match uploader nickname", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [],
      supportPayments: [],
      tracks: [track("track-1", "My Demo", "@tester")],
      users: {},
    },
  });

  const execution = await dispatchSyntheticUpdate(createTextUpdate("@tester", 6), deps);

  assert.equal(execution.route, "message:text");
  assert.equal(execution.actions[1].text, "Ничего не нашлось.\nПопробуйте другой запрос.");
});

test("search falls back to external preview results when local catalog is empty", async () => {
  const deps = createTestDeps({
    previewResults: [
      externalTrack("itunes:1", "FE!N", "Travis Scott", 191, "https://music.example/track-1"),
    ],
  });

  const execution = await dispatchSyntheticUpdate(createTextUpdate("fein", 61), deps);

  assert.equal(execution.route, "message:text");
  assert.equal(execution.actions[1].text, SEARCH_RESULTS_PROMPT);
  assert.match(execution.actions[1].options.reply_markup.inline_keyboard[0][0].text, /Travis Scott - FE!N/);
  assert.equal(execution.actions[1].options.reply_markup.inline_keyboard[0][0].callback_data, "searchpick:0");
});

test("external search result opens placeholder card and upload action", async () => {
  const deps = createTestDeps({
    previewResults: [
      externalTrack("itunes:1", "FE!N", "Travis Scott", 191, "https://music.example/track-1"),
    ],
  });

  await dispatchSyntheticUpdate(createTextUpdate("fein", 62), deps);
  const execution = await dispatchSyntheticUpdate(createSearchPickUpdate(0), deps);

  assert.equal(execution.route, "callback:searchpick");
  assert.match(execution.actions[1].text, /ещё не загружен в DemoHub/);
  assert.match(execution.actions[1].text, /Travis Scott/);
  assert.deepEqual(
    execution.actions[1].options.reply_markup.inline_keyboard.map((row) => row[0].text),
    ["↗️ Открыть на платформе", "⬆️ Загрузить этот трек в DemoHub", "← Назад"],
  );
});

test("external upload action stores suggested title and opens upload prompt", async () => {
  const deps = createTestDeps({
    previewResults: [
      externalTrack("itunes:1", "FE!N", "Travis Scott", 191, "https://music.example/track-1"),
    ],
  });

  await dispatchSyntheticUpdate(createTextUpdate("fein", 63), deps);
  const execution = await dispatchSyntheticUpdate(createCallbackUpdate("extupload:0"), deps);

  assert.equal(execution.route, "callback:extupload");
  assert.match(execution.actions[1].text, /Загрузите этот трек в DemoHub/);
  assert.match(execution.actions[1].text, /Travis Scott - FE!N/);
  assert.equal(deps.state.users["20"].pendingAction?.suggestedTitle, "Travis Scott - FE!N");
});

test("search paginates long result lists", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [],
      supportPayments: [],
      tracks: Array.from({ length: 10 }, (_, index) => track(`track-${index + 1}`, `Monday ${index + 1}`, "@tester", 20, 120 + index)),
      users: {},
    },
  });

  const search = await dispatchSyntheticUpdate(createTextUpdate("monday", 7), deps);

  assert.equal(search.route, "message:text");
  assert.deepEqual(
    search.actions[1].options.reply_markup.inline_keyboard.slice(-1)[0].map((button) => button.text),
    ["◀️", "1/2", "▶️"],
  );

  const nextPage = await dispatchSyntheticUpdate(createCallbackUpdate("searchpage:1"), deps);

  assert.equal(nextPage.route, "callback:searchpage");
  assert.equal(nextPage.actions[1].text, SEARCH_RESULTS_PROMPT);
  assert.match(nextPage.actions[1].options.reply_markup.inline_keyboard[0][0].text, /Monday 9|Monday 10/);
  assert.deepEqual(
    nextPage.actions[1].options.reply_markup.inline_keyboard.slice(-1)[0].map((button) => button.text),
    ["◀️", "2/2", "▶️"],
  );
});

test("search prompt keeps only one back button", async () => {
  const deps = createTestDeps();

  const execution = await dispatchSyntheticUpdate(createCallbackUpdate("menu:search"), deps);

  assert.equal(execution.route, "callback:menu");
  assert.equal(execution.actions[1].text, "🔎 <b>Поиск</b>\nНапишите название трека или артиста.");
  assert.deepEqual(
    execution.actions[1].options.reply_markup.inline_keyboard,
    [[{ text: "← Назад", callback_data: "menu:home" }]],
  );
});

test("cabinet tracks renders as track buttons with back button", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [],
      supportPayments: [],
      tracks: [track("track-1", "My Demo", "@tester"), track("track-2", "Second Demo", "@tester")],
      users: {},
    },
  });

  const execution = await dispatchSyntheticUpdate(createCallbackUpdate("cab:tracks"), deps);

  assert.equal(execution.route, "callback:cabinet");
  assert.equal(execution.actions[1].text, "🎵 <b>Мои треки</b>");
  assert.deepEqual(
    execution.actions[1].options.reply_markup.inline_keyboard.map((row) => row.map((button) => button.text)),
    [["My Demo", "✏️"], ["Second Demo", "✏️"], ["← Назад"]],
  );
  assert.equal(
    execution.actions[1].options.reply_markup.inline_keyboard[0][0].callback_data,
    "cabtrack:track-1",
  );
  assert.equal(
    execution.actions[1].options.reply_markup.inline_keyboard[0][1].callback_data,
    "cabedit:track-1",
  );
});

test("cabinet track selection reposts audio without closing menu", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [],
      supportPayments: [],
      tracks: [track("track-1", "My Demo", "@tester")],
      users: {},
    },
  });

  const execution = await dispatchSyntheticUpdate(createCallbackUpdate("cabtrack:track-1"), deps);

  assert.equal(execution.route, "callback:cabtrack");
  assert.deepEqual(
    execution.actions.map((action) => action.type),
    ["answer_callback_query", "create_invoice_link", "reply_with_audio", "edit_message_text"],
  );
  assert.match(execution.actions[2].options.caption, /<a href="https:\/\/t\.me\/invoice\/stars:intent-1">💫 Поддержать<\/a>/);
  assert.match(execution.actions[3].text, /Трек открыт/);
});

test("stored track prefers copying original message when source message is saved", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [],
      supportPayments: [],
      tracks: [track("track-1", "My Demo", "@tester", 20, 0, { sourceChatId: 10, sourceMessageId: 50 })],
      users: {},
    },
  });

  const execution = await dispatchSyntheticUpdate(createPickUpdate("track-1"), deps);

  assert.deepEqual(
    execution.actions.map((action) => action.type),
    ["answer_callback_query", "create_invoice_link", "copy_message", "edit_message_text"],
  );
  assert.equal(execution.actions[2].chatId, 10);
  assert.equal(execution.actions[2].fromChatId, 10);
  assert.equal(execution.actions[2].messageId, 50);
});

test("broken stored track is deleted from catalog after telegram send failure", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [],
      supportPayments: [],
      tracks: [track("track-1", "Broken Demo", "@tester")],
      users: {},
    },
  });

  deps.musicService.lookupTrack = async () => ({
    ...deps.state.tracks[0],
    fileId: "broken-file-id",
  });

  const execution = await dispatchSyntheticUpdate(createCallbackUpdate("cabtrack:track-1"), deps);
  const textAction = execution.actions.find((action) => action.text);

  assert.equal(execution.route, "callback:cabtrack");
  assert.match(textAction?.text, /удалён из DemoHub/);
  assert.equal(deps.state.tracks.length, 0);
});

test("cabinet edit track opens rename prompt", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [],
      supportPayments: [],
      tracks: [track("track-1", "My Demo", "@tester")],
      users: {},
    },
  });

  const execution = await dispatchSyntheticUpdate(createCallbackUpdate("cabedit:track-1"), deps);

  assert.equal(execution.route, "callback:cabedit");
  assert.match(execution.actions[1].text, /Изменить название трека/);
  assert.match(execution.actions[1].text, /My Demo/);
  assert.equal(deps.state.users["20"].pendingAction?.trackId, "track-1");
});

test("text after cabinet edit renames track and refreshes my tracks list", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [],
      supportPayments: [],
      tracks: [track("track-1", "My Demo", "@tester")],
      users: {
        20: {
          locale: "ru",
          pendingAction: {
            trackId: "track-1",
            type: "edit_track_title",
          },
        },
      },
    },
  });

  const execution = await dispatchSyntheticUpdate(createTextUpdate("New Demo", 301), deps);

  assert.equal(execution.route, "message:text");
  assert.match(execution.actions[0].text, /Название обновлено/);
  assert.match(execution.actions[0].text, /New Demo/);
  assert.equal(deps.state.tracks[0].title, "New Demo");
  assert.equal(deps.state.users["20"].pendingAction, undefined);
});

test("selection sends stored audio and exposes stars button", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [],
      supportPayments: [],
      tracks: [track("track-1", "My Demo", "@tester", 44)],
      users: {},
    },
  });

  const execution = await dispatchSyntheticUpdate(createPickUpdate("track-1"), deps);

  assert.deepEqual(
    execution.actions.map((action) => action.type),
    ["answer_callback_query", "create_invoice_link", "reply_with_audio", "edit_message_text"],
  );
  assert.match(execution.actions[2].options.caption, /uploaded by @tester/);
  assert.match(execution.actions[2].options.caption, /<a href="https:\/\/t\.me\/invoice\/stars:intent-1">💫 Поддержать<\/a>/);
  assert.match(execution.actions[3].text, /Трек открыт/);
});

test("stars donate callback shows amount options", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [],
      supportPayments: [],
      tracks: [track("track-1", "My Demo", "@tester", 44)],
      users: {},
    },
  });

  const execution = await dispatchSyntheticUpdate(createCallbackUpdate("donate:track-1"), deps);

  assert.equal(execution.route, "callback:donate");
  assert.match(execution.actions[1].text, /^⭐ <b>Поддержать трек<\/b>/);
  const buttons = execution.actions[1].options.reply_markup.inline_keyboard.flat().map((button) => button.text);
  assert.deepEqual(buttons, ["10 XTR", "25 XTR", "50 XTR", "← Назад"]);
});

test("stars amount callback creates invoice", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [],
      supportPayments: [],
      tracks: [track("track-1", "My Demo", "@tester", 44)],
      users: {},
    },
  });

  const execution = await dispatchSyntheticUpdate(createCallbackUpdate("starspay:track-1:25"), deps);

  assert.equal(execution.route, "callback:starspay");
  assert.deepEqual(
    execution.actions.map((action) => action.type),
    ["answer_callback_query", "reply_with_invoice"],
  );
  assert.equal(execution.actions[1].currency, "XTR");
  assert.equal(execution.actions[1].prices[0].amount, 25);
});

test("pre checkout approves valid stars payload", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [
        supportIntent({ donorUserId: 20, payload: "stars:intent-1" }),
      ],
      supportPayments: [],
      tracks: [track("track-1", "My Demo", "@tester", 44)],
      users: {},
    },
  });

  const execution = await dispatchSyntheticUpdate(createPreCheckoutUpdate("stars:intent-1"), deps);

  assert.equal(execution.route, "pre_checkout_query");
  assert.deepEqual(execution.actions, [
    { ok: true, options: {}, type: "answer_pre_checkout_query" },
  ]);
});

test("successful stars payment updates internal balance", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [
        supportIntent({ donorUserId: 20, payload: "stars:intent-1" }),
      ],
      supportPayments: [],
      tracks: [track("track-1", "My Demo", "@tester", 44)],
      users: {},
    },
  });

  const execution = await dispatchSyntheticUpdate(createSuccessfulPaymentUpdate("stars:intent-1", 100), deps);

  assert.equal(execution.route, "message:successful_payment");
  assert.match(execution.actions[0].text, /На баланс владельца зачислено: <b>\+97 Stars<\/b>/);
  assert.equal(deps.state.supportPayments.length, 1);
  assert.equal(deps.state.supportPayments[0].authorShareXtr, 97);
});

test("withdraw request opens support instructions when stars threshold is reached", async () => {
  const deps = createTestDeps({
    state: {
      supportIntents: [],
      supportPayments: [
        {
          authorShareXtr: 120,
          authorUserId: 20,
          paidAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          releaseAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          status: "successful",
        },
      ],
      tracks: [],
      users: {},
    },
  });

  const withdraw = await dispatchSyntheticUpdate(createCallbackUpdate("cab:withdraw"), deps);

  assert.equal(withdraw.route, "callback:cabinet");
  assert.deepEqual(
    withdraw.actions[1].options.reply_markup.inline_keyboard,
    [
      [{ text: "✉️ Запросить вывод", callback_data: "withdraw:request" }],
      [{ text: "← Назад", callback_data: "menu:cabinet" }],
    ],
  );

  const request = await dispatchSyntheticUpdate(createCallbackUpdate("withdraw:request"), deps);

  assert.equal(request.route, "callback:withdraw_request");
  assert.match(request.actions[1].text, /Заявка на вывод/);
  assert.match(request.actions[1].text, /@demohub_support/);
});

function createTestDeps({
  autoLocale = true,
  previewResults = [],
  state = { supportIntents: [], supportPayments: [], tracks: [], users: {} },
} = {}) {
  const events = [];
  state.users ??= {};

  if (autoLocale) {
    state.users["20"] = {
      ...(state.users["20"] ?? {}),
      locale: state.users["20"]?.locale ?? "ru",
    };
  }

  return {
    events,
    logger: {
      async log(event, payload) {
        events.push({ event, ...payload });
      },
    },
    musicService: createMemoryCatalog(state),
    previewSearchService: {
      async searchTracks() {
        return previewResults;
      },
    },
    platformSettings: PLATFORM_SETTINGS,
    replayStore: {
      async capture() {
        return ".runtime/replays/test.json";
      },
    },
    state,
  };
}

function createMemoryCatalog(state) {
  return {
    async beginUpload(upload) {
      state.users[String(upload.userId)] ??= {};
      state.users[String(upload.userId)].pendingUpload = { ...upload };
      return state.users[String(upload.userId)].pendingUpload;
    },
    async clearPendingAction(userId) {
      delete state.users[String(userId)]?.pendingAction;
      return true;
    },
    async clearPendingUpload() {
      return false;
    },
    async clearUiPanel(userId) {
      delete state.users[String(userId)]?.uiPanel;
      return true;
    },
    async getRecentUploadCount(userId, windowHours) {
      const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
      return state.tracks.filter((entry) => entry.uploaderUserId === Number(userId) && Date.parse(entry.createdAt) >= cutoff).length;
    },
    async createStarsSupportIntent({ amountXtr, donorUserId, trackId }) {
      const trackEntry = state.tracks.find((entry) => entry.id === trackId);

      if (!trackEntry) {
        return null;
      }

      const intent = supportIntent({
        amountXtr,
        authorShareXtr: Math.floor((amountXtr * 97) / 100),
        authorUserId: trackEntry.uploaderUserId,
        donorUserId,
        payload: `stars:intent-${state.supportIntents.length + 1}`,
        platformShareXtr: amountXtr - Math.floor((amountXtr * 97) / 100),
        trackId,
        trackTitle: trackEntry.title,
        uploaderName: trackEntry.uploaderName,
      });

      state.supportIntents.unshift(intent);
      return intent;
    },
    async approveStarsSupportIntent(payload, donorUserId) {
      const intent = state.supportIntents.find((entry) => entry.payload === payload && entry.donorUserId === Number(donorUserId));

      if (!intent) {
        return null;
      }

      intent.status = "prechecked";
      return intent;
    },
    async completeStarsSupportPayment({ donorUserId, payload, providerPaymentChargeId, telegramPaymentChargeId, totalAmountXtr }) {
      const intent = state.supportIntents.find((entry) => entry.payload === payload && entry.donorUserId === Number(donorUserId));

      if (!intent || intent.amountXtr !== totalAmountXtr) {
        return null;
      }

      const payment = {
        amountXtr: intent.amountXtr,
        authorShareXtr: intent.authorShareXtr,
        authorUserId: intent.authorUserId,
        donorUserId: Number(donorUserId),
        platformShareXtr: intent.platformShareXtr,
        providerPaymentChargeId,
        status: "successful",
        telegramPaymentChargeId,
        trackId: intent.trackId,
      };

      state.supportPayments.unshift(payment);
      intent.status = "paid";
      return payment;
    },
    async finalizePendingUpload(userId) {
      const pending = state.users[String(userId)]?.pendingUpload;

      if (!pending?.title) {
        return null;
      }

      const savedTrack = {
        createdAt: new Date().toISOString(),
        fileId: pending.fileId,
        fileType: pending.fileType,
        id: `track-${state.tracks.length + 1}`,
        mimeType: pending.mimeType,
        sourceChatId: pending.sourceChatId,
        sourceMessageId: pending.sourceMessageId,
        supportsStars: true,
        title: pending.title,
        uploaderName: pending.uploaderName,
        uploaderUserId: Number(userId),
        uploaderUsername: pending.uploaderUsername,
      };

      state.tracks.unshift(savedTrack);
      delete state.users[String(userId)].pendingUpload;
      return savedTrack;
    },
    async getPendingAction(userId) {
      return state.users[String(userId)]?.pendingAction ?? null;
    },
    async getPendingUpload(userId) {
      return state.users[String(userId)]?.pendingUpload ?? null;
    },
    async getUserLocale(userId) {
      return state.users[String(userId)]?.locale ?? null;
    },
    async getSearchSession(userId) {
      return state.users[String(userId)]?.searchSession ?? null;
    },
    async getUiPanel(userId) {
      return state.users[String(userId)]?.uiPanel ?? null;
    },
    async getUserProfile(userId) {
      const payments = state.supportPayments.filter((payment) => payment.authorUserId === Number(userId) && payment.status === "successful");
      const now = Date.now();
      const available = payments
        .filter((payment) => payment.releaseAt && Date.parse(payment.releaseAt) <= now)
        .reduce((sum, payment) => sum + payment.authorShareXtr, 0);
      const pending = payments
        .filter((payment) => !payment.releaseAt || Date.parse(payment.releaseAt) > now)
        .reduce((sum, payment) => sum + payment.authorShareXtr, 0);
      return {
        isBanned: false,
        starsAvailableXtr: available,
        starsFrozenXtr: 0,
        starsPendingXtr: pending,
        starsTotalXtr: available + pending,
        supportPaymentsCount: payments.length,
        trackCount: state.tracks.filter((trackEntry) => trackEntry.uploaderUserId === Number(userId)).length,
      };
    },
    async listUserTracks(userId) {
      return state.tracks.filter((trackEntry) => trackEntry.uploaderUserId === Number(userId));
    },
    async lookupTrack(trackId) {
      return state.tracks.find((trackEntry) => trackEntry.id === trackId) ?? null;
    },
    async savePendingTitle(userId, title) {
      state.users[String(userId)].pendingUpload.title = title;
      return state.users[String(userId)].pendingUpload;
    },
    async updateTrackTitle(userId, trackId, title) {
      const trackEntry = state.tracks.find((entry) => entry.id === trackId && entry.uploaderUserId === Number(userId));

      if (!trackEntry) {
        return null;
      }

      trackEntry.title = title;
      return trackEntry;
    },
    async deleteTrack(trackId) {
      const index = state.tracks.findIndex((entry) => entry.id === trackId);

      if (index === -1) {
        return null;
      }

      const [removed] = state.tracks.splice(index, 1);
      state.supportIntents = state.supportIntents.filter((entry) => entry.trackId !== trackId);
      state.supportPayments = state.supportPayments.filter((entry) => entry.trackId !== trackId);

      for (const user of Object.values(state.users)) {
        if (Array.isArray(user?.searchSession?.results)) {
          user.searchSession.results = user.searchSession.results.filter((entry) => entry.trackId !== trackId);
        }
      }

      return removed;
    },
    async searchTracks(query, limit = 5) {
      const normalized = query.toLowerCase();
      return state.tracks.filter((trackEntry) => trackEntry.title.toLowerCase().includes(normalized)).slice(0, limit);
    },
    async setSearchSession(userId, session) {
      state.users[String(userId)] ??= {};
      state.users[String(userId)].searchSession = session;
      return session;
    },
    async setPendingAction(userId, action) {
      state.users[String(userId)] ??= {};
      state.users[String(userId)].pendingAction = action;
      return action;
    },
    async setUserLocale(userId, locale) {
      state.users[String(userId)] ??= {};
      state.users[String(userId)].locale = locale;
      return locale;
    },
    async setUiPanel(userId, panel) {
      state.users[String(userId)] ??= {};
      state.users[String(userId)].uiPanel = panel;
      return panel;
    },
  };
}

function createTextUpdate(text, updateId) {
  return {
    message: {
      chat: { id: 10, type: "private" },
      date: 0,
      from: { first_name: "Test", id: 20, is_bot: false, username: "tester" },
      message_id: updateId,
      text,
    },
    update_id: updateId,
  };
}

function createAudioUploadUpdate({ fileSize = 5 * 1024 * 1024 } = {}) {
  return {
    message: {
      audio: {
        duration: 10,
        file_id: "audio-file-1",
        file_name: "travis_scott-fein.mp3",
        file_size: fileSize,
        mime_type: "audio/mpeg",
        performer: "Travis Scott",
        title: "FE!N",
      },
      chat: { id: 10, type: "private" },
      date: 0,
      from: { first_name: "Test", id: 20, is_bot: false, username: "tester" },
      message_id: 50,
    },
    update_id: 50,
  };
}

function createPickUpdate(trackId) {
  return {
    callback_query: {
      data: `pick:${trackId}`,
      from: { first_name: "Test", id: 20, is_bot: false, username: "tester" },
      id: `cb-${trackId}`,
      message: {
        chat: { id: 10, type: "private" },
        date: 0,
        message_id: 3,
        text: SEARCH_RESULTS_PROMPT,
      },
    },
    update_id: 3,
  };
}

function createSearchPickUpdate(resultIndex) {
  return createCallbackUpdate(`searchpick:${resultIndex}`);
}

function createCallbackUpdate(data) {
  return {
    callback_query: {
      data,
      from: { first_name: "Test", id: 20, is_bot: false, username: "tester" },
      id: `cb-${data}`,
      message: {
        chat: { id: 10, type: "private" },
        date: 0,
        message_id: 4,
        text: "callback",
      },
    },
    update_id: 4,
  };
}

function createPreCheckoutUpdate(payload) {
  return {
    pre_checkout_query: {
      currency: "XTR",
      from: { first_name: "Test", id: 20, is_bot: false, username: "tester" },
      id: "pre-checkout-1",
      invoice_payload: payload,
      total_amount: 100,
    },
    update_id: 70,
  };
}

function createSuccessfulPaymentUpdate(payload, amount) {
  return {
    message: {
      chat: { id: 10, type: "private" },
      date: 0,
      from: { first_name: "Test", id: 20, is_bot: false, username: "tester" },
      message_id: 71,
      successful_payment: {
        currency: "XTR",
        invoice_payload: payload,
        provider_payment_charge_id: "",
        telegram_payment_charge_id: "charge-1",
        total_amount: amount,
      },
    },
    update_id: 71,
  };
}

function track(id, title, uploaderName, uploaderUserId = 20, durationSeconds = 0, overrides = {}) {
  return {
    createdAt: new Date().toISOString(),
    durationSeconds,
    fileId: "audio-file-1",
    fileType: "audio",
    id,
    mimeType: "audio/mpeg",
    supportsStars: true,
    title,
    uploaderName,
    uploaderUserId,
    uploaderUsername: "tester",
    ...overrides,
  };
}

function externalTrack(externalId, title, artist, durationSeconds = 0, externalUrl = "") {
  return {
    artist,
    durationSeconds,
    externalId,
    externalUrl,
    source: "Apple Music",
    title,
    type: "external",
  };
}

function supportIntent({
  amountXtr = 100,
  authorShareXtr = 97,
  authorUserId = 44,
  donorUserId = 20,
  payload,
  platformShareXtr = 3,
  trackId = "track-1",
  trackTitle = "My Demo",
  uploaderName = "@tester",
} = {}) {
  return {
    amountXtr,
    authorShareXtr,
    authorUserId,
    createdAt: new Date().toISOString(),
    donorUserId,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    id: "intent-1",
    payload,
    platformShareXtr,
    status: "created",
    trackId,
    trackTitle,
    uploaderName,
  };
}
