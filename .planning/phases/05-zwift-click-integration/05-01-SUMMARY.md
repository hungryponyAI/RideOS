---
phase: 05-zwift-click-integration
plan: "01"
subsystem: infra
tags: [ble, zwift-click, nrf-connect, reverse-engineering, ecdh, cryptography]

# Dependency graph
requires:
  - phase: 04-gpx-route-integration
    provides: completed ride engine; Zwift Click adds physical shifter on top
provides:
  - Hardware-confirmed BLE protocol constants for Zwift Click (UUIDs, firmware version, encryption verdict)
  - Decision: unencrypted path fails on firmware 1.1.0 → 05-02 must implement full ECDH handshake
affects:
  - 05-02 (ClickShifter implementation depends entirely on this spike for constants + crypto path)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hardware spike → doc → implementation pipeline: spike doc (05-01) becomes constants block in click.py (05-02)"
    - "Encrypted BLE path: SECP256R1 ECDH + HKDF-SHA256 + AES-CCM required for Zwift Click firmware >= 1.1.0"

key-files:
  created:
    - docs/click-ble-spike.md
  modified: []

key-decisions:
  - "Zwift Click firmware 1.1.0 does NOT support unencrypted b'RideOn' handshake — ECDH is mandatory"
  - "Service UUID is long-form 00000001-19ca-4651-86e5-fa29dcdd09d1 (no FC82 migration on this device)"
  - "cryptography library must be added to engine (uv add cryptography) in 05-02"
  - "Pre-handshake heartbeat frame 23 08 ff ff ff ff 0f — implementation must ignore these"

patterns-established:
  - "BLE spike pattern: stub doc committed, user fills values via nRF Connect, refilled doc committed as authoritative source"

requirements-completed:
  - GEAR-03

# Metrics
duration: ~5 days (hardware capture by user)
completed: 2026-04-27
---

# Phase 05 Plan 01: BLE Hardware Spike Summary

**Hardware-confirmed Zwift Click BLE protocol: long-form service UUID on firmware 1.1.0, unencrypted path fails, ECDH mandatory for 05-02**

## Performance

- **Duration:** ~5 days (manual nRF Connect hardware capture)
- **Started:** 2026-04-22
- **Completed:** 2026-04-27
- **Tasks:** 1 (human-action checkpoint)
- **Files modified:** 1

## Accomplishments

- Service UUID confirmed as long-form `00000001-19ca-4651-86e5-fa29dcdd09d1` — no FC82 migration on this device
- ASYNC (NOTIFY) char `00000002-...` and SYNC_RX (WRITE) char `00000003-...` both confirmed via GATT browse
- Firmware 1.1.0 decisively ruled out unencrypted path: writing `b'RideOn'` produced zero `0x37` button frames
- Pre-handshake heartbeat frame `23 08 ff ff ff ff 0f` captured (idle frame that implementation must ignore)
- ECDH path (SECP256R1 + HKDF-SHA256 + AES-CCM) confirmed as required for 05-02

## Task Commits

1. **Task 1: BLE spike stub** - `f6c4c58` (chore — stub doc created)
2. **Task 1: Hardware capture filled in** - `df20ccc` (feat — confirmed values written)

## Files Created/Modified

- `docs/click-ble-spike.md` — Hardware-confirmed BLE protocol constants; authoritative source for 05-02 constants block

## Confirmed Values (from spike doc)

| Constant | Actual (this device) |
|----------|----------------------|
| Service UUID | `00000001-19ca-4651-86e5-fa29dcdd09d1` |
| ASYNC char UUID (NOTIFY) | `00000002-19ca-4651-86e5-fa29dcdd09d1` |
| SYNC_RX char UUID (WRITE) | `00000003-19ca-4651-86e5-fa29dcdd09d1` |
| Manufacturer ID | not captured (use expected `0x094A`) |
| Device type byte | not captured (use expected `0x09`) |
| Button-event message-type byte | NOT observed (encrypted) |
| Plus-button field tag | not decryptable without ECDH |
| Minus-button field tag | not decryptable without ECDH |
| Pressed value | not decryptable without ECDH |
| Released value | not decryptable without ECDH |
| Unencrypted handshake works | **NO** |
| Firmware version | **1.1.0** |

## Decisions Made

- **ECDH mandatory:** `b'RideOn'` unencrypted handshake silent on firmware 1.1.0. Plan 05-02 must implement full ECDH key exchange (SECP256R1 + HKDF-SHA256 + AES-CCM).
- **No FC82 migration:** Device still uses historic long-form UUID — no short-form handling needed.
- **`cryptography` dependency:** Must be added to engine in 05-02 via `cd engine && uv add cryptography`.
- **Heartbeat frame pattern:** `23 08 ff ff ff ff 0f` is the pre-handshake idle frame; click.py must filter these out.

## Deviations from Plan

None — plan executed exactly as written. Human-action checkpoint completed by user via nRF Connect on iPhone.

## Issues Encountered

- Button payload bytes (plus/minus/pressed/released tags) could not be captured in plaintext because firmware 1.1.0 encrypts all frames after initial connection. The RESEARCH.md ECDH skeleton provides the expected protobuf field layout (`0x08`/`0x10`, `0x00`/`0x01`) which 05-02 will implement and verify empirically after decryption.

## Next Phase Readiness

**05-02 is unblocked.** Implementer can open `docs/click-ble-spike.md` and copy the three UUIDs directly into `engine/engine/input/click.py`. The ECDH path is confirmed required — no conditional unencrypted branch needed.

Key inputs for 05-02:
- Service UUID: `00000001-19ca-4651-86e5-fa29dcdd09d1`
- ASYNC UUID: `00000002-19ca-4651-86e5-fa29dcdd09d1`
- SYNC_RX UUID: `00000003-19ca-4651-86e5-fa29dcdd09d1`
- Crypto: SECP256R1 ECDH + HKDF-SHA256 + AES-CCM (`uv add cryptography`)
- Heartbeat to ignore: `23 08 ff ff ff ff 0f`

---
*Phase: 05-zwift-click-integration*
*Completed: 2026-04-27*
