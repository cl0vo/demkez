import test from "node:test";
import assert from "node:assert/strict";

import {
  SUPPORTED_LOCALES,
  formatCabinetMessage,
  formatMyTracksMessage,
  formatPaySupportMessage,
  formatSelectionMessage,
  formatStarsBalanceMessage,
  formatStarsPaymentSuccessMessage,
  formatStarsSupportMessage,
  formatTrackButton,
  formatTrackCaption,
  formatUploadTitlePrompt,
  formatWithdrawMessage,
  formatWithdrawRequestMessage,
  normalizeQuery,
} from "../src/messages.js";
import ru from "../src/locales/ru.js";
import en from "../src/locales/en.js";
import de from "../src/locales/de.js";
import fr from "../src/locales/fr.js";
import es from "../src/locales/es.js";
import it from "../src/locales/it.js";
import pt from "../src/locales/pt.js";
import zh from "../src/locales/zh.js";
import hi from "../src/locales/hi.js";
import ja from "../src/locales/ja.js";

const LOCALES = { ru, en, de, fr, es, it, pt, zh, hi, ja };

test("normalizeQuery trims and collapses spaces", () => {
  assert.equal(normalizeQuery("  arctic   monkeys  "), "arctic monkeys");
});

test("formatTrackButton keeps artist and title readable", () => {
  const label = formatTrackButton({
    uploaderName: "The Very Long Uploader Name That Keeps Going",
    title: "The Very Long Track Name That Also Keeps Going",
  });

  assert.equal(label, "The Very Long Track Name That Also Keeps Going");
  assert.doesNotMatch(label, /Uploader/);
  assert.ok(label.length <= 55);
});

test("formatTrackButton supports compact markers and custom width", () => {
  const label = formatTrackButton({
    durationSeconds: 221,
    title: "PHAOAH feat. Boulevard Depo - 5 минут назад",
  }, {
    marker: "🎵",
    maxLength: 24,
  });

  assert.match(label, /^🎵 03:41 /);
  assert.ok(label.length <= 24);
});

test("formatSelectionMessage escapes html and shows stars support", () => {
  const message = formatSelectionMessage({
    title: "<Thunderstruck>",
    uploaderName: "AC/DC",
  });

  assert.match(message, /&lt;Thunderstruck&gt;/);
  assert.match(message, /uploaded by AC\/DC/);
  assert.match(message, /Трек отправлен выше/);
});

test("formatTrackCaption renders uploaded by line", () => {
  const caption = formatTrackCaption({
    title: "<Demo>",
    uploaderName: "@tester",
  }, "https://t.me/invoice/stars:intent-1");

  assert.match(caption, /🎵 <b>&lt;Demo&gt;<\/b>/);
  assert.match(caption, /uploaded by @tester/);
  assert.match(caption, /<a href="https:\/\/t\.me\/invoice\/stars:intent-1">💫 Поддержать<\/a>/);
});

test("formatMyTracksMessage renders compact cabinet list", () => {
  const message = formatMyTracksMessage([
    { title: "Track One" },
    { title: "Track Two" },
  ]);

  assert.match(message, /<b>Мои треки<\/b>/);
  assert.match(message, /1\. Track One/);
  assert.match(message, /2\. Track Two/);
});

test("formatUploadTitlePrompt includes suggestion when available", () => {
  const message = formatUploadTitlePrompt("Travis Scott - FE!N");

  assert.match(message, /<code>Travis Scott - FE!N<\/code>/);
  assert.match(message, /<b>Подсказка:<\/b> Travis Scott - FE!N/);
});

