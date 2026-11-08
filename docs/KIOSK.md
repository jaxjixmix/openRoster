# Kiosk tablets

OpenRoster's kiosk is a standalone web app at `/kiosk`. It is designed for a
wall-mounted iPad or Android tablet and is the shared device contract for a
future native shell.

## Pair a tablet

1. Sign in as a manager and open **Settings → Kiosk mode**.
2. Name the tablet, choose its location, and select **Pair tablet**.
3. Enter the six-digit code at `/kiosk` on the tablet within 10 minutes.

Each tablet gets its own random device token, scoped to one company and
location. It can read the active roster and record punches, and nothing else.
Revoke a tablet in Settings; its token stops working immediately.

## Employee PINs

Each employee needs a 4–8 digit kiosk PIN, set by a manager in the person
editor. PINs are hashed on the server. Without a PIN, the employee card still
appears but clocking in is blocked with an instruction to ask a manager.

## Tablet setup

- Open `/kiosk` in Safari or Chrome and **Add to Home Screen**; the kiosk
  manifest starts directly at `/kiosk` in standalone landscape.
- iPad: enable **Guided Access** and disable sleep for the kiosk session.
- Android: use a managed kiosk browser or screen pinning.
- The page requests a screen wake lock; fullscreen is available in the header.

## Offline behavior

If the tablet loses the network, actions queue in local storage and sync when
it reconnects. Offline punches skip the PIN check because it requires the
server; they are marked `PIN not verified` on the punch and should be reviewed
by a manager. Phase 2 deliberately keeps this tradeoff visible.

## Manager override

The manager time-clock page remains the override path: corrections and
supervisor punches happen there, behind manager authentication. The kiosk
device itself has no payroll, people, or correction powers.

## Native prep

The kiosk calls:

- `POST /api/openroster/kiosk/pair`
- `GET /api/openroster/kiosk/roster` with `X-Kiosk-Token`
- `POST /api/openroster/kiosk/punch` with `X-Kiosk-Token`
- `POST /api/openroster/kiosk/devices` / `devices/revoke` (manager)

A native iPad/Android client should reuse those routes and store the device
token in the platform keychain/keystore. NFC/camera badge scanning, MDM, and
push are native-only additions, not a reason to fork the server contract.
