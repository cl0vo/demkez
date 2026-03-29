# DemoHub

Telegram-бот `DemoHub`: пользователи загружают свои mp3, дают им название, после чего любой пользователь может найти трек по названию и переслать его себе прямо в чате.

## Что умеет MVP

- `/start` отвечает одной короткой фразой
- Любое текстовое сообщение считается поиском, если нет активной загрузки
- Пользователь может загрузить `mp3` как `audio` или `document`
- После загрузки бот предлагает пример названия из метаданных/имени файла
- После загрузки бот просит только название и сразу публикует трек
- На выгрузку действуют лимиты по размеру файла и количеству загрузок за 24 часа
- Результаты приходят сразу inline-кнопками
- После нажатия бот сразу отправляет сохраненный трек
- `/my` открывает личный кабинет с треками и Stars-балансом
- `/rules` показывает правила загрузки и оплаты
- Поддержка автора проходит через `Telegram Stars` с внутренним split `97/3`
- Бот обрабатывает `invoice -> pre_checkout_query -> successful_payment`
- Бот пишет структурные JSON-логи и сохраняет snapshots сбоев для replay

## Запуск

1. Создай Telegram-бота через `@BotFather`
2. Скопируй токен в `.env`
3. Установи зависимости:

```bash
npm install
```

4. Запусти бота:

```bash
npm start
```

## Переменные окружения

```env
BOT_TOKEN=your_telegram_bot_token
PAY_SUPPORT_HANDLE=@demohub_support
STARS_HOLD_DAYS=7
STARS_SUPPORT_AMOUNTS=10,25,50
WITHDRAW_MIN_STARS=100
UPLOAD_MAX_MB=25
UPLOAD_DAILY_LIMIT=20
```

## Правила по умолчанию

- только `mp3` как `audio` или `document`
- размер файла до `25 MB`
- до `20` выгрузок за `24` часа на пользователя
- жалобы на треки могут привести к скрытию трека
- донаты в `Stars` зачисляются автору на внутренний баланс
- сервис удерживает `3%`

## Разработка

```bash
npm run dev
npm test
npm run replay
```

## Автономный цикл разработки

- `npm test` гоняет unit и integration-тесты без ручного Telegram-клиента
- `npm run replay` прогоняет replay-fixtures с синтетическими Telegram update-ами
- Во время `npm start` бот пишет JSON-логи в `.runtime/logs/events.ndjson`
- При ошибках runtime сохраняет snapshots в `.runtime/replays/failed`

Это позволяет до финальной ручной проверки в Telegram Desktop исправлять поведение по логам и replay-кейсам, а не руками кликать клиент после каждого изменения.

## VPS

Для VPS сейчас достаточно одного постоянного polling-процесса. Не запускайте два экземпляра с одним `BOT_TOKEN`, иначе Telegram вернёт `409 Conflict`.

Быстрый вариант через `pm2`:

```bash
npm install
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Логи:

- `.runtime/logs/events.ndjson`
- `.runtime/replays/failed`
