# Monitoring and error tracking

OpenRoster is self-hosted, so monitoring is deliberately simple.

## Built in

- **PocketBase logs** are available in the dashboard (`/_/` → Logs) and on disk under `pb_data/logs.db`.
- **Client errors** hit `POST /api/openroster/client-error` and are written as `CLIENT_ERROR ...` to the PocketBase process log.
- **Health endpoints:** `GET /api/health` (PocketBase) and `GET /login` (web container healthcheck).
- **Docker logs:** `docker compose logs -f pocketbase web`.

## Uptime checks

Point an uptime monitor (Uptime Kuma, Healthchecks, Better Stack, etc.) at:

- `https://api.example.com/api/health`
- `https://app.example.com/login`

Alert on two consecutive failures. Add a second check for TLS certificate expiry.

## External error tracking

If you want stack traces with releases and user context, add Sentry or GlitchTip to the Next app:

1. Create a project and set `SENTRY_DSN`.
2. Wrap the app with the Sentry Next.js SDK and upload source maps at build time.
3. Keep the built-in client-error route enabled or forward it to Sentry.

Do not send payroll or document contents to a third-party tracker. Scrub request bodies, employee names and pay amounts.

## Log retention

PocketBase keeps logs in `logs.db`. Set a retention window in the dashboard (Settings → Logs) or rotate `pb_data` backups. Keep application logs out of the public repo.
