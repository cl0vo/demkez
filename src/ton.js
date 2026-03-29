const FRIENDLY_TON_ADDRESS = /^(?:EQ|UQ|kQ|0Q)[A-Za-z0-9+/_-]{46}$/;
const RAW_TON_ADDRESS = /^-?\d+:[a-fA-F0-9]{64}$/;

export function isValidTonAddress(value) {
  const input = String(value ?? "").trim();

  if (!input) {
    return false;
  }

  return FRIENDLY_TON_ADDRESS.test(input) || RAW_TON_ADDRESS.test(input);
}
