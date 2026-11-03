# Backup and restore

Back up the entire PocketBase data directory — that includes SQLite, uploads, settings and logs.

## Local / Docker volume

For a consistent backup, stop PocketBase first:

```bash
docker compose stop pocketbase
./scripts/backup.sh
docker compose start pocketbase
```

`make backup` is a shortcut for `./scripts/backup.sh`. The archive lands in `backups/`.

Restore:

```bash
docker compose stop pocketbase
./scripts/restore.sh backups/openroster-YYYYMMDD-HHMMSS.tar.gz
docker compose start pocketbase
```

The restore script moves the current `pb_data` aside before extracting.

## Hot backups

PocketBase's dashboard (`/_/` → Settings → Backups) can create a consistent hot backup. Keep the dashboard private and copy the resulting archive off the host on a schedule.

## Test the restore

A backup that has never been restored is a hope, not a backup. Once a quarter:

1. Restore into a scratch directory.
2. Start PocketBase on a spare port.
3. Log in and confirm a pay run and its stubs are present.
