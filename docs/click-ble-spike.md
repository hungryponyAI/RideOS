# Zwift Click — BLE protocol spike (hardware-confirmed)

**Captured:** 2026-04-27  |  **Tool:** nRF Connect on smartphone  |  **Hardware:** user's physical Zwift Click

> Plan 05-02 reads this file. Constants section is copy/pasted verbatim
> into `engine/engine/input/click.py`. Do NOT change values without
> re-running the spike.

## Confirmed values (constants for click.py)

| Constant | Expected (from RESEARCH.md) | Actual (this device) |
|----------|-----------------------------|----------------------|
| Service UUID | `00000001-19ca-4651-86e5-fa29dcdd09d1` (long) OR `FC82` (Jan 2025 firmware) | ??? |
| ASYNC characteristic UUID (NOTIFY) | `00000002-19ca-4651-86e5-fa29dcdd09d1` | ??? |
| SYNC_RX characteristic UUID (WRITE) | `00000003-19ca-4651-86e5-fa29dcdd09d1` | ??? |
| Manufacturer ID (little-endian) | `0x094A` (bytes `4A 09`) | ??? |
| Device type byte (mfr data byte index 2) | `0x09` | ??? |
| Button-event message-type byte | `0x37` | ??? |
| Plus-button field tag (in payload) | `0x08` (proto field 1, key '1') | ??? |
| Minus-button field tag (in payload) | `0x10` (proto field 2, key '2') | ??? |
| Pressed value | `0x00` | ??? |
| Released value | `0x01` | ??? |
| Unencrypted handshake works on this firmware | LOW confidence — unknown | YES / NO (circle one) |
| Click firmware version | unknown | ??? |

## Advertising packet

- Local name: ???
- Manufacturer data raw hex: ???
- Service UUIDs in advertisement: ???

## GATT services

- Custom Zwift service UUID: ???
- All characteristics under it (UUID + properties):
  - ???

## Plus button captures (raw hex per frame)

1. ???
2. ???
3. ???
4. ???
5. ???

## Minus button captures (raw hex per frame)

1. ???
2. ???
3. ???
4. ???
5. ???

## Press-and-hold capture

- Press frame: ???
- Release frame: ???

## Idle frames (10 s, no buttons)

Sample frames captured: ???

## Decision: unencrypted vs encrypted path

- [ ] Unencrypted (`b'RideOn'` → SYNC_RX) produces `0x37` button frames → Plan 05-02 uses unencrypted path only.
- [ ] Unencrypted handshake silent → Plan 05-02 must add ECDH fallback (`uv add cryptography`, see RESEARCH.md ECDH skeleton).

## Notes / surprises

Anything unexpected during the spike (different UUIDs, extra characteristics,
different byte format) goes here. Plan 05-02 must accommodate.
