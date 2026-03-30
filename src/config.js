export function getBotToken() {
  const token = process.env.BOT_TOKEN?.trim();

  if (!token) {
    throw new Error("BOT_TOKEN is required. Add it to .env before starting the bot.");
  }

  return token;
}

export function getPlatformSettings() {
  const supportAmounts = String(process.env.STARS_SUPPORT_AMOUNTS ?? "10,25,50")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0)
    .slice(0, 4);
  const uploadMaxMb = Number.parseInt(process.env.UPLOAD_MAX_MB ?? "25", 10) || 25;
  const uploadDailyLimit = Number.parseInt(process.env.UPLOAD_DAILY_LIMIT ?? "20", 10) || 20;
  const withdrawMinStars = Number.parseInt(process.env.WITHDRAW_MIN_STARS ?? "100", 10) || 100;
  const commandSyncRetryCount = Number.parseInt(process.env.COMMAND_SYNC_RETRY_COUNT ?? "5", 10) || 5;
  const commandSyncRetryDelayMs = Number.parseInt(process.env.COMMAND_SYNC_RETRY_DELAY_MS ?? "2500", 10) || 2500;
  const externalSearchTimeoutMs = Number.parseInt(process.env.EXTERNAL_SEARCH_TIMEOUT_MS ?? "4500", 10) || 4500;
  const storageCopyMaxRetries = Number.parseInt(process.env.STORAGE_COPY_MAX_RETRIES ?? "3", 10) || 3;
  const storageCopyMinIntervalMs = Number.parseInt(process.env.STORAGE_COPY_MIN_INTERVAL_MS ?? "1250", 10) || 1250;

  return {
    commandSyncRetryCount,
    commandSyncRetryDelayMs,
    externalSearchTimeoutMs,
    feeBps: 300,
    feePercentLabel: "3%",
    paySupportHandle: process.env.PAY_SUPPORT_HANDLE?.trim() ?? "",
    storageChatId: normalizeChatId(process.env.STORAGE_CHAT_ID),
    storageCopyMaxRetries,
    storageCopyMinIntervalMs,
    starsHoldDays: Number.parseInt(process.env.STARS_HOLD_DAYS ?? "7", 10) || 7,
    starsSupportAmounts: supportAmounts.length > 0 ? supportAmounts : [10, 25, 50],
    uploadDailyLimit,
    uploadMaxBytes: uploadMaxMb * 1024 * 1024,
    uploadMaxMb,
    uploadWindowHours: 24,
    withdrawMinStars,
  };
}

function normalizeChatId(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return null;
  }

  if (/^-?\d+$/.test(normalized)) {
    const numericValue = Number(normalized);

    if (Number.isSafeInteger(numericValue)) {
      return numericValue;
    }
  }

  return normalized;
}
