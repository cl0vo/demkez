const MAX_BUTTON_TEXT = 55;

export const START_PROMPT = "🎧 <b>DemoHub</b>\nВыгружайте свои mp3, находите треки и поддерживайте авторов в Stars.\n\nНапишите название трека или артиста.";
export const SEARCH_RESULTS_PROMPT = "🔎 <b>Вот что нашлось</b>";
export const EMPTY_QUERY_PROMPT = "🔎 Напишите название трека или артиста.";
export const EMPTY_RESULTS_PROMPT = "Ничего не нашлось.\nПопробуйте другой запрос.";
export const LOOKUP_ERROR_PROMPT = "Не удалось открыть трек.\nПопробуйте ещё раз.";
export const NON_TEXT_PROMPT = "Напишите название трека\nили выгрузите mp3.";
export const SEARCH_ERROR_PROMPT = "Поиск временно недоступен.\nПопробуйте ещё раз чуть позже.";
export const UPLOAD_TITLE_PROMPT = "🎵 <b>Назовите трек</b>\nТак его будут находить в поиске.\nНапример: <code>Travis Scott - FE!N</code>";
export const UPLOAD_DONE_PROMPT = "✅ <b>Трек опубликован</b>\nТеперь он доступен в поиске.\n⭐ <b>Stars</b> за поддержку этого трека будут зачисляться вам на внутренний баланс.";
export const UPLOAD_ONLY_MP3_PROMPT = "Пришли mp3 файлом\nили как аудио.";
export const SENT_TRACK_PROMPT = "🔎 Можно искать дальше.";
export const TRACK_OPENED_PROMPT = "🎧 <b>Трек открыт</b>\nМожно продолжать поиск.";
export const MY_TRACKS_EMPTY_PROMPT = "Здесь пока пусто.\nВыгрузите первый mp3, и он сразу появится в поиске.";
export const MY_TRACKS_TITLE = "🎵 <b>Мои треки</b>";
export const TITLE_SUGGESTION_SAVED_PROMPT = "✅ <b>Трек опубликован</b>\nТеперь он доступен в поиске.\n⭐ <b>Stars</b> за поддержку этого трека будут зачисляться вам на внутренний баланс.";
export const STARS_BALANCE_PROMPT = "⭐ <b>Баланс</b>";
export const WITHDRAW_PROMPT = "💸 <b>Вывод Stars</b>";
export const STARS_SUPPORT_PROMPT = "Выберите сумму поддержки";
export const STARS_SUPPORT_UNAVAILABLE_PROMPT = "Сейчас этот трек нельзя поддержать.";
export const STARS_INVOICE_EXPIRED_PROMPT = "Ссылка на оплату уже устарела.\nОткройте новую через «Поддержать».";
export const PAY_SUPPORT_PROMPT = "Если возникла проблема с оплатой, напишите в поддержку.";
export const RULES_PROMPT = "📘 <b>Правила DemoHub</b>";
export const SEARCH_BUTTON_TEXT = "🔎 Поиск";
export const UPLOAD_BUTTON_TEXT = "⬆️ Загрузить mp3";
export const CABINET_BUTTON_TEXT = "👤 Кабинет";
export const SEARCH_BUTTON_PROMPT = "🔎 <b>Поиск</b>\nНапишите название трека или артиста.";
export const CABINET_TRACKS_PREVIEW_EMPTY = "Треков пока нет.";
export const CABINET_PROMPT = "👤 <b>Кабинет</b>";
export const UPLOAD_MENU_PROMPT = [
  "⬆️ <b>Выгрузите трек</b>",
  "Пришлите mp3 файлом или как аудио.",
  "",
  "<b>Как это работает</b>",
  "1. Выгружаете mp3",
  "2. Даёте название",
  "3. Трек появляется в поиске",
  "4. <b>Stars</b> за поддержку идут вам на внутренний баланс",
].join("\n");
export const TRACK_SUPPORT_INVOICE_TITLE = "Поддержать трек";

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
  const duration = formatDuration(track.durationSeconds);
  const label = duration ? `${duration} ${track.title}` : track.title;
  return trimToLength(label, MAX_BUTTON_TEXT);
}

export function formatUploadTitlePrompt(suggestedTitle) {
  if (!suggestedTitle) {
    return UPLOAD_TITLE_PROMPT;
  }

  return `${UPLOAD_TITLE_PROMPT}\n\n<b>Подсказка:</b> ${escapeHtml(suggestedTitle)}`;
}

export function formatSelectionMessage(track) {
  const lines = [`🎵 <b>${escapeHtml(track.title)}</b>`];

  if (track.uploaderName) {
    lines.push(`uploaded by ${escapeHtml(track.uploaderName)}`);
  }

  lines.push("");
  lines.push("Трек отправлен выше.");

  return lines.join("\n");
}

export function formatTrackCaption(track, supportLink) {
  const lines = [`🎵 <b>${escapeHtml(track.title)}</b>`];

  if (track.uploaderName) {
    lines.push(`uploaded by ${escapeHtml(track.uploaderName)}`);
  }

  if (supportLink) {
    lines.push(`<a href="${escapeHtml(supportLink)}">💫 Поддержать</a>`);
  }

  return lines.join("\n");
}

export function formatMyTracksMessage(tracks) {
  if (tracks.length === 0) {
    return MY_TRACKS_EMPTY_PROMPT;
  }

  const lines = [MY_TRACKS_TITLE];

  for (const [index, track] of tracks.entries()) {
    lines.push(`${index + 1}. ${track.title}`);
  }

  return lines.join("\n");
}

