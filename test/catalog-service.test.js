import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createCatalogService } from "../src/catalog-service.js";

test("catalog service tracks Stars support as pending until hold window ends", async () => {
  const { cleanup, dbPath, service } = await createServiceHarness();

  try {
    const intent = await service.createStarsSupportIntent({
      amountXtr: 100,
      donorUserId: 20,
      trackId: "track-1",
    });

    assert.equal(intent.authorShareXtr, 97);
    assert.equal(intent.platformShareXtr, 3);

    const payment = await service.completeStarsSupportPayment({
      donorUserId: 20,
      payload: intent.payload,
      providerPaymentChargeId: "",
      telegramPaymentChargeId: "charge-1",
      totalAmountXtr: 100,
    });

    assert.ok(payment);
    assert.equal(payment.authorShareXtr, 97);
    assert.equal(payment.status, "successful");

    const pendingProfile = await service.getUserProfile(44);
    assert.equal(pendingProfile.starsPendingXtr, 97);
    assert.equal(pendingProfile.starsAvailableXtr, 0);
    assert.equal(pendingProfile.starsTotalXtr, 97);

    const db = JSON.parse(await readFile(dbPath, "utf8"));
    db.supportPayments[0].releaseAt = new Date(Date.now() - 60_000).toISOString();
    await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");

    const availableProfile = await service.getUserProfile(44);
    assert.equal(availableProfile.starsPendingXtr, 0);
    assert.equal(availableProfile.starsAvailableXtr, 97);
    assert.equal(availableProfile.starsTotalXtr, 97);
  } finally {
    await cleanup();
  }
});

test("catalog service treats duplicate successful payments as idempotent", async () => {
  const { cleanup, dbPath, service } = await createServiceHarness();

  try {
    const intent = await service.createStarsSupportIntent({
      amountXtr: 25,
      donorUserId: 20,
      trackId: "track-1",
    });

    const first = await service.completeStarsSupportPayment({
      donorUserId: 20,
      payload: intent.payload,
      providerPaymentChargeId: "",
      telegramPaymentChargeId: "charge-1",
      totalAmountXtr: 25,
    });

    const second = await service.completeStarsSupportPayment({
      donorUserId: 20,
      payload: intent.payload,
      providerPaymentChargeId: "",
      telegramPaymentChargeId: "charge-1",
      totalAmountXtr: 25,
    });

    assert.equal(second?.id, first?.id);

    const db = JSON.parse(await readFile(dbPath, "utf8"));
    assert.equal(db.supportPayments.length, 1);
  } finally {
    await cleanup();
  }
});

test("catalog service removes refunded Stars payments from internal balance", async () => {
  const { cleanup, service } = await createServiceHarness();

  try {
    const intent = await service.createStarsSupportIntent({
      amountXtr: 100,
      donorUserId: 20,
      trackId: "track-1",
    });

    await service.completeStarsSupportPayment({
      donorUserId: 20,
      payload: intent.payload,
      providerPaymentChargeId: "",
      telegramPaymentChargeId: "charge-1",
      totalAmountXtr: 100,
    });

    const refunded = await service.refundStarsSupportPayment({
      payload: intent.payload,
      providerPaymentChargeId: "",
      telegramPaymentChargeId: "charge-1",
      totalAmountXtr: 100,
    });

    assert.ok(refunded);
    assert.equal(refunded.status, "refunded");

    const profile = await service.getUserProfile(44);
    assert.equal(profile.starsPendingXtr, 0);
    assert.equal(profile.starsAvailableXtr, 0);
    assert.equal(profile.starsTotalXtr, 0);
  } finally {
    await cleanup();
  }
});

test("catalog service can recover missed Stars payments from Telegram transactions", async () => {
  const { cleanup, service } = await createServiceHarness();

  try {
    const intent = await service.createStarsSupportIntent({
      amountXtr: 200,
      donorUserId: 20,
      trackId: "track-1",
    });
    const paidAtUnix = Math.floor((Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000);

    const summary = await service.syncTelegramStarsTransactions([
      createTelegramInvoiceTransaction({
        amount: 200,
        date: paidAtUnix,
        id: "charge-1",
        payload: intent.payload,
        userId: 20,
      }),
    ]);

    assert.equal(summary.importedPayments, 1);

    const profile = await service.getUserProfile(44);
    assert.equal(profile.starsAvailableXtr, 194);
    assert.equal(profile.starsPendingXtr, 0);
    assert.equal(profile.starsTotalXtr, 194);
  } finally {
    await cleanup();
  }
});

test("catalog service reconciles Telegram refunds against existing Stars payments", async () => {
  const { cleanup, service } = await createServiceHarness();

  try {
    const intent = await service.createStarsSupportIntent({
      amountXtr: 100,
      donorUserId: 20,
      trackId: "track-1",
    });

    await service.completeStarsSupportPayment({
      donorUserId: 20,
      payload: intent.payload,
      providerPaymentChargeId: "",
      telegramPaymentChargeId: "charge-1",
      totalAmountXtr: 100,
    });

    const summary = await service.syncTelegramStarsTransactions([
      createTelegramRefundTransaction({
        amount: 100,
        date: Math.floor(Date.now() / 1000),
        id: "charge-1",
        payload: intent.payload,
        userId: 20,
      }),
    ]);

    assert.equal(summary.refundedPayments, 1);

    const profile = await service.getUserProfile(44);
    assert.equal(profile.starsAvailableXtr, 0);
    assert.equal(profile.starsPendingXtr, 0);
    assert.equal(profile.starsTotalXtr, 0);
  } finally {
    await cleanup();
  }
});

async function createServiceHarness() {
  const dir = await mkdtemp(join(tmpdir(), "demohub-stars-"));
  const dbPath = join(dir, "db.json");
  const db = {
    supportIntents: [],
    supportPayments: [],
    tracks: [{
      createdAt: new Date().toISOString(),
      durationSeconds: 0,
      fileId: "audio-file-1",
      fileName: "demo.mp3",
      fileType: "audio",
      id: "track-1",
      mimeType: "audio/mpeg",
      searchIndex: "my demo",
      title: "My Demo",
      uploaderName: "@tester",
      uploaderUserId: 44,
      uploaderUsername: "tester",
    }],
    users: {
      "20": {},
      "44": {},
    },
  };

  await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");

  return {
    cleanup: async () => rm(dir, { force: true, recursive: true }),
    dbPath,
    service: createCatalogService({
      dbPath,
      feeBps: 300,
      starsHoldDays: 7,
    }),
  };
}

function createTelegramInvoiceTransaction({ amount, date, id, payload, userId }) {
  return {
    amount,
    date,
    id,
    source: {
      invoice_payload: payload,
      transaction_type: "invoice_payment",
      type: "user",
      user: {
        first_name: "Test",
        id: userId,
        is_bot: false,
      },
    },
  };
}

function createTelegramRefundTransaction({ amount, date, id, payload, userId }) {
  return {
    amount,
    date,
    id,
    receiver: {
      invoice_payload: payload,
      transaction_type: "invoice_payment",
      type: "user",
      user: {
        first_name: "Test",
        id: userId,
        is_bot: false,
      },
    },
  };
}
