import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { dispatchSyntheticUpdate } from "../src/synthetic.js";

const FIXTURE_DIR = resolve(process.cwd(), "test", "fixtures", "replays");

test("replay fixtures stay green", async () => {
  const entries = await readdir(FIXTURE_DIR, { withFileTypes: true });
  const fixtureFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => resolve(FIXTURE_DIR, entry.name))
    .sort();

  assert.ok(fixtureFiles.length > 0);

  for (const filePath of fixtureFiles) {
    const fixture = JSON.parse(await readFile(filePath, "utf8"));
    const execution = await dispatchSyntheticUpdate(fixture.update, createFixtureDeps(fixture));

    if (fixture.expect.route) {
      assert.equal(execution.route, fixture.expect.route, fixture.name);
    }

    if (fixture.expect.replyText) {
      assert.equal(execution.actions.find((action) => action.type === "reply")?.text, fixture.expect.replyText, fixture.name);
    }

    if (fixture.expect.buttonTexts) {
      const buttons = execution.actions
        .find((action) => action.type === "reply")
        ?.options?.reply_markup?.inline_keyboard
        ?.flat()
        .map((button) => button.text);

      assert.deepEqual(buttons?.slice(0, fixture.expect.buttonTexts.length), fixture.expect.buttonTexts, fixture.name);
    }

    if (fixture.expect.actionTypes) {
      assert.deepEqual(execution.actions.map((action) => action.type), fixture.expect.actionTypes, fixture.name);
    }
  }
});

function createFixtureDeps(fixture) {
  const state = structuredClone(fixture.state ?? { supportIntents: [], supportPayments: [], tracks: [], users: {} });
  state.users ??= {};
  state.users["20"] = {
    ...(state.users["20"] ?? {}),
    locale: state.users["20"]?.locale ?? "ru",
  };

  return {
    logger: {
      async log() {},
    },
    musicService: {
      async beginUpload(upload) {
        state.users[String(upload.userId)] ??= {};
        state.users[String(upload.userId)].pendingUpload = { ...upload };
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
      async createStarsSupportIntent({ amountXtr, donorUserId, trackId }) {
        const track = state.tracks.find((entry) => entry.id === trackId);

        if (!track) {
          return null;
        }

        return {
          amountXtr,
          authorShareXtr: Math.floor((amountXtr * 97) / 100),
          authorUserId: track.uploaderUserId,
          donorUserId,
          id: "fixture-intent-1",
          payload: "stars:fixture-intent-1",
          platformShareXtr: amountXtr - Math.floor((amountXtr * 97) / 100),
          status: "created",
          trackId,
        };
      },
      async finalizePendingUpload(userId) {
        const pending = state.users[String(userId)]?.pendingUpload;

        if (!pending?.title) {
          return null;
        }

        const savedTrack = {
          catalogVisible: pending.catalogVisible !== false,
          fileId: pending.fileId,
          fileType: pending.fileType,
          id: `fixture-track-${state.tracks.length + 1}`,
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
        return {
          isBanned: false,
          starsAvailableXtr: 0,
          starsFrozenXtr: 0,
          starsPendingXtr: 0,
          starsTotalXtr: 0,
          trackCount: state.tracks.filter((track) => track.uploaderUserId === Number(userId)).length,
        };
      },
      async listUserTracks(userId) {
        return state.tracks.filter((track) => track.uploaderUserId === Number(userId));
      },
      async lookupTrack(trackId) {
        return state.tracks.find((track) => track.id === trackId) ?? null;
      },
      async savePendingTitle(userId, title) {
        state.users[String(userId)].pendingUpload.title = title;
      },
      async savePendingCatalogVisibility(userId, catalogVisible) {
        state.users[String(userId)].pendingUpload.catalogVisible = catalogVisible !== false;
        return state.users[String(userId)].pendingUpload;
      },
      async searchTracks(query, limit = 5) {
        return state.tracks
          .filter((track) => track.catalogVisible !== false && track.title.toLowerCase().includes(query.toLowerCase()))
          .slice(0, limit);
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
    },
    platformSettings: {
      feeBps: 300,
      feePercentLabel: "3%",
      paySupportHandle: "@demohub_support",
      storageChatId: null,
      starsHoldDays: 7,
      starsSupportAmounts: [10, 25, 50],
      uploadDailyLimit: 20,
      uploadMaxBytes: 25 * 1024 * 1024,
      uploadMaxMb: 25,
      uploadWindowHours: 24,
      withdrawMinStars: 100,
    },
    replayStore: {
      async capture() {
        return ".runtime/replays/test.json";
      },
    },
  };
}