export function formatCabinetMessage(profile, platformSettings) {
  const totalStars = profile.starsTotalXtr;
  const withdrawMinStars = platformSettings.withdrawMinStars;
  const lines = [
    CABINET_PROMPT,
    "",
    `🎵 Треков: ${profile.trackCount}`,
    `⭐ Баланс: ${totalStars} Stars`,
    totalStars >= withdrawMinStars
      ? "💸 Вывод уже доступен"
      : `💸 Вывод от ${withdrawMinStars} Stars`,
  ];

  return lines.join("\n");
}

export function formatStarsBalanceMessage(profile, platformSettings) {
  const availableStars = profile.starsAvailableXtr;
  const totalStars = profile.starsTotalXtr;
  const lines = [
    STARS_BALANCE_PROMPT,
    "",
    `Сейчас у вас: <b>${totalStars} Stars</b>`,
    `К выводу доступно: <b>${availableStars} Stars</b>`,
    "",
    `Вывод открывается от <b>${platformSettings.withdrawMinStars} Stars</b>.`,
  ];

  return lines.join("\n");
}

export function formatWithdrawMessage(profile, platformSettings) {
  const availableStars = profile.starsAvailableXtr;
  const minStars = platformSettings.withdrawMinStars;
  const remaining = Math.max(0, minStars - availableStars);

  return [
    WITHDRAW_PROMPT,
    "",
    `Доступно к выводу: <b>${availableStars} Stars</b>`,
    `Минимум: <b>${minStars} Stars</b>`,
    "",
    availableStars >= minStars
      ? "Можно отправить заявку на вывод."
      : `До вывода осталось: <b>${remaining} Stars</b>`,
  ].join("\n");
}

export function formatWithdrawRequestMessage(platformSettings) {
  if (platformSettings.paySupportHandle) {
    return [
      "💸 <b>Заявка на вывод</b>",
      `Напишите <b>${escapeHtml(platformSettings.paySupportHandle)}</b> и укажите сумму вывода.`,
    ].join("\n");
  }

  return "💸 <b>Заявка на вывод</b>\nНапишите в поддержку и укажите сумму вывода.";
}

export function formatStarsSupportMessage(track, platformSettings) {
  return [
    "⭐ <b>Поддержать трек</b>",
    `🎵 <b>${escapeHtml(track.title)}</b>`,
    track.uploaderName ? `uploaded by ${escapeHtml(track.uploaderName)}` : null,
    "",
    "Выберите сумму в Stars.",
    "Поддержка зачислится на внутренний баланс владельца трека.",
  ].filter(Boolean).join("\n");
}

export function formatStarsPaymentSuccessMessage(payment) {
  return [
    "⭐ <b>Спасибо за поддержку</b>",
    `На баланс владельца зачислено: <b>+${payment.authorShareXtr} Stars</b>`,
  ].join("\n");
}

export function formatPaySupportMessage(platformSettings) {
  if (platformSettings.paySupportHandle) {
    return `Если что-то пошло не так,\nнапишите <b>${escapeHtml(platformSettings.paySupportHandle)}</b>`;
  }

  return PAY_SUPPORT_PROMPT;
}

export function formatUploadTooLargeMessage(platformSettings) {
  return [
    "⚠️ <b>Файл слишком большой</b>",
    `Максимум: ${platformSettings.uploadMaxMb} MB.`,
    "Сожмите mp3 и попробуйте снова.",
  ].join("\n");
}

export function formatUploadDailyLimitMessage(platformSettings) {
  return [
    "⚠️ <b>Лимит загрузок на сегодня исчерпан</b>",
    `Можно загрузить до ${platformSettings.uploadDailyLimit} треков за ${formatHours(platformSettings.uploadWindowHours)}.`,
    "Попробуйте позже.",
  ].join("\n");
}

export function formatRulesMessage(platformSettings) {
  return [
    "📘 <b>Как работает DemoHub</b>",
    "",
    "<b>Этапы</b>",
    "1. Выгрузите mp3 файлом или как аудио",
    "2. Назовите трек так, как он должен отображаться в поиске",
    "3. Трек сразу появится в DemoHub",
    "4. ⭐ <b>Stars</b> за поддержку будут зачисляться владельцу трека на внутренний баланс",
    "",
    "<b>Ограничения</b>",
    `• до ${platformSettings.uploadMaxMb} MB на файл`,
    `• до ${platformSettings.uploadDailyLimit} загрузок за ${formatHours(platformSettings.uploadWindowHours)}`,
    "",
    "<b>Важно</b>",
    "• строка uploaded by показывает, кто выгрузил трек",
    "• треки с жалобами могут быть скрыты",
    "• Stars зачисляются владельцу трека на внутренний баланс",
  ].join("\n");
}

export function formatCabinetTracksPreview(tracks) {
  if (tracks.length === 0) {
    return CABINET_TRACKS_PREVIEW_EMPTY;
  }

  const lines = ["🎵 <b>Последние треки</b>"];

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

function formatDays(value) {
  return `${value} ${pluralizeRu(value, "день", "дня", "дней")}`;
}

function formatHours(value) {
  return `${value} ${pluralizeRu(value, "час", "часа", "часов")}`;
}

function formatDuration(value) {
  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(remainingMinutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
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
