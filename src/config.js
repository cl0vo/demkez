export function getBotToken() {
  const token = process.env.BOT_TOKEN?.trim();

  if (!token) {
    throw new Error("BOT_TOKEN is required. Add it to .env before starting the bot.");
  }

  return token;
}

export function getPlatformSettings() {
  const supportAmounts = String(process.env.STARS_SUPPORT_AMOUNTS ?? "50,100,250")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0)
    .slice(0, 4);

  return {
    feeBps: 300,
    feePercentLabel: "3%",
    paySupportHandle: process.env.PAY_SUPPORT_HANDLE?.trim() ?? "",
    starsHoldDays: Number.parseInt(process.env.STARS_HOLD_DAYS ?? "7", 10) || 7,
    starsSupportAmounts: supportAmounts.length > 0 ? supportAmounts : [50, 100, 250],
  };
}
