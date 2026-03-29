import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { dispatchSyntheticUpdate } from "../src/synthetic.js";

const FIXTURE_DIR = resolve(process.cwd(), "test", "fixtures", "replays");

async function main() {
  const entries = await readdir(FIXTURE_DIR, { withFileTypes: true });
  const fixtureFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => resolve(FIXTURE_DIR, entry.name))
    .sort();

  if (fixtureFiles.length === 0) {
    console.log("No replay fixtures found.");
    return;
  }

  let failed = 0;

  for (const filePath of fixtureFiles) {
    const fixture = JSON.parse(await readFile(filePath, "utf8"));
    const execution = await runFixture(fixture);

    try {
      assertFixture(fixture, execution);
      console.log(`PASS ${fixture.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${fixture.name}`);
      console.error(error);
    }
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

async function runFixture(fixture) {
  const events = [];
  const captures = [];
  const state = structuredClone(fixture.state ?? { supportIntents: [], supportPayments: [], tracks: [], users: {} });

  const execution = await dispatchSyntheticUpdate(fixture.update, {
    logger: {
      async log(event, payload) {
        events.push({ event, ...payload });
      },
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
      async searchTracks(query, limit = 5) {
        return state.tracks.filter((track) => track.title.toLowerCase().includes(query.toLowerCase())).slice(0, limit);
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
      starsHoldDays: 7,
      starsSupportAmounts: [10, 25, 50],
      uploadDailyLimit: 20,
      uploadMaxBytes: 25 * 1024 * 1024,
      uploadMaxMb: 25,
      uploadWindowHours: 24,
      withdrawMinStars: 100,
    },
    replayStore: {
      async capture(kind, payload) {
        captures.push({ kind, payload });
        return `.runtime/replays/${kind}.json`;
      },
    },
  });

  return {
    ...execution,
    captures,
    events,
  };
}

function assertFixture(fixture, execution) {
  const expected = fixture.expect ?? {};

  if (expected.route && execution.route !== expected.route) {
    throw new Error(`Expected route ${expected.route}, received ${execution.route}`);
  }

  if (expected.actionTypes) {
    const actualActionTypes = execution.actions.map((action) => action.type);
    const mismatch = JSON.stringify(actualActionTypes) !== JSON.stringify(expected.actionTypes);

    if (mismatch) {
      throw new Error(`Expected action types ${JSON.stringify(expected.actionTypes)}, received ${JSON.stringify(actualActionTypes)}`);
    }
  }

  if (expected.replyText) {
    const replyAction = execution.actions.find((action) => action.type === "reply");

    if (!replyAction || replyAction.text !== expected.replyText) {
      throw new Error(`Expected reply text ${expected.replyText}, received ${replyAction?.text ?? "none"}`);
    }
  }

  if (expected.editTextIncludes) {
    const editAction = execution.actions.find((action) => action.type === "edit_message_text");
    const text = editAction?.text ?? "";

    for (const expectedFragment of expected.editTextIncludes) {
      if (!text.includes(expectedFragment)) {
        throw new Error(`Expected edit text to include ${expectedFragment}, received ${text}`);
      }
    }
  }

  if (expected.buttonTexts) {
    const replyAction = execution.actions.find((action) => action.type === "reply");
    const buttons = replyAction?.options?.reply_markup?.inline_keyboard?.flat() ?? [];
    const actualButtonTexts = buttons.map((button) => button.text);
    const relevantButtonTexts = actualButtonTexts.slice(0, expected.buttonTexts.length);
    const mismatch = JSON.stringify(relevantButtonTexts) !== JSON.stringify(expected.buttonTexts);

    if (mismatch) {
      throw new Error(`Expected button texts ${JSON.stringify(expected.buttonTexts)}, received ${JSON.stringify(actualButtonTexts)}`);
    }
  }

  if (expected.actionTypes) {
    const actualActionTypes = execution.actions.map((action) => action.type);
    const mismatch = JSON.stringify(actualActionTypes) !== JSON.stringify(expected.actionTypes);

    if (mismatch) {
      throw new Error(`Expected action types ${JSON.stringify(expected.actionTypes)}, received ${JSON.stringify(actualActionTypes)}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
