import ru from "./locales/ru.js";
import en from "./locales/en.js";
import de from "./locales/de.js";
import fr from "./locales/fr.js";
import es from "./locales/es.js";
import it from "./locales/it.js";
import pt from "./locales/pt.js";
import zh from "./locales/zh.js";
import hi from "./locales/hi.js";
import ja from "./locales/ja.js";

const MAX_BUTTON_TEXT = 55;
const DEFAULT_TRACK_MARKER = "";
const COPY = { ru, en, de, fr, es, it, pt, zh, hi, ja };

export const DEFAULT_LOCALE = "ru";
export const SUPPORTED_LOCALES = [
  { code: "ru", flag: "🇷🇺", name: "Русский" },
  { code: "en", flag: "🇬🇧", name: "English" },
  { code: "de", flag: "🇩🇪", name: "Deutsch" },
  { code: "fr", flag: "🇫🇷", name: "Français" },
  { code: "es", flag: "🇪🇸", name: "Español" },
  { code: "it", flag: "🇮🇹", name: "Italiano" },
  { code: "pt", flag: "🇵🇹", name: "Português" },
  { code: "zh", flag: "🇨🇳", name: "中文" },
  { code: "hi", flag: "🇮🇳", name: "हिन्दी" },
  { code: "ja", flag: "🇯🇵", name: "日本語" },
];

export function isSupportedLocale(locale) {
  return Object.hasOwn(COPY, locale);
}

export function normalizeLocale(locale) {
  const value = String(locale ?? "").trim().toLowerCase();

  if (!value) {
    return null;
  }

  const base = value.split(/[-_]/, 1)[0];
  return isSupportedLocale(base) ? base : null;
}

export function getUiLabels(locale = DEFAULT_LOCALE) {
  return {
    home: getText(locale, "HOME_LABEL"),
    back: getText(locale, "BACK_LABEL"),
    search: getText(locale, "SEARCH_LABEL"),
    searchNew: getText(locale, "SEARCH_NEW_LABEL"),
    upload: getText(locale, "UPLOAD_LABEL"),
    cabinet: getText(locale, "CABINET_LABEL"),
    tracks: getText(locale, "TRACKS_LABEL"),
    withdraw: getText(locale, "WITHDRAW_LABEL"),
    requestWithdraw: getText(locale, "REQUEST_WITHDRAW_LABEL"),
    cancelUpload: getText(locale, "CANCEL_UPLOAD_LABEL"),
    keepSuggested: getText(locale, "KEEP_SUGGESTED_LABEL"),
    language: getText(locale, "LANGUAGE_LABEL"),
  };
}

