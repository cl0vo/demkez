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

  return {
    feeBps: 300,
    feePercentLabel: "3%",
    paySupportHandle: process.env.PAY_SUPPORT_HANDLE?.trim() ?? "",
    starsHoldDays: Number.parseInt(process.env.STARS_HOLD_DAYS ?? "7", 10) || 7,
    starsSupportAmounts: supportAmounts.length > 0 ? supportAmounts : [10, 25, 50],
    uploadDailyLimit,
    uploadMaxBytes: uploadMaxMb * 1024 * 1024,
    uploadMaxMb,
    uploadWindowHours: 24,
    withdrawMinStars,
  };
}