test("cabinet and stars messages stay minimal", () => {
  const cabinet = formatCabinetMessage(
    { starsAvailableXtr: 12, starsFrozenXtr: 3, starsPendingXtr: 5, starsTotalXtr: 20, supportPaymentsCount: 4, trackCount: 3 },
    { feeBps: 300, feePercentLabel: "3%", starsHoldDays: 7, withdrawMinStars: 100 },
  );
  const balance = formatStarsBalanceMessage(
    { starsAvailableXtr: 12, starsFrozenXtr: 3, starsPendingXtr: 5, starsTotalXtr: 20 },
    { feeBps: 300, feePercentLabel: "3%", starsHoldDays: 7, withdrawMinStars: 100 },
  );
  const support = formatStarsSupportMessage(
    { title: "My Demo" },
    { feeBps: 300, feePercentLabel: "3%", starsHoldDays: 7, withdrawMinStars: 100 },
  );
  const withdraw = formatWithdrawMessage(
    { starsAvailableXtr: 12, starsFrozenXtr: 3, starsPendingXtr: 5, starsTotalXtr: 20 },
    { feeBps: 300, feePercentLabel: "3%", starsHoldDays: 7, withdrawMinStars: 100 },
  );

  assert.match(cabinet, /<b>Кабинет<\/b>/);
  assert.match(cabinet, /⭐ Баланс: 20 Stars/);
  assert.match(cabinet, /💸 Вывод от 100 Stars/);
  assert.doesNotMatch(cabinet, /Заморожено:/);
  assert.doesNotMatch(cabinet, /В ожидании:/);
  assert.match(balance, /Сейчас у вас: <b>20 Stars<\/b>/);
  assert.match(balance, /К выводу доступно: <b>12 Stars<\/b>/);
  assert.match(balance, /В холде: <b>5 Stars<\/b>/);
  assert.match(balance, /Заморожено: <b>3 Stars<\/b>/);
  assert.match(support, /на внутренний баланс владельца трека/);
  assert.match(withdraw, /В холде: <b>5 Stars<\/b>/);
  assert.match(withdraw, /До вывода осталось: <b>88 Stars<\/b>/);
});

test("cabinet readiness is based on available Stars, not total Stars", () => {
  const cabinet = formatCabinetMessage(
    { starsAvailableXtr: 12, starsFrozenXtr: 0, starsPendingXtr: 110, starsTotalXtr: 122, supportPaymentsCount: 2, trackCount: 1 },
    { feeBps: 300, feePercentLabel: "3%", starsHoldDays: 7, withdrawMinStars: 100 },
  );

  assert.match(cabinet, /⭐ Баланс: 122 Stars/);
  assert.match(cabinet, /💸 Вывод от 100 Stars/);
  assert.doesNotMatch(cabinet, /Вывод уже доступен/);
});

test("pay support message prefers configured handle", () => {
  assert.equal(formatPaySupportMessage({ paySupportHandle: "@demohub_support" }), "Если что-то пошло не так,\nнапишите <b>@demohub_support</b>");
});

test("formatStarsPaymentSuccessMessage shows owner credit", () => {
  const message = formatStarsPaymentSuccessMessage({
    authorShareXtr: 97,
    platformShareXtr: 3,
  });

  assert.match(message, /На баланс владельца зачислено: <b>\+97 Stars<\/b>/);
});

test("withdraw request message prefers configured handle", () => {
  const message = formatWithdrawRequestMessage({ paySupportHandle: "@demohub_support" });

  assert.match(message, /<b>Заявка на вывод<\/b>/);
  assert.match(message, /<b>@demohub_support<\/b>/);
});

test("all supported locale dictionaries stay in sync", () => {
  assert.equal(SUPPORTED_LOCALES.length, 10);

  const baseKeys = Object.keys(ru).sort();

  for (const locale of SUPPORTED_LOCALES.map((entry) => entry.code)) {
    const dict = LOCALES[locale];

    assert.ok(dict, `missing locale dictionary for ${locale}`);
    assert.deepEqual(Object.keys(dict).sort(), baseKeys, `locale keys mismatch for ${locale}`);
    assert.ok(dict.COMMANDS, `missing commands block for ${locale}`);
    assert.deepEqual(
      Object.keys(dict.COMMANDS).sort(),
      Object.keys(ru.COMMANDS).sort(),
      `command keys mismatch for ${locale}`,
    );
  }
});
