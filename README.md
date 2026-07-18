# RSS to Telegram

A self-hosted Node.js service that watches RSS/Atom feeds and posts new items to Telegram chats. It includes Telegram admin commands, JSON-file persistence, OpenAI-powered English and Chinese summaries when article text is readable, and a local status dashboard.

## Features

- Telegram bot commands for adding, removing, listing, previewing, and checking feed status.
- Admin-only command access via `TELEGRAM_ADMIN_IDS`.
- Polling RSS/Atom feeds with per-subscription duplicate prevention.
- Best-effort article extraction with Readability.
- OpenAI bilingual summaries when `OPENAI_API_KEY` is configured; feed excerpts are used as fallback.
- Local dashboard bound to `127.0.0.1:3000` through Docker Compose.
- Atomic JSON state writes in `./data/rss-to-telegram.json`.

## Configuration

Copy `.env.example` to `.env` and fill in the required values:

```sh
cp .env.example .env
```

Required:

- `TELEGRAM_BOT_TOKEN`: bot token from BotFather.
- `TELEGRAM_ADMIN_IDS`: comma-separated Telegram user IDs allowed to manage feeds.

Optional:

- `OPENAI_API_KEY`: enables AI summaries.
- `OPENAI_MODEL`: defaults to `gpt-4o-mini`.
- `OPENAI_BASE_URL`: optional OpenAI-compatible API endpoint override.
- `OPENAI_TIMEOUT_MS`: OpenAI request timeout in milliseconds. Defaults to `30000`.
- `OPENAI_MAX_RETRIES`: OpenAI SDK retry count. Defaults to `2`.
- `POLL_INTERVAL_SECONDS`: defaults to `300`.
- `WEB_HOST`: defaults to `127.0.0.1` locally. Compose sets the container to `0.0.0.0` but publishes only to host localhost.
- `WEB_PORT`: defaults to `3000`.
- `DATA_FILE`: defaults to `./data/rss-to-telegram.json` locally and `/app/data/rss-to-telegram.json` in Compose.
- `LOG_LEVEL`: structured JSON log level, one of `debug`, `info`, `warn`, or `error`. Defaults to `info`.

Logs are written to stdout/stderr as JSON objects so Docker Compose and common log collectors can parse them. Use `LOG_LEVEL=debug` when diagnosing feed parsing or Telegram delivery behavior.

## Run Locally

```sh
pnpm install
pnpm dev
```

## Run With Docker Compose

```sh
docker compose up --build
```

The dashboard is available on the host at `http://127.0.0.1:3000`. Keep it behind localhost, SSH tunneling, or a trusted reverse proxy because the dashboard has no authentication.

## Telegram Commands

The service registers its command menu with Telegram during startup.

- `/add <feed_url>` subscribes the current chat to a feed.
- `/addchannel <@channel_or_id> <feed_url>` subscribes a Telegram channel to a feed.
- `/remove <feed_url_or_id>` removes a subscription from the current chat.
- `/removechannel <@channel_or_id> <feed_url_or_id>` removes a feed subscription from a channel.
- `/list` shows active subscriptions in the current chat.
- `/listchannel <@channel_or_id>` shows active subscriptions for a channel.
- `/check` immediately checks feeds subscribed to the current chat.
- `/checkchannel <@channel_or_id>` immediately checks feeds subscribed to a channel.
- `/status` shows delivery and feed health.
- `/preview <feed_url>` previews the latest item without subscribing.

For channel delivery, add the bot to the channel as an admin with permission to post messages. Public channels can use `@channelusername`; private channels should use their numeric Telegram channel ID.

## Development

```sh
pnpm test
pnpm build
pnpm typecheck
```

This service is designed for a single running instance. JSON persistence is not intended for multiple concurrent app instances writing to the same state file.
