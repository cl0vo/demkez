const MAX_BUTTON_TEXT = 55;

export const START_PROMPT = "Demkez — мини-платформа для обмена mp3.\nИщи треки по названию или загружай свои.";
export const SEARCH_RESULTS_PROMPT = "Вот что нашлось:";
export const EMPTY_QUERY_PROMPT = "Напиши трек или артиста";
export const EMPTY_RESULTS_PROMPT = "Ничего не нашлось. Попробуй иначе.";
export const LOOKUP_ERROR_PROMPT = "Не получилось отправить трек. Попробуй ещё раз.";
export const NON_TEXT_PROMPT = "Нужен текст или mp3";
export const SEARCH_ERROR_PROMPT = "Поиск не сработал. Попробуй ещё раз.";
export const UPLOAD_TITLE_PROMPT = "Как назвать трек?\nНапример: Travis Scott - FE!N";
export const UPLOAD_DONE_PROMPT = "Сохранено. Теперь трек можно найти.";
export const UPLOAD_ONLY_MP3_PROMPT = "Пришли mp3 файлом или аудио";
export const SENT_TRACK_PROMPT = "Отправлено. Ищи следующий трек";
export const MY_TRACKS_EMPTY_PROMPT = "У тебя пока нет треков";
export const TITLE_SUGGESTION_SAVED_PROMPT = "Название сохранено. Трек опубликован.";
export const STARS_BALANCE_PROMPT = "Stars баланс";
export const STARS_SUPPORT_PROMPT = "Выбери сумму поддержки";
export const STARS_SUPPORT_UNAVAILABLE_PROMPT = "Поддержка в Stars сейчас недоступна.";
export const STARS_INVOICE_EXPIRED_PROMPT = "Счёт устарел. Нажми поддержку ещё раз.";
export const STARS_PAYMENT_SUCCESS_PROMPT = "Спасибо. Поддержка в Stars отправлена.";
export const PAY_SUPPORT_PROMPT = "По оплате напиши в поддержку.";
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

  if (track.supportsStars) {
    lines.push("Поддержка: Telegram Stars");
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
    `Донаты: Telegram Stars`,
    `В ожидании: ${profile.starsPendingXtr} XTR`,
    `Доступно: ${profile.starsAvailableXtr} XTR`,
    `Заморожено: ${profile.starsFrozenXtr} XTR`,
    `Сплит: ${100 - platformSettings.feeBps / 100}% автору / ${platformSettings.feePercentLabel} сервису`,
    "Поиск работает просто текстом",
    "Загрузка: пришли mp3",
  ];

  lines.push(`Холд выплат: ${platformSettings.starsHoldDays} дн.`);

  return lines.join("\n");
}

export function formatStarsBalanceMessage(profile, platformSettings) {
  const lines = [
    "Stars баланс",
    `В ожидании: ${profile.starsPendingXtr} XTR`,
    `Доступно: ${profile.starsAvailableXtr} XTR`,
    `Заморожено: ${profile.starsFrozenXtr} XTR`,
    "",
    `Автору: ${100 - platformSettings.feeBps / 100}%`,
    `Сервису: ${platformSettings.feePercentLabel}`,
    `Холд: ${platformSettings.starsHoldDays} дн.`,
  ];

  return lines.join("\n");
}

export function formatStarsSupportMessage(track, platformSettings) {
  return [
    `Поддержать <b>${escapeHtml(track.title)}</b>`,
    `Автору: ${100 - platformSettings.feeBps / 100}%`,
    `Сервису: ${platformSettings.feePercentLabel}`,
    "",
    "Оплата проходит через Telegram Stars.",
  ].join("\n");
}

export function formatPaySupportMessage(platformSettings) {
  if (platformSettings.paySupportHandle) {
    return `По оплате напиши ${platformSettings.paySupportHandle}`;
  }

  return PAY_SUPPORT_PROMPT;
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
