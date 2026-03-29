import test from "node:test";
import assert from "node:assert/strict";

import {
  formatCabinetMessage,
  formatMyTracksMessage,
  formatPaySupportMessage,
  formatSelectionMessage,
  formatStarsBalanceMessage,
  formatStarsSupportMessage,
  formatTrackButton,
  formatUploadTitlePrompt,
  normalizeQuery,
} from "../src/messages.js";

test("normalizeQuery trims and collapses spaces", () => {
  assert.equal(normalizeQuery("  arctic   monkeys  "), "arctic monkeys");
});

test("formatTrackButton keeps artist and title readable", () => {
  const label = formatTrackButton({
    uploaderName: "The Very Long Uploader Name That Keeps Going",
    title: "The Very Long Track Name That Also Keeps Going",
  });

  assert.match(label, /^The Very Long Track Name/);
  assert.ok(label.endsWith("…"));
  assert.ok(label.length <= 55);
});

test("formatSelectionMessage escapes html and shows stars support", () => {
  const message = formatSelectionMessage({
    supportsStars: true,
    title: "<Thunderstruck>",
    uploaderName: "AC/DC",
  });

  assert.match(message, /&lt;Thunderstruck&gt;/);
  assert.match(message, /Загрузил: AC\/DC/);
  assert.match(message, /Поддержка: Telegram Stars/);
});

test("formatMyTracksMessage renders compact cabinet list", () => {
  const message = formatMyTracksMessage([
    { title: "Track One" },
    { title: "Track Two" },
  ]);

  assert.match(message, /Твои треки:/);
  assert.match(message, /1\. Track One/);
  assert.match(message, /2\. Track Two/);
});

test("formatUploadTitlePrompt includes suggestion when available", () => {
  const message = formatUploadTitlePrompt("Travis Scott - FE!N");

  assert.match(message, /Например: Travis Scott - FE!N/);
  assert.match(message, /Похоже на: Travis Scott - FE!N/);
});

test("cabinet and stars messages show split details", () => {
  const cabinet = formatCabinetMessage(
    { starsAvailableXtr: 12, starsFrozenXtr: 3, starsPendingXtr: 5, trackCount: 3 },
    { feeBps: 300, feePercentLabel: "3%", starsHoldDays: 7 },
  );
  const balance = formatStarsBalanceMessage(
    { starsAvailableXtr: 12, starsFrozenXtr: 3, starsPendingXtr: 5 },
    { feeBps: 300, feePercentLabel: "3%", starsHoldDays: 7 },
  );
  const support = formatStarsSupportMessage(
    { title: "My Demo" },
    { feeBps: 300, feePercentLabel: "3%", starsHoldDays: 7 },
  );

  assert.match(cabinet, /Сплит: 97% автору \/ 3% сервису/);
  assert.match(cabinet, /В ожидании: 5 XTR/);
  assert.match(balance, /Доступно: 12 XTR/);
  assert.match(support, /Оплата проходит через Telegram Stars/);
});

test("pay support message prefers configured handle", () => {
  assert.equal(formatPaySupportMessage({ paySupportHandle: "@demkez_support" }), "По оплате напиши @demkez_support");
});
