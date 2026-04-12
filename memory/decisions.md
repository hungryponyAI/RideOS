# Decisions

Technical and architectural decisions made during the project.
Format: `[YYYY-MM-DD] Decision — Reason`

---

[2026-04-12] Focus MVP on KICKR Core + virtual gearing only, no Street View — keeps scope clear and technically clean
[2026-04-12] Use keyboard as Click stand-in for MVP — avoids BLE reverse-engineering block during early development
[2026-04-12] Local engine (Node.js noble OR Python bleak) handles all BLE — browser alone cannot reliably drive FTMS
[2026-04-12] LLM layer is optional and isolated — must never control the trainer directly; control loop stays deterministic
[2026-04-12] React + Tailwind for frontend, WebSockets to local engine — standard pairing, matches cockpit UI requirements
