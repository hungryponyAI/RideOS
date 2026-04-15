---
phase: 02-ftms-control-loop-virtual-gearing
plan: "02"
subsystem: virtual-gearing + keyboard-input
tags: [gears, keyboard, input, debounce, tdd, pure-python]
dependency_graph:
  requires: [02-01]
  provides: [GearEngine, KeyboardShifter]
  affects: [02-03-controller, 02-04-main-wiring]
tech_stack:
  added: []
  patterns: [injectable-clock, injectable-fd, escape-sequence-state-machine, tdd-red-green]
key_files:
  created:
    - engine/engine/gears/engine.py
    - engine/tests/gears/test_engine.py
    - engine/engine/input/keyboard.py
    - engine/tests/input/test_keyboard.py
  modified: []
decisions:
  - "_last_shift_t initialised to float('-inf') so the first keypress at t=0.0 is never debounced (0.0 - (-inf) = inf > 0.10)"
  - "Debounce window: 100ms per RESEARCH.md Pitfall 3 (keyboard auto-repeat threshold)"
  - "KeyboardShifter._on_readable exposed as public-ish method (leading underscore convention) to enable direct test invocation without a real event loop"
  - "test_stop_clears_loop_reader stores bound method once (cb = sh._on_readable) — Python bound methods are not singletons; `is` comparison across two lookups always fails"
  - "effective_grade = real_grade / factor amplifies low-gear grades: gear 1 (factor 0.5) doubles the felt gradient"
metrics:
  duration: "~2m30s"
  completed: "2026-04-15"
  tasks: 2
  files: 4
---

# Phase 02 Plan 02: GearEngine + KeyboardShifter Summary

GearEngine dataclass with pinned 10-gear geometric factor table (G1=0.500, G10=1.800) and KeyboardShifter with injectable-fd/clock/loop for hardware-free testing.

---

## What Was Built

### GearEngine (`engine/engine/gears/engine.py`)

Pure dataclass implementing the project's core value proposition. Public API:

| Member | Type | Description |
|--------|------|-------------|
| `current_gear` | `int` | Current gear 1..10, default 5 |
| `factors` | `Tuple[float, ...]` | 10-value table, injectable for tests |
| `.factor` | `@property float` | `factors[current_gear - 1]` |
| `.shift_up()` | `-> int` | Clamps at 10, returns new gear |
| `.shift_down()` | `-> int` | Clamps at 1, returns new gear |
| `.effective_grade(real_grade_percent)` | `-> float` | `real_grade / factor` |

Locked factor table (geometric progression, 3 dp):

```
G1=0.500  G2=0.578  G3=0.668  G4=0.772  G5=0.892
G6=1.031  G7=1.192  G8=1.378  G9=1.593  G10=1.800
```

Formula: `effective_grade = real_grade / gear_factor` (Focus Project.md). Factor < 1 (low gears) amplifies gradient; factor > 1 (high gears) dampens it. Verified in `test_low_gear_amplifies_grade` (gear 1: 6.0% → 12.0% effective).

### KeyboardShifter (`engine/engine/input/keyboard.py`)

Injectable constructor args for hardware-free tests:

```python
KeyboardShifter(
    gear_engine: GearEngine,
    *,
    loop: Optional[asyncio.AbstractEventLoop] = None,
    fd: Optional[int] = None,                          # default: sys.stdin.fileno()
    clock: Callable[[], float] = time.monotonic,       # injectable for debounce tests
    read_byte: Optional[Callable[[int], bytes]] = None, # injectable for byte scripting
)
```

Key implementation decisions:

- `_DEBOUNCE_S = 0.10` (100ms, Pitfall 3)
- `_last_shift_t = float("-inf")` — ensures first keypress at t=0 always accepted
- ESC-sequence state machine (states 0/1/2): ESC → `[` → A/B; any non-continuation byte resets to 0 without dispatching
- `start()` calls `tty.setcbreak(fd)` then `loop.add_reader(fd, self._on_readable)`; `termios.error` silently caught when fd is not a real tty (test path)
- `stop()` calls `loop.remove_reader(fd)` then `termios.tcsetattr(fd, TCSADRAIN, prev_settings)` if settings were captured

Key dispatch table:

| Input | Action |
|-------|--------|
| `k` (0x6B) | `shift_up()` |
| `j` (0x6A) | `shift_down()` |
| ESC `[` A (0x1B 0x5B 0x41) | `shift_up()` |
| ESC `[` B (0x1B 0x5B 0x42) | `shift_down()` |
| Any other byte | silently ignored |

---

## Test Coverage

| Module | Tests | Count |
|--------|-------|-------|
| `test_engine.py` | formula, all-10-gears parametrised, shift bounds (x2), normal middle, low-gear amplifies, high-gear dampens, negative grade, custom factors | 20 |
| `test_keyboard.py` | k shifts up, j shifts down, arrow up, arrow down, debounce rejects, debounce allows, unknown byte ignored, ESC reset, stop clears loop | 9 |
| **Total new** | | **29** |
| **Full suite** | Phase 1 (17) + Plan 02-01 (14) + Plan 02-02 (29) | **61** |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Debounce initial value blocked first keypress**

- **Found during:** Task 2 (GREEN phase, first test failure)
- **Issue:** Plan specified `_last_shift_t: float = 0.0`. When tests injected `clock` returning `0.0`, the condition `now - last = 0.0 < 0.10 = True` rejected the first shift.
- **Fix:** Changed init to `float("-inf")` so `inf - (-inf) = inf > 0.10` always passes on first press.
- **Files modified:** `engine/engine/input/keyboard.py`
- **Commit:** fdd8c62

**2. [Rule 1 - Bug] test_stop_clears_loop_reader used `is` on bound methods**

- **Found during:** Task 2 (GREEN phase, last test failure)
- **Issue:** Plan test used `assert sh._loop.reader_cb is sh._on_readable`. Python bound methods are not singletons — two attribute lookups return two distinct objects.
- **Fix:** Rewrote assertion to check `reader_cb is not None` before stop, `None` after stop (the meaningful invariant).
- **Files modified:** `engine/tests/input/test_keyboard.py`
- **Commit:** fdd8c62

---

## Self-Check: PASSED
