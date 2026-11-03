PB_VERSION ?= 0.40.6
PB_PORT ?= 8097
PB_URL ?= http://127.0.0.1:$(PB_PORT)
ADMIN_EMAIL ?= admin@openroster.local
ADMIN_PASSWORD ?= OpenRoster123!

.PHONY: setup pb web admin migrate seed dev-pb dev-web build docker

setup: pb web

pb: pb/pocketbase

pb/pocketbase:
	PB_VERSION=$(PB_VERSION) ./scripts/fetch-pocketbase.sh

web: web/node_modules

web/node_modules: web/package.json web/package-lock.json
	cd web && npm install

admin: pb
	cd pb && ./pocketbase superuser upsert "$(ADMIN_EMAIL)" "$(ADMIN_PASSWORD)" --dir=pb_data

migrate: pb
	cd pb && ./pocketbase migrate up --dir=pb_data

seed:
	PB_URL=$(PB_URL) node scripts/seed.mjs

dev-pb: pb
	cd pb && ./pocketbase serve --http=127.0.0.1:$(PB_PORT) --dir=pb_data

dev-web:
	cd web && npm run dev

build:
	cd web && npm run build

docker:
	docker compose up --build
