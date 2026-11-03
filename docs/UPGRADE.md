# Upgrade guide

## Before upgrading

1. Back up `pb_data` or create a PocketBase dashboard backup.
2. Read the target release notes.
3. Note the current image tag or commit SHA.

## Docker

```bash
docker compose build
docker compose up -d
```

Migrations run automatically when PocketBase starts. If a migration fails, keep the old containers stopped and restore the backup.

## Local

```bash
git pull
make pb
make migrate
cd web && npm ci && npm run build
```

## Rollback

1. Stop the app.
2. Restore the pre-upgrade `pb_data` archive.
3. Check out the previous tag.
4. Rebuild/start.

Never roll back only the application while keeping a database that has newer migrations applied. Restore the matching data directory.
