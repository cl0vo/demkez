import test from "node:test";
import assert from "node:assert/strict";

import { BOT_ALLOWED_UPDATES, startBotRuntime, syncBotCommands } from "../src/bootstrap.js";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../src/messages.js";

test("syncBotCommands retries a transient Telegram command sync failure", async () => {
  const events = [];
  const locales = [];
  const localeCount = 1 + SUPPORTED_LOCALES.filter((entry) => entry.code !== DEFAULT_LOCALE).length;
  let shouldFail = true;

  const bot = {
    api: {
      async setMyCommands(_payload, options) {
        locales.push(options?.language_code ?? DEFAULT_LOCALE);

        if (shouldFail) {
          shouldFail = false;
          throw new Error("getaddrinfo ENOTFOUND api.telegram.org");
        }
      },
    },
  };

  await syncBotCommands(bot, {
    async log(event, payload = {}) {
      events.push({ event, payload });
    },
  }, {
    commandSyncRetryCount: 2,
    commandSyncRetryDelayMs: 0,
  });

  assert.equal(locales.length, localeCount + 1);
  assert.equal(locales[0], DEFAULT_LOCALE);
  assert.equal(locales[1], DEFAULT_LOCALE);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "bot_command_sync_retry");
  assert.equal(events[0].payload.locale, DEFAULT_LOCALE);
  assert.equal(events[0].payload.attempt, 1);
});

test("startBotRuntime keeps polling alive when command sync fails", async () => {
  const events = [];
  const registered = [];
  let startedWith = null;

  const bot = {
    api: {
      async setMyCommands() {
        throw new Error("temporary Telegram outage");
      },
    },
    async start(options) {
      startedWith = options;
    },
    async stop() {},
  };
  const processRef = {
    exitCode: 0,
    on(event, handler) {
      registered.push({ event, handler, mode: "on" });
      return this;
    },
    once(event, handler) {
      registered.push({ event, handler, mode: "once" });
      return this;
    },
  };

  await startBotRuntime({
    bot,
    logger: {
      async log(event, payload = {}) {
        events.push({ event, payload });
      },
    },
    platformSettings: {
      commandSyncRetryCount: 1,
      commandSyncRetryDelayMs: 0,
    },
    processRef,
  });

  assert.deepEqual(startedWith, {
    allowed_updates: BOT_ALLOWED_UPDATES,
  });
  assert.ok(events.some((entry) => entry.event === "bot_command_sync_failed"));
  assert.ok(events.some((entry) => entry.event === "bot_polling_started"));
  assert.deepEqual(
    registered.map((entry) => entry.event),
    ["unhandledRejection", "uncaughtException", "SIGINT", "SIGTERM"],
  );
});

test("startBotRuntime does not block polling on a hanging command sync", async () => {
  const events = [];
  let startedWith = null;

  const bot = {
    api: {
      async setMyCommands() {
        return new Promise(() => {});
      },
    },
    async start(options) {
      startedWith = options;
    },
    async stop() {},
  };
  const processRef = {
    exitCode: 0,
    on() {
      return this;
    },
    once() {
      return this;
    },
  };

  await startBotRuntime({
    bot,
    logger: {
      async log(event, payload = {}) {
        events.push({ event, payload });
      },
    },
    platformSettings: {
      commandSyncRetryCount: 1,
      commandSyncRetryDelayMs: 0,
    },
    processRef,
  });

  assert.deepEqual(startedWith, {
    allowed_updates: BOT_ALLOWED_UPDATES,
  });
  assert.ok(events.some((entry) => entry.event === "bot_polling_started"));
});
