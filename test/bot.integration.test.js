import test from "node:test";
import assert from "node:assert/strict";

import {
  SEARCH_RESULTS_PROMPT,
  SENT_TRACK_PROMPT,
  START_PROMPT,
  TITLE_SUGGESTION_SAVED_PROMPT,
  TON_WALLET_INVALID_PROMPT,
  TON_WALLET_PROMPT,
  TON_WALLET_SAVED_PROMPT,
  UPLOAD_DONATION_PROMPT,
} from "../src/messages.js";
import { dispatchSyntheticUpdate } from "../src/synthetic.js";

const PLATFORM_SETTINGS = {
  feeBps: 300,
  feePercentLabel: "3%",
  platformTonAddress: "UQ-platform",
};
const VALID_TON_ADDRESS = "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ";

test("start command replies with upload and search prompt", async () => {
  const deps = createTestDeps();
  const execution = await dispatchSyntheticUpdate(createTextUpdate("/start", 1), deps);

  assert.equal(execution.route, "command:start");
  assert.equal(execution.actions[0].text, START_PROMPT);
});

test("upload prompt includes suggested title and quick-pick button", async () => {
  const deps = createTestDeps();
  const execution = await dispatchSyntheticUpdate(createAudioUploadUpdate(), deps);

  assert.equal(execution.route, "message:upload");
  assert.match(execution.actions[0].text, /Например: Travis Scott - FE!N/);
  assert.match(execution.actions[0].text, /Похоже на: Travis Scott - FE!N/);
  assert.equal(
    execution.actions[0].options.reply_markup.inline_keyboard[0][0].callback_data,
    "upload:title:use",
  );
});

test("suggested title callback saves title and moves to donation step", async () => {
  const deps = createTestDeps();
  await dispatchSyntheticUpdate(createAudioUploadUpdate(), deps);

  const execution = await dispatchSyntheticUpdate(createCallbackUpdate("upload:title:use"), deps);

  assert.equal(execution.route, "callback:upload_title");
  assert.equal(execution.actions[1].text, TITLE_SUGGESTION_SAVED_PROMPT);
  assert.equal(deps.state.users["20"].pendingUpload.title, "Travis Scott - FE!N");
});

test("cabinet opens and TON wallet can be connected", async () => {
  const deps = createTestDeps();

  const cabinet = await dispatchSyntheticUpdate(createTextUpdate("/my", 10), deps);
  assert.equal(cabinet.route, "command:my");
  assert.match(cabinet.actions[0].text, /demkez кабинет/);
  assert.match(cabinet.actions[0].text, /Сплит: 97% автору \/ 3% сервису/);
  const cabinetButtons = cabinet.actions[0].options.reply_markup.inline_keyboard.flat().map((button) => button.text);
  assert.deepEqual(cabinetButtons, ["Мои треки", "TON кошелек", "Назад"]);

  const walletPrompt = await dispatchSyntheticUpdate(createCallbackUpdate("cab:wallet"), deps);
  assert.equal(walletPrompt.route, "callback:cabinet");
  assert.equal(walletPrompt.actions[1].text, TON_WALLET_PROMPT);
  assert.deepEqual(
    walletPrompt.actions[1].options.reply_markup.inline_keyboard,
    [[{ text: "Назад", callback_data: "menu:cabinet" }]],
  );

  const walletSave = await dispatchSyntheticUpdate(createTextUpdate(VALID_TON_ADDRESS, 11), deps);
  assert.equal(walletSave.actions[0].text, TON_WALLET_SAVED_PROMPT);
  assert.equal(deps.state.users["20"].tonAddress, VALID_TON_ADDRESS);
});

test("wallet rejects invalid text instead of saving random words", async () => {
  const deps = createTestDeps();

  await dispatchSyntheticUpdate(createCallbackUpdate("cab:wallet"), deps);
  const invalid = await dispatchSyntheticUpdate(createTextUpdate("Кабинет", 12), deps);

  assert.equal(invalid.actions[0].text, TON_WALLET_INVALID_PROMPT);
  assert.equal(deps.state.users["20"]?.tonAddress, undefined);
});

test("search returns saved tracks as inline buttons", async () => {
  const deps = createTestDeps({
    state: {
      tracks: [track("track-1", "My Demo", "@tester")],
      users: {},
    },
  });

  const execution = await dispatchSyntheticUpdate(createTextUpdate("demo", 5), deps);

  assert.equal(execution.actions[1].text, SEARCH_RESULTS_PROMPT);
  const buttons = execution.actions[1].options.reply_markup.inline_keyboard.flat().map((button) => button.text);

  assert.deepEqual(
    buttons.slice(0, 1),
    ["My Demo · @tester"],
  );
  assert.ok(buttons.includes("Новый поиск"));
  assert.ok(buttons.includes("Кабинет"));
});

test("search prompt keeps only one back button", async () => {
  const deps = createTestDeps();

  const execution = await dispatchSyntheticUpdate(createCallbackUpdate("menu:search"), deps);

  assert.equal(execution.route, "callback:menu");
  assert.equal(execution.actions[1].text, "Напиши название трека");
  assert.deepEqual(
    execution.actions[1].options.reply_markup.inline_keyboard,
    [[{ text: "Назад", callback_data: "menu:home" }]],
  );
});

