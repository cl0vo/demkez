const MAX_BUTTON_TEXT = 55;

export const START_PROMPT = "Demkez — мини-платформа для обмена mp3.\nИщи треки по названию или загружай свои.";
export const SEARCH_RESULTS_PROMPT = "Вот что нашлось:";
export const EMPTY_QUERY_PROMPT = "Напиши трек или артиста";
export const EMPTY_RESULTS_PROMPT = "Ничего не нашлось. Попробуй иначе.";
export const LOOKUP_ERROR_PROMPT = "Не получилось отправить трек. Попробуй ещё раз.";
export const NON_TEXT_PROMPT = "Нужен текст или mp3";
export const SEARCH_ERROR_PROMPT = "Поиск не сработал. Попробуй ещё раз.";
export const UPLOAD_TITLE_PROMPT = "Как назвать трек?\nНапример: Travis Scott - FE!N";
export const UPLOAD_DONATION_PROMPT = "Ссылка на донат или -";
export const UPLOAD_DONE_PROMPT = "Сохранено. Теперь трек можно найти.";
export const UPLOAD_LINK_ERROR_PROMPT = "Нужна ссылка или -";
export const UPLOAD_ONLY_MP3_PROMPT = "Пришли mp3 файлом или аудио";
export const SENT_TRACK_PROMPT = "Отправлено. Ищи следующий трек";
export const MY_TRACKS_EMPTY_PROMPT = "У тебя пока нет треков";
export const TITLE_SUGGESTION_SAVED_PROMPT = "Название сохранено. Теперь ссылка на донат или -";
export const TON_WALLET_PROMPT = "Пришли TON address или -";
export const TON_WALLET_SAVED_PROMPT = "TON донат подключен";
export const TON_WALLET_DISABLED_PROMPT = "TON донат отключен";
export const TON_WALLET_INVALID_PROMPT = "Это не похоже на TON address";
export const DONATION_INFO_UNAVAILABLE_PROMPT = "У автора пока нет TON-доната";
export const SEARCH_BUTTON_TEXT = "Поиск";
export const UPLOAD_BUTTON_TEXT = "Загрузить MP3";
export const CABINET_BUTTON_TEXT = "Кабинет";
export const SEARCH_BUTTON_PROMPT = "Напиши название трека";
export const CABINET_TRACKS_PREVIEW_EMPTY = "Треков пока нет";

function trimToLength(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

export function normalizeQuery(text) {
  return text.replace(/\s+/g, " ").trim();
}

export function formatTrackButton(track) {
  const secondary = track.artist ?? track.uploaderName;
  return trimToLength(secondary ? `${track.title} · ${secondary}` : track.title, MAX_BUTTON_TEXT);
}

export function formatUploadTitlePrompt(suggestedTitle) {
  if (!suggestedTitle) {
    return UPLOAD_TITLE_PROMPT;
  }

  return `${UPLOAD_TITLE_PROMPT}\nПохоже на: ${suggestedTitle}`;
}

export function formatSelectionMessage(track) {
  const lines = [`🎵 <b>${escapeHtml(track.title)}</b>`];

  if (track.uploaderName) {
    lines.push(`Загрузил: ${escapeHtml(track.uploaderName)}`);
  }

  if (track.tonAddress) {
    lines.push("TON донат подключен");
  } else if (track.donationUrl) {
    lines.push(`<a href="${escapeAttribute(track.donationUrl)}">Поддержать автора</a>`);
  }

  lines.push("");
  lines.push("Отправь ещё название или загрузи mp3");

  return lines.join("\n");
}

export function formatTrackCaption(track) {
  const lines = [track.title];

  if (track.uploaderName) {
    lines.push(`Загрузил: ${track.uploaderName}`);
  }

  if (track.donationUrl) {
    lines.push(`Поддержать: ${track.donationUrl}`);
  }

  return lines.join("\n");
}

export function formatMyTracksMessage(tracks) {
  if (tracks.length === 0) {
    return MY_TRACKS_EMPTY_PROMPT;
  }

  const lines = ["Твои треки:"];

  for (const [index, track] of tracks.entries()) {
    lines.push(`${index + 1}. ${track.title}`);
  }

  return lines.join("\n");
}

export function formatCabinetMessage(profile, platformSettings) {
  const lines = [
    "demkez кабинет",
    `Треков: ${profile.trackCount}`,
    `TON донат: ${profile.hasTonAddress ? "подключен" : "не подключен"}`,
    `Сплит: ${100 - platformSettings.feeBps / 100}% автору / ${platformSettings.feePercentLabel} сервису`,
    "Поиск работает просто текстом",
    "Загрузка: пришли mp3",
  ];

  if (profile.tonAddress) {
    lines.push(`TON: <code>${escapeHtml(profile.tonAddress)}</code>`);
  }

  if (!platformSettings.platformTonAddress) {
    lines.push("Кошелек сервиса еще не задан");
  }

  return lines.join("\n");
}

export function formatDonationInfoMessage(track, platformSettings) {
  const lines = [
    `TON донат для <b>${escapeHtml(track.title)}</b>`,
    `Автору: 97%`,
    `Сервису: ${platformSettings.feePercentLabel}`,
  ];

  if (track.tonAddress) {
    lines.push(`Кошелек автора: <code>${escapeHtml(track.tonAddress)}</code>`);
  }

  if (platformSettings.platformTonAddress) {
    lines.push(`Кошелек сервиса: <code>${escapeHtml(platformSettings.platformTonAddress)}</code>`);
  }

  lines.push("");
  lines.push("Для автосплита 97/3 нужен Mini App с TON Connect");

  return lines.join("\n");
}

export function formatCabinetTracksPreview(tracks) {
  if (tracks.length === 0) {
    return CABINET_TRACKS_PREVIEW_EMPTY;
  }

  const lines = ["Последние треки:"];

  for (const track of tracks.slice(0, 5)) {
    lines.push(`• ${track.title}`);
  }

  return lines.join("\n");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value) {
  return value.replaceAll('"', "&quot;");
}
