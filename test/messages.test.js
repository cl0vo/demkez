import test from "node:test";
import assert from "node:assert/strict";

import {
  formatCabinetMessage,
  formatDonationInfoMessage,
  formatMyTracksMessage,
  formatSelectionMessage,
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

test("formatSelectionMessage escapes html and keeps next action prompt", () => {
  const message = formatSelectionMessage({
    tonAddress: "UQ-demo-wallet",
    title: "<Thunderstruck>",
    uploaderName: "AC/DC",
  });

  assert.match(message, /&lt;Thunderstruck&gt;/);
  assert.match(message, /Загрузил: AC\/DC/);
  assert.match(message, /TON донат подключен/);
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

test("cabinet and donation messages show split details", () => {
  const cabinet = formatCabinetMessage(
    { hasTonAddress: true, tonAddress: "UQ-demo", trackCount: 3 },
    { feeBps: 300, feePercentLabel: "3%", platformTonAddress: "UQ-platform" },
  );
  const donation = formatDonationInfoMessage(
    { title: "My Demo", tonAddress: "UQ-demo" },
    { feeBps: 300, feePercentLabel: "3%", platformTonAddress: "UQ-platform" },
  );

  assert.match(cabinet, /Сплит: 97% автору \/ 3% сервису/);
  assert.match(cabinet, /UQ-demo/);
  assert.match(donation, /Автору: 97%/);
  assert.match(donation, /Кошелек сервиса/);
});