test("cabinet tracks renders as track buttons with back button", async () => {
  const deps = createTestDeps({
    state: {
      tracks: [track("track-1", "My Demo", "@tester"), track("track-2", "Second Demo", "@tester")],
      users: {},
    },
  });

  const execution = await dispatchSyntheticUpdate(createCallbackUpdate("cab:tracks"), deps);

  assert.equal(execution.route, "callback:cabinet");
  assert.equal(execution.actions[1].text, "Твои треки");
  assert.deepEqual(
    execution.actions[1].options.reply_markup.inline_keyboard.map((row) => row[0].text),
    ["My Demo · @tester", "Second Demo · @tester", "Назад"],
  );
  assert.equal(
    execution.actions[1].options.reply_markup.inline_keyboard[0][0].callback_data,
    "cabtrack:track-1",
  );
});

test("cabinet track selection reposts audio without closing menu", async () => {
  const deps = createTestDeps({
    state: {
      tracks: [track("track-1", "My Demo", "@tester")],
      users: {},
    },
  });

  const execution = await dispatchSyntheticUpdate(createCallbackUpdate("cabtrack:track-1"), deps);

  assert.equal(execution.route, "callback:cabtrack");
  assert.deepEqual(
    execution.actions.map((action) => action.type),
    ["answer_callback_query", "reply_with_audio"],
  );
});

test("selection sends stored audio and exposes TON donation button when author connected wallet", async () => {
  const deps = createTestDeps({
    state: {
      tracks: [track("track-1", "My Demo", "@tester")],
      users: {
        "20": {
          tonAddress: VALID_TON_ADDRESS,
        },
      },
    },
  });

  const execution = await dispatchSyntheticUpdate(createPickUpdate("track-1"), deps);

  assert.deepEqual(
    execution.actions.map((action) => action.type),
    ["answer_callback_query", "reply_with_audio", "reply", "edit_message_text"],
  );
  assert.equal(execution.actions[2].text, SENT_TRACK_PROMPT);
  assert.equal(execution.actions[3].options.reply_markup.inline_keyboard[0][0].callback_data, "donate:track-1");
  assert.match(execution.actions[3].text, /TON донат подключен/);
});

test("donation callback shows split details", async () => {
  const deps = createTestDeps({
    state: {
      tracks: [track("track-1", "My Demo", "@tester")],
      users: {
        "20": {
          tonAddress: VALID_TON_ADDRESS,
        },
      },
    },
  });

  const execution = await dispatchSyntheticUpdate(createCallbackUpdate("donate:track-1"), deps);

  assert.equal(execution.route, "callback:donate");
  assert.match(execution.actions[1].text, /Автору: 97%/);
  assert.match(execution.actions[1].text, /Кошелек сервиса/);
});

function createTestDeps({ state = { tracks: [], users: {} } } = {}) {
  const events = [];

  return {
    events,
    logger: {
      async log(event, payload) {
        events.push({ event, ...payload });
      },
    },
    musicService: createMemoryCatalog(state),
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
    async clearUserTonAddress(userId) {
      delete state.users[String(userId)]?.tonAddress;
      return true;
    },
    async finalizePendingUpload(userId, donationUrl) {
      const pending = state.users[String(userId)]?.pendingUpload;

      if (!pending?.title) {
        return null;
      }

      const savedTrack = {
        createdAt: new Date().toISOString(),
        donationUrl,
        fileId: pending.fileId,
        fileType: pending.fileType,
        id: `track-${state.tracks.length + 1}`,
        mimeType: pending.mimeType,
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
    async getUserProfile(userId) {
      const user = state.users[String(userId)] ?? {};
      const tonAddress = user.tonAddress ?? "";
      return {
        hasTonAddress: Boolean(tonAddress),
        tonAddress,
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
    async searchTracks(query) {
      const normalized = query.toLowerCase();
      return state.tracks.filter((trackEntry) => trackEntry.title.toLowerCase().includes(normalized)).slice(0, 5);
    },
    async setPendingAction(userId, action) {
      state.users[String(userId)] ??= {};
      state.users[String(userId)].pendingAction = action;
      return action;
    },
    async setUserTonAddress(userId, tonAddress) {
      state.users[String(userId)] ??= {};
      state.users[String(userId)].tonAddress = tonAddress;
      return tonAddress;
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

function createAudioUploadUpdate() {
  return {
    message: {
      audio: {
        duration: 10,
        file_id: "audio-file-1",
        file_name: "travis_scott-fein.mp3",
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

function track(id, title, uploaderName) {
  return {
    createdAt: new Date().toISOString(),
    donationUrl: null,
    fileId: "audio-file-1",
    fileType: "audio",
    id,
    mimeType: "audio/mpeg",
    title,
    uploaderName,
    uploaderUserId: 20,
    uploaderUsername: "tester",
  };
}
