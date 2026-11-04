PB_VERSION ?= 0.40.6
PB_PORT ?= 8097
PB_URL ?= http://127.0.0.1:$(PB_PORT)
ADMIN_EMAIL ?= admin@openroster.local
ADMIN_PASSWORD ?=

.PHONY: setup init pb web admin migrate seed demo dev-pb dev-web build test test-api test-ui types retention retention-apply backup docker

setup: pb web

init: setup
	@echo "Run 'make dev-pb' and 'make dev-web', then open http://127.0.0.1:3000/setup"

pb: pb/pocketbase

pb/pocketbase:
	PB_VERSION=$(PB_VERSION) ./scripts/fetch-pocketbase.sh

web: web/node_modules

web/node_modules: web/package.json web/package-lock.json
	cd web && npm install

admin: pb
	@test -n "$(ADMIN_PASSWORD)" || (echo "Set ADMIN_PASSWORD to a strong password, e.g. make admin ADMIN_PASSWORD='...'" >&2; exit 1)
	cd pb && ./pocketbase superuser upsert "$(ADMIN_EMAIL)" "$(ADMIN_PASSWORD)" --dir=pb_data

migrate: pb
	cd pb && ./pocketbase migrate up --dir=pb_data

seed:
	@test -n "$$PB_SUPERUSER_PASSWORD" || (echo "Set PB_SUPERUSER_PASSWORD to the PocketBase superuser password." >&2; exit 1)
	PB_URL=$(PB_URL) node scripts/seed.mjs

demo:
	@echo "Start PocketBase with 'make dev-pb', then run:"
	@echo "  PB_SUPERUSER_PASSWORD='<superuser password>' make seed"

dev-pb: pb
	cd pb && ./pocketbase serve --http=127.0.0.1:$(PB_PORT) --dir=pb_data

dev-web:
	cd web && NEXT_PUBLIC_PB_URL=$(PB_URL) npm run dev

build:
	cd web && NEXT_PUBLIC_PB_URL=$(PB_URL) npm run build

envcheck:
	@test -n "$$NEXT_PUBLIC_PB_URL" || (echo "Set NEXT_PUBLIC_PB_URL (or PB_PORT) before building." >&2; exit 1)
	cd web && NEXT_PUBLIC_PB_URL=$(NEXT_PUBLIC_PB_URL) npm run build >/dev/null 2>&1
	@node scripts/check-pb-url.mjs "$(NEXT_PUBLIC_PB_URL)"

test:
	node --test tests/*.test.cjs
	cd web && node --test tests/tz.test.mjs
	cd web && node --experimental-strip-types tests/format.test.mjs
	cd web && node --experimental-strip-types tests/schedule-range.test.mjs
	cd web && node --experimental-strip-types tests/i18n.test.mjs

test-api:
	node scripts/test-api.mjs
	node scripts/test-setup.mjs

types:
	@test -n "$$PB_SUPERUSER_PASSWORD" || (echo "Set PB_SUPERUSER_PASSWORD to the PocketBase superuser password." >&2; exit 1)
	PB_URL=$(PB_URL) ./scripts/generate-types.sh

test-ui:
	cd web && NEXT_PUBLIC_PB_URL=http://127.0.0.1:18097 npm run build
	cd web && node scripts/ui-smoke.mjs
	cd web && node scripts/ui-setup.mjs

retention:
	@test -n "$$PB_SUPERUSER_PASSWORD" || (echo "Set PB_SUPERUSER_PASSWORD to the PocketBase superuser password." >&2; exit 1)
	PB_URL=$(PB_URL) node scripts/retention.mjs

retention-apply:
	@test -n "$$PB_SUPERUSER_PASSWORD" || (echo "Set PB_SUPERUSER_PASSWORD to the PocketBase superuser password." >&2; exit 1)
	PB_URL=$(PB_URL) node scripts/retention.mjs --apply

backup:
	./scripts/backup.sh

docker:
	docker compose up --build
