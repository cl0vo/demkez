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
      async finalizePendingUpload(userId) {
        const pending = state.users[String(userId)]?.pendingUpload;

        if (!pending?.title) {
          return null;
        }

        const savedTrack = {
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
      async getUserProfile(userId) {
        return {
          isBanned: false,
          starsAvailableXtr: 0,
          starsFrozenXtr: 0,
          starsPendingXtr: 0,
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
      async searchTracks(query) {
        return state.tracks.filter((track) => track.title.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
      },
      async setPendingAction(userId, action) {
        state.users[String(userId)] ??= {};
        state.users[String(userId)].pendingAction = action;
        return action;
      },
    },
    platformSettings: {
      feeBps: 300,
      feePercentLabel: "3%",
      paySupportHandle: "@demkez_support",
      starsHoldDays: 7,
      starsSupportAmounts: [50, 100, 250],
    },
    replayStore: {
      async capture() {
        return ".runtime/replays/test.json";
      },
    },
  };
}
