export function getBotToken() {
  const token = process.env.BOT_TOKEN?.trim();

  if (!token) {
    throw new Error("BOT_TOKEN is required. Add it to .env before starting the bot.");
  }

  return token;
}

export function getPlatformSettings() {
  return {
    feeBps: 300,
    feePercentLabel: "3%",
    platformTonAddress: process.env.PLATFORM_TON_ADDRESS?.trim() ?? "",
  };
}
