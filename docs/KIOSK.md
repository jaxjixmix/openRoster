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
editor. Without a PIN the employee card still appears, but clocking in is
blocked with an instruction to ask a manager.

The server stores a salted, peppered, iterated hash (`v2$<rounds>$<salt>$<digest>`,
HMAC-SHA-256, 2 000 rounds) and never the PIN. The pepper is kept out of the
database: set `OPENROSTER_PIN_PEPPER` on the server, or let the server generate
a file called `openroster_pin_pepper` next to `pb_data` on first use. Back that
file up with the database but never inside it — a leaked database on its own
cannot be brute-forced without it. Rows written before this change were a bare
`sha256(pin)`; they keep working and are upgraded to the current format the next
time the right PIN is entered.

PINs are also policy-checked when set: repeated digits (`0000`), runs (`1234`),
short patterns (`121212`) and the employee's own phone number or dates on file
are refused, and a PIN another employee in the company already uses is refused.

## Lockouts

Wrong PINs are counted server-side per employee and per tablet, and a manager
can always clear one.

- 3 wrong PINs in 15 minutes lock that employee out for 10 seconds, then 30
  seconds, 5 minutes, 15 minutes and 30 minutes as attempts continue.
- 20 wrong PINs in 15 minutes lock the tablet itself; a manager unlocks it in
  **Settings → Kiosk mode → Unlock**.
- Repeated pairing codes from one client address are capped (10 per 10 minutes).
- A correct PIN clears that employee's count.
- Every attempt is recorded in `kiosk_auth_events` (employee, tablet, a hash of
  the client address, time) for manager review. The lockout is derived from that
  trail, so nothing goes stale.

A locked kiosk answers `429` with `retry_after` in seconds; the tablet shows the
countdown and disables the keypad until it expires. Manager touch points:

- `POST /api/openroster/kiosk/reset-lock` with `{ employee }` or `{ device }`.
- `POST /api/openroster/kiosk/employee-pin` — setting a PIN also clears that
  employee's lockout.

## Tablet setup

- Open `/kiosk` in Safari or Chrome and **Add to Home Screen**; the kiosk
  manifest starts directly at `/kiosk` in standalone landscape.
- iPad: enable **Guided Access** and disable sleep for the kiosk session.
- Android: use a managed kiosk browser or screen pinning.
- The page requests a screen wake lock; fullscreen is available in the header.

## Offline behavior

If the tablet loses the network, the employee still types their PIN and the
punch queues in local storage; the server verifies the PIN when the queue syncs,
so an offline tablet cannot record punches nobody authenticated. Queued punches
carry the time the employee tapped, are marked `PIN verified on sync` on the
punch, and are accepted up to 12 hours later. A queued punch the server refuses
(wrong PIN) is dropped and counted on the tablet banner so a manager can be
asked to look; one blocked by a lockout is retried. The queue holds at most 50
punches per tablet and its PINs are dropped as soon as each punch syncs.

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
- `POST /api/openroster/kiosk/employee-pin` (manager, set or clear one PIN)
- `POST /api/openroster/kiosk/reset-lock` (manager, clear a lockout)

A locked kiosk answers `429` with a `retry_after` field in `data`; a wrong PIN
answers `401` with `data.attempts_left`.

A native iPad/Android client should reuse those routes and store the device
token in the platform keychain/keystore. NFC/camera badge scanning, MDM, and
push are native-only additions, not a reason to fork the server contract.
