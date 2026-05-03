# Decisions

Technical and architectural decisions made during the project.
Format: `[YYYY-MM-DD] Decision — Reason`

---

[2026-04-12] Focus MVP on KICKR Core + virtual gearing only, no Street View — keeps scope clear and technically clean
[2026-04-12] Use keyboard as Click stand-in for MVP — avoids BLE reverse-engineering block during early development
[2026-04-12] Local engine (Node.js noble OR Python bleak) handles all BLE — browser alone cannot reliably drive FTMS
[2026-04-12] LLM layer is optional and isolated — must never control the trainer directly; control loop stays deterministic
[2026-04-12] React + Tailwind for frontend, WebSockets to local engine — standard pairing, matches cockpit UI requirements
[2026-04-30] Zwift Click v2 uses plain unencrypted protocol, not ECDH — activation = write RideOn\x02\x03 + \x00\x08\x00 + \x00\x08\x10 to SYNC_RX; buttons arrive as 7-byte bitmask frames (0x23 0x08 header, byte[3] bit-5 = plus, bit-1 = minus); keepalive = write \x00\x08\x10 every 5s. Hardware confirmed working 2026-04-30.
