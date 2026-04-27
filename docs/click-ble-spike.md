# Zwift Click — BLE protocol spike (hardware-confirmed)

**Captured:** 2026-04-27  |  **Tool:** nRF Connect on smartphone  |  **Hardware:** user's physical Zwift Click

> Plan 05-02 reads this file. Constants section is copy/pasted verbatim
> into `engine/engine/input/click.py`. Do NOT change values without
> re-running the spike.

## Confirmed values (constants for click.py)

| Constant | Expected (from RESEARCH.md) | Actual (this device) |
|----------|-----------------------------|----------------------|
| Service UUID | `00000001-19ca-4651-86e5-fa29dcdd09d1` (long) OR `FC82` (Jan 2025 firmware) | `00000001-19ca-4651-86e5-fa29dcdd09d1` |
| ASYNC characteristic UUID (NOTIFY) | `00000002-19ca-4651-86e5-fa29dcdd09d1` | `00000002-19ca-4651-86e5-fa29dcdd09d1` ✓ confirmed |
| SYNC_RX characteristic UUID (WRITE) | `00000003-19ca-4651-86e5-fa29dcdd09d1` | `00000003-19ca-4651-86e5-fa29dcdd09d1` (expected, not separately verified) |
| Manufacturer ID (little-endian) | `0x094A` (bytes `4A 09`) | not captured (use expected value) |
| Device type byte (mfr data byte index 2) | `0x09` | not captured (use expected value) |
| Button-event message-type byte | `0x37` | NOT observed — encrypted path active |
| Plus-button field tag (in payload) | `0x08` (proto field 1, key '1') | not decryptable without ECDH |
| Minus-button field tag (in payload) | `0x10` (proto field 2, key '2') | not decryptable without ECDH |
| Pressed value | `0x00` | not decryptable without ECDH |
| Released value | `0x01` | not decryptable without ECDH |
| Unencrypted handshake works on this firmware | LOW confidence — unknown | NO — `b'RideOn'` produced no `0x37` frames |
| Click firmware version | unknown | `1.1.0` |

## Advertising packet

- Local name: "Zwift Click" (visible in nRF Connect scanner)
- Manufacturer data raw hex: not captured
- Service UUIDs in advertisement: not captured (device connects successfully via GATT browse)

## GATT services

- Custom Zwift service UUID: `00000001-19ca-4651-86e5-fa29dcdd09d1`
- All characteristics under it (UUID + properties):
  - `00000002-19ca-4651-86e5-fa29dcdd09d1` — NOTIFY (ASYNC, button events)
  - `00000003-19ca-4651-86e5-fa29dcdd09d1` — WRITE / WRITE NO RESPONSE (SYNC_RX, handshake)

## Plus button captures (raw hex per frame)

Pre-handshake frame observed (encrypted): `23 08 ff ff ff ff 0f`
Button frames not captured — encrypted without ECDH decryption

## Minus button captures (raw hex per frame)

Not captured — encrypted without ECDH decryption

## Press-and-hold capture

Not captured — encrypted without ECDH decryption

## Idle frames (10 s, no buttons)

`23 08 ff ff ff ff 0f` (repeated; likely heartbeat/status frame)

## Decision: unencrypted vs encrypted path

- [ ] Unencrypted (`b'RideOn'` → SYNC_RX) produces `0x37` button frames → Plan 05-02 uses unencrypted path only.
- [x] Unencrypted handshake silent → Plan 05-02 must add ECDH fallback (`uv add cryptography`, see RESEARCH.md ECDH skeleton).

## Notes / surprises

- Firmware 1.1.0 does NOT support the unencrypted path — `b'RideOn'` alone produced no `0x37` button frames
- Pre-handshake/encrypted frames have format `23 08 ff ff ff ff 0f` (likely heartbeat)
- ECDH key exchange (SECP256R1 + HKDF-SHA256 + AES-CCM) is required per RESEARCH.md skeleton
- Service UUID matches the historic long-form UUID — no `FC82` migration observed on this device
- `cryptography` library must be added: `cd engine && uv add cryptography`