export function getText(locale = DEFAULT_LOCALE, key, params = {}) {
  const safeLocale = normalizeLocale(locale) ?? DEFAULT_LOCALE;
  const template = COPY[safeLocale]?.[key] ?? COPY[DEFAULT_LOCALE]?.[key] ?? "";
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

export function getCommandDescriptions(locale = DEFAULT_LOCALE) {
  return COPY[normalizeLocale(locale) ?? DEFAULT_LOCALE].COMMANDS;
}

export const START_PROMPT = getText(DEFAULT_LOCALE, "START_PROMPT");
export const SEARCH_RESULTS_PROMPT = getText(DEFAULT_LOCALE, "SEARCH_RESULTS_PROMPT");
export const EMPTY_QUERY_PROMPT = getText(DEFAULT_LOCALE, "EMPTY_QUERY_PROMPT");
export const EMPTY_RESULTS_PROMPT = getText(DEFAULT_LOCALE, "EMPTY_RESULTS_PROMPT");
export const LOOKUP_ERROR_PROMPT = getText(DEFAULT_LOCALE, "LOOKUP_ERROR_PROMPT");
export const TRACK_REMOVED_BROKEN_PROMPT = getText(DEFAULT_LOCALE, "TRACK_REMOVED_BROKEN_PROMPT");
export const NON_TEXT_PROMPT = getText(DEFAULT_LOCALE, "NON_TEXT_PROMPT");
export const SEARCH_ERROR_PROMPT = getText(DEFAULT_LOCALE, "SEARCH_ERROR_PROMPT");
export const UPLOAD_TITLE_PROMPT = getText(DEFAULT_LOCALE, "UPLOAD_TITLE_PROMPT");
export const UPLOAD_DONE_PROMPT = getText(DEFAULT_LOCALE, "UPLOAD_DONE_PROMPT");
export const UPLOAD_ONLY_MP3_PROMPT = getText(DEFAULT_LOCALE, "UPLOAD_ONLY_MP3_PROMPT");
export const SENT_TRACK_PROMPT = getText(DEFAULT_LOCALE, "SENT_TRACK_PROMPT");
export const TRACK_OPENED_PROMPT = getText(DEFAULT_LOCALE, "TRACK_OPENED_PROMPT");
export const MY_TRACKS_EMPTY_PROMPT = getText(DEFAULT_LOCALE, "MY_TRACKS_EMPTY_PROMPT");
export const MY_TRACKS_TITLE = getText(DEFAULT_LOCALE, "MY_TRACKS_TITLE");
export const TITLE_SUGGESTION_SAVED_PROMPT = getText(DEFAULT_LOCALE, "UPLOAD_DONE_PROMPT");
export const STARS_BALANCE_PROMPT = getText(DEFAULT_LOCALE, "STARS_BALANCE_PROMPT");
export const WITHDRAW_PROMPT = getText(DEFAULT_LOCALE, "WITHDRAW_PROMPT");
export const STARS_SUPPORT_UNAVAILABLE_PROMPT = getText(DEFAULT_LOCALE, "STARS_SUPPORT_UNAVAILABLE_PROMPT");
export const STARS_INVOICE_EXPIRED_PROMPT = getText(DEFAULT_LOCALE, "STARS_INVOICE_EXPIRED_PROMPT");
export const PAY_SUPPORT_PROMPT = getText(DEFAULT_LOCALE, "PAY_SUPPORT_PROMPT");
export const SEARCH_BUTTON_PROMPT = getText(DEFAULT_LOCALE, "SEARCH_BUTTON_PROMPT");
export const CABINET_PROMPT = getText(DEFAULT_LOCALE, "CABINET_PROMPT");
export const UPLOAD_MENU_PROMPT = getText(DEFAULT_LOCALE, "UPLOAD_MENU_PROMPT");
export const TRACK_SUPPORT_INVOICE_TITLE = getText(DEFAULT_LOCALE, "TRACK_SUPPORT_INVOICE_TITLE");

export function normalizeQuery(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

export function formatTrackButton(track, options = {}) {
  const marker = String(options.marker ?? DEFAULT_TRACK_MARKER).trim();
  const maxLength = Number.isInteger(options.maxLength) ? options.maxLength : MAX_BUTTON_TEXT;
  const duration = formatDuration(track.durationSeconds);
  const hiddenMarker = track.catalogVisible === false ? "🙈 " : "";
  const baseTitle = `${hiddenMarker}${track.title}`;
  const label = duration ? `${duration} ${baseTitle}` : baseTitle;
  const markedLabel = marker ? `${marker} ${label}` : label;
  return trimToLength(markedLabel, maxLength);
}

export function formatExternalSearchResultButton(result) {
  const duration = formatDuration(result.durationSeconds);
  const artistLine = [result.artist, result.title].filter(Boolean).join(" - ") || result.title;
  const label = duration ? `🌐 ${duration} ${artistLine}` : `🌐 ${artistLine}`;
  return trimToLength(label, MAX_BUTTON_TEXT);
}

export function formatUploadTitlePrompt(suggestedTitle, locale = DEFAULT_LOCALE) {
  const state = normalizeUploadPromptState(suggestedTitle);
  const base = getText(locale, "UPLOAD_TITLE_PROMPT");
  const lines = [base];

  if (state.title) {
    lines.push("");
    lines.push(getText(locale, "CURRENT_TITLE_LABEL", { title: escapeHtml(state.title) }));
  } else if (state.suggestedTitle) {
    lines.push("");
    lines.push(getText(locale, "SUGGESTION_LABEL", { title: escapeHtml(state.suggestedTitle) }));
  }

  lines.push("");
  lines.push(getText(
    locale,
    state.catalogVisible ? "UPLOAD_CATALOG_STATUS_VISIBLE" : "UPLOAD_CATALOG_STATUS_HIDDEN",
  ));

  return lines.join("\n");
}

export function formatSelectionMessage(track, locale = DEFAULT_LOCALE) {
  const lines = [`🎵 <b>${escapeHtml(track.title)}</b>`];

  if (track.uploaderName) {
    lines.push(getText(locale, "UPLOADED_BY", { name: escapeHtml(track.uploaderName) }));
  }

  lines.push("");
  lines.push(getText(locale, "TRACK_SENT_ABOVE"));
  return lines.join("\n");
}

export function formatTrackCaption(track, supportLink, locale = DEFAULT_LOCALE) {
  const lines = [`🎵 <b>${escapeHtml(track.title)}</b>`];

  if (track.uploaderName) {
    lines.push(getText(locale, "UPLOADED_BY", { name: escapeHtml(track.uploaderName) }));
  }

  if (supportLink) {
    lines.push(`<a href="${escapeHtml(supportLink)}">${escapeHtml(getText(locale, "SUPPORT_LINK_LABEL"))}</a>`);
  }

  return lines.join("\n");
}

export function formatExternalSearchResultCaption(result, locale = DEFAULT_LOCALE) {
  const lines = [`🌐 <b>${escapeHtml(result.title)}</b>`];

  if (result.artist) {
    lines.push(getText(locale, "ARTIST_LABEL", { artist: escapeHtml(result.artist) }));
  }

  if (result.durationSeconds > 0) {
    lines.push(getText(locale, "DURATION_LABEL", { duration: formatDuration(result.durationSeconds) }));
  }

  lines.push(getText(locale, "EXTERNAL_TRACK_STATUS"));

  if (result.source) {
    lines.push(getText(locale, "EXTERNAL_TRACK_SOURCE", { source: escapeHtml(result.source) }));
  }

  return lines.join("\n");
}

export function formatExternalUploadPrompt(result, locale = DEFAULT_LOCALE) {
  const suggestedTitle = [result.artist, result.title].filter(Boolean).join(" - ") || result.title;

  return [
    getText(locale, "EXTERNAL_UPLOAD_PROMPT_TITLE"),
    getText(locale, "EXTERNAL_UPLOAD_PROMPT_BODY"),
    "",
    getText(locale, "SUGGESTION_LABEL", { title: escapeHtml(suggestedTitle) }),
  ].join("\n");
}

export function formatTrackRenamePrompt(track, locale = DEFAULT_LOCALE) {
  return [
    getText(locale, "TRACK_RENAME_PROMPT_TITLE"),
    getText(locale, "TRACK_RENAME_PROMPT_BODY"),
    "",
    getText(locale, "TRACK_RENAME_CURRENT", { title: escapeHtml(track.title) }),
  ].join("\n");
}

export function formatTrackRenamedMessage(track, locale = DEFAULT_LOCALE) {
  return [
    getText(locale, "MY_TRACKS_TITLE"),
    "",
    getText(locale, "TRACK_RENAMED_PROMPT", { title: escapeHtml(track.title) }),
  ].join("\n");
}

export function formatMyTracksMessage(tracks, locale = DEFAULT_LOCALE) {
  if (tracks.length === 0) {
    return getText(locale, "MY_TRACKS_EMPTY_PROMPT");
  }

  const lines = [getText(locale, "MY_TRACKS_TITLE")];

  for (const [index, track] of tracks.entries()) {
    lines.push(`${index + 1}. ${track.title}`);
  }

  return lines.join("\n");
}

export function formatCabinetMessage(profile, platformSettings, locale = DEFAULT_LOCALE) {
  return [
    getText(locale, "CABINET_PROMPT"),
    "",
    getText(locale, "CABINET_TRACKS", { count: profile.trackCount }),
    getText(locale, "CABINET_BALANCE", { count: profile.starsTotalXtr }),
    profile.starsAvailableXtr >= platformSettings.withdrawMinStars
      ? getText(locale, "CABINET_WITHDRAW_READY")
      : getText(locale, "CABINET_WITHDRAW_MIN", { count: platformSettings.withdrawMinStars }),
  ].join("\n");
}

export function formatStarsBalanceMessage(profile, platformSettings, locale = DEFAULT_LOCALE) {
  return [
    getText(locale, "STARS_BALANCE_PROMPT"),
    "",
    getText(locale, "BALANCE_TOTAL", { count: profile.starsTotalXtr }),
    getText(locale, "BALANCE_AVAILABLE", { count: profile.starsAvailableXtr }),
    getText(locale, "BALANCE_PENDING", { count: profile.starsPendingXtr }),
    getText(locale, "BALANCE_FROZEN", { count: profile.starsFrozenXtr }),
    "",
    getText(locale, "BALANCE_MIN", { count: platformSettings.withdrawMinStars }),
  ].join("\n");
}

export function formatWithdrawMessage(profile, platformSettings, locale = DEFAULT_LOCALE) {
  const remaining = Math.max(0, platformSettings.withdrawMinStars - profile.starsAvailableXtr);

  return [
    getText(locale, "WITHDRAW_PROMPT"),
    "",
    getText(locale, "WITHDRAW_AVAILABLE", { count: profile.starsAvailableXtr }),
    getText(locale, "BALANCE_PENDING", { count: profile.starsPendingXtr }),
    getText(locale, "BALANCE_FROZEN", { count: profile.starsFrozenXtr }),
    getText(locale, "WITHDRAW_MIN", { count: platformSettings.withdrawMinStars }),
    "",
    profile.starsAvailableXtr >= platformSettings.withdrawMinStars
      ? getText(locale, "WITHDRAW_READY")
      : getText(locale, "WITHDRAW_LEFT", { count: remaining }),
  ].join("\n");
}

export function formatWithdrawRequestMessage(platformSettings, locale = DEFAULT_LOCALE) {
  if (platformSettings.paySupportHandle) {
    return [
      getText(locale, "WITHDRAW_REQUEST_TITLE"),
      getText(locale, "WITHDRAW_REQUEST_HANDLE", { handle: escapeHtml(platformSettings.paySupportHandle) }),
    ].join("\n");
  }

  return getText(locale, "WITHDRAW_REQUEST_FALLBACK");
}

export function formatStarsSupportMessage(track, _platformSettings, locale = DEFAULT_LOCALE) {
  return [
    getText(locale, "STARS_SUPPORT_TITLE"),
    `🎵 <b>${escapeHtml(track.title)}</b>`,
    track.uploaderName ? getText(locale, "UPLOADED_BY", { name: escapeHtml(track.uploaderName) }) : null,
    "",
    getText(locale, "STARS_SUPPORT_BODY"),
  ].filter(Boolean).join("\n");
}

export function formatStarsPaymentSuccessMessage(payment, locale = DEFAULT_LOCALE) {
  return getText(locale, "STARS_PAYMENT_SUCCESS", { amount: payment.authorShareXtr });
}

export function formatPaySupportMessage(platformSettings, locale = DEFAULT_LOCALE) {
  return platformSettings.paySupportHandle
    ? getText(locale, "PAY_SUPPORT_HANDLE", { handle: escapeHtml(platformSettings.paySupportHandle) })
    : getText(locale, "PAY_SUPPORT_PROMPT");
}

export function formatUploadTooLargeMessage(platformSettings, locale = DEFAULT_LOCALE) {
  return getText(locale, "UPLOAD_TOO_LARGE", { size: platformSettings.uploadMaxMb });
}

export function formatUploadDailyLimitMessage(platformSettings, locale = DEFAULT_LOCALE) {
  return getText(locale, "UPLOAD_DAILY_LIMIT", {
    limit: platformSettings.uploadDailyLimit,
    hours: formatHoursLabel(locale, platformSettings.uploadWindowHours),
  });
}

export function formatRulesMessage(platformSettings, locale = DEFAULT_LOCALE) {
  return [
    getText(locale, "RULES_TITLE"),
    "",
    getText(locale, "RULES_STEPS"),
    "",
    getText(locale, "RULES_LIMITS", {
      limit: platformSettings.uploadDailyLimit,
      hours: formatHoursLabel(locale, platformSettings.uploadWindowHours),
      size: platformSettings.uploadMaxMb,
    }),
    "",
    getText(locale, "RULES_NOTES"),
  ].join("\n");
}

export function formatCabinetTracksPreview(tracks, locale = DEFAULT_LOCALE) {
  if (tracks.length === 0) {
    return "";
  }

  const lines = [getText(locale, "NEWEST_TRACKS_TITLE")];
  for (const track of tracks.slice(0, 5)) {
    lines.push(`• ${track.title}`);
  }

  return lines.join("\n");
}

export function formatLanguagePrompt(locale = DEFAULT_LOCALE) {
  return getText(locale, "LANGUAGE_PROMPT");
}

export function formatLanguageSavedPrompt(locale = DEFAULT_LOCALE) {
  return getText(locale, "LANGUAGE_UPDATED_PROMPT", {
    startPrompt: getText(locale, "START_PROMPT"),
  });
}

function trimToLength(value, maxLength) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeUploadPromptState(input) {
  if (typeof input === "string") {
    return {
      catalogVisible: true,
      suggestedTitle: input,
      title: "",
    };
  }

  return {
    catalogVisible: input?.catalogVisible !== false,
    suggestedTitle: String(input?.suggestedTitle ?? "").trim(),
    title: String(input?.title ?? "").trim(),
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatHoursLabel(locale, hours) {
  if ((normalizeLocale(locale) ?? DEFAULT_LOCALE) === "ru") {
    return `${hours} ${pluralizeRu(hours, "час", "часа", "часов")}`;
  }

  return `${hours} ${getText(locale, "HOURS_LABEL")}`;
}

function pluralizeRu(value, one, few, many) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}
