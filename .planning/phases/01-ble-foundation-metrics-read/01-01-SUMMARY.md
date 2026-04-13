---
phase: 01-ble-foundation-metrics-read
plan: 01
subsystem: infra
tags: [python, uv, bleak, pytest, pytest-asyncio, ftms, ble, macos]

requires:
  - phase: 00-project-init
    provides: "approved roadmap, Phase 1 research + validation docs, v1 requirements"
provides:
  - "engine/ uv project scaffolded (rideos-engine package)"
  - "bleak 3.0.1 + pytest + pytest-asyncio installed, lockfile committed"
  - "Flat engine/engine/ import layout (overriding uv init src-layout default)"
  - "pytest testpaths=['tests'] with asyncio_mode=auto"
  - "5 IBD byte fixtures (speed_only, speed_cadence_power, no_speed, power_negative, cadence_only_scaling)"
  - "5 xfail parser stubs gating plan 02 RED→GREEN"
  - "scan.py standalone macOS CoreBluetooth permission diagnostic"
affects: [01-02, 01-03, 01-04, 02-*, 03-*]

tech-stack:
  added: [bleak==3.0.1, pytest>=8, pytest-asyncio>=0.23, uv, hatchling]
  patterns:
    - "Flat package layout: engine/engine/ (not src/engine/) — plan directive"
    - "Hand-rolled FTMS parser (pycycling read as reference only per RESEARCH.md)"
    - "xfail-strict parser stubs drive RED→GREEN promotion in later waves"
    - "Lazy imports inside tests so collection works before target module exists"

key-files:
  created:
    - "engine/pyproject.toml"
    - "engine/.python-version"
    - "engine/README.md"
    - "engine/engine/__init__.py"
    - "engine/tests/__init__.py"
    - "engine/tests/conftest.py"
    - "engine/tests/ftms/__init__.py"
    - "engine/tests/ftms/test_parsers.py"
    - "engine/scan.py"
    - "engine/uv.lock"
  modified:
    - ".gitignore"

key-decisions:
  - "Pin bleak >=3.0.1,<4.0: bleak 3 drops __version__ attr; verified via importlib.metadata"
  - "Override uv init default src-layout with flat engine/engine/ package per plan directive"
  - "Extend .gitignore to exclude .venv/, __pycache__/, .pytest_cache/, *.egg-info/ before first engine commit"
  - "scan.py exit codes: 0 = devices found, 1 = empty scan (likely permission), 2 = BleakError"

patterns-established:
  - "Atomic commit per task with scope prefix {phase}-{plan} (e.g., chore(01-01): ...)"
  - "Fixtures colocate flag-bit documentation next to raw byte construction (struct.pack explicit)"
  - "xfail(strict=True, reason=...) on parser stubs — turning green requires matching parser behavior exactly"

requirements-completed: [BLE-01, BLE-02]

duration: 4m
completed: 2026-04-13
---

# Phase 01 Plan 01: BLE Foundation Scaffold Summary

**uv-managed Python engine/ project with bleak 3.0.1, 5 xfail-gated FTMS parser stubs, reusable IBD byte fixtures, and a macOS CoreBluetooth permission diagnostic (scan.py) ready before any hardware integration.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-13T04:33:48Z
- **Completed:** 2026-04-13T04:37:26Z
- **Tasks:** 3
- **Files modified:** 11 (10 created + .gitignore extended)

## Accomplishments

- `engine/` uv project: bleak 3.0.1, pytest 9.0.3, pytest-asyncio 1.3.0 installed and importable
- 5 precisely-documented IBD byte fixtures covering every FTMS parsing corner case for Phase 1 (bit-0 inversion, /100 speed scale, /2 cadence scale, signed int16 power, absent-speed offset handling)
- 5 xfail parser stubs with `strict=True` so plan 02's parser implementation promotes them to green automatically (RED→GREEN contract per VALIDATION.md)
- `scan.py` standalone diagnostic: detects KICKR by name prefix + FTMS (0x1826) by service UUID, prints explicit macOS Privacy settings path when permission is silently denied
- Pytest configured with `testpaths=["tests"]` and `asyncio_mode="auto"` — downstream plans can add asyncio tests without decorators

## Task Commits

Each task committed atomically:

1. **Task 1: Scaffold engine/ uv project with bleak + pytest-asyncio** — `899ff9d` (chore)
2. **Task 2: IBD byte fixtures and xfail parser test stubs** — `c219f97` (test)
3. **Task 3: scan.py macOS BLE permission diagnostic** — `ad78fdf` (feat)

**Plan metadata commit:** created after this summary.

## Files Created/Modified

- `engine/pyproject.toml` — project metadata, bleak + dev extras, hatchling build, pytest config
- `engine/.python-version` — pins Python 3.12
- `engine/README.md` — uv sync, scan.py, pytest instructions
- `engine/engine/__init__.py` — empty package marker (flat layout)
- `engine/uv.lock` — pinned dependency tree (bleak 3.0.1 + pyobjc frameworks)
- `engine/tests/__init__.py`, `engine/tests/ftms/__init__.py` — test package markers
- `engine/tests/conftest.py` — 5 IBD byte fixtures with documented flag/field encoding
- `engine/tests/ftms/test_parsers.py` — 5 xfail(strict=True) parser tests
- `engine/scan.py` — standalone CoreBluetooth diagnostic (not part of engine package)
- `.gitignore` — extended with Python/uv artifacts (`.venv/`, `__pycache__/`, `.pytest_cache/`, `*.egg-info/`, `*.pyc`)

## Decisions Made

- **bleak 3.x version detection via `importlib.metadata`, not `bleak.__version__`.** Plan's sample verification used `bleak.__version__` which bleak 3 removed. Used `importlib.metadata.version('bleak')` instead. Same assertion, different import path.
- **Flat package layout overrides uv init default.** `uv init --package` scaffolds `src/rideos_engine/` by default; the plan mandated `engine/engine/` (flat). Removed the generated `src/` tree before editing pyproject.toml so `[tool.hatch.build.targets.wheel] packages = ["engine"]` resolves correctly.
- **Python 3.12.12 provisioned automatically.** Host had no 3.12 installed; uv downloaded `cpython-3.12.12-macos-aarch64-none` during `uv sync` — recorded here so later environments can reproduce.
- **`.gitignore` extension done proactively** before first engine commit to prevent `.venv/` (60+ MB) from entering history.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] bleak 3.x removed `__version__` attribute — verification snippet rewritten**
- **Found during:** Task 1 (uv sync verification)
- **Issue:** Plan's exact verification `uv run python -c "import bleak; print(bleak.__version__)"` fails with `AttributeError: module 'bleak' has no attribute '__version__'` on bleak 3.0.1. This is a known bleak 3 API change.
- **Fix:** Used `importlib.metadata.version("bleak")` which is the canonical PEP 566 way to read installed package version and works regardless of whether the package exposes `__version__`. Assertion identical (`startswith('3.')`).
- **Files modified:** none (verification-only change; plan file not edited)
- **Verification:** `uv run python -c "import importlib.metadata as md; v=md.version('bleak'); assert v.startswith('3.'), v; print(v)"` prints `3.0.1` and exits 0. Plain `import bleak` also verified to succeed.
- **Committed in:** n/a (no code change)

**2. [Rule 2 - Missing Critical] Extended .gitignore before committing engine/**
- **Found during:** Task 1 (before `git add`)
- **Issue:** Repo `.gitignore` only listed `.DS_Store` and an Obsidian workspace file. Committing `engine/` as-is would have staged `.venv/` (hundreds of MB of wheels + pyobjc binaries) on subsequent runs if any test leaves `__pycache__/` or `.pytest_cache/` behind.
- **Fix:** Appended a `# Python / uv` block covering `.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `*.egg-info/`.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` after `uv sync` showed `engine/.venv/` was untracked but filtered; only `engine/uv.lock`, `engine/pyproject.toml`, etc. entered the Task 1 commit.
- **Committed in:** `899ff9d` (bundled with Task 1)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both deviations necessary for correctness and repo hygiene. No scope creep. Plan's intent (verify bleak 3.x installed; clean engine commit) preserved exactly.

## Issues Encountered

- **`uv init --package` generated `src/rideos_engine/` layout.** Plan mandates `engine/engine/`. Resolved by removing the generated `src/` tree and creating `engine/engine/` manually before replacing `pyproject.toml`. Documented as Decisions Made (above).
- **pytest exits 1 when all tests xfail.** Expected behavior for pytest 9 — no tests *passed*, only *xfailed*. Does not indicate a problem; the plan's acceptance criterion checks for the string `5 xfailed` in the output, which is present. Later plans will turn these green and exit code will become 0.

## User Setup Required

None for this plan. A one-time macOS Bluetooth permission grant is required before running `scan.py` against real hardware (documented in `engine/README.md` and enforced by `scan.py`'s exit-code-1 path with an explicit hint). This is a plan 01-02 / 01-03 concern, not this plan.

## Next Phase Readiness

**Ready for plan 01-02 (parser implementation):**
- Fixtures and xfail stubs are the direct input to plan 02: create `engine/engine/ftms/parsers.py` with `parse_indoor_bike_data(data: bytes) -> Result` (shape implied by tests: `.speed_kmh: float | None`, `.cadence_rpm: float | None`, `.power_watts: int | None`).
- Plan 02 must place the module at `engine/engine/ftms/parsers.py` for the `from engine.ftms.parsers import parse_indoor_bike_data` import to resolve.
- Tests expect a result with attribute access (dataclass or namedtuple), not a dict.

**Ready for plan 01-03 (BLE connect + IBD notification):**
- `scan.py` is the pre-flight. Run it once, fix macOS Bluetooth permission if the empty-scan branch fires, then real connect code in plan 03 can assume permission is granted.
- `scan.py` already shows how to use `BleakScanner.discover(return_adv=True)` to capture service UUIDs — reusable pattern for plan 03's connect-by-name-or-FTMS-UUID flow.

**No blockers.**

## Self-Check: PASSED

Verified post-write:
- engine/pyproject.toml: FOUND
- engine/.python-version: FOUND
- engine/README.md: FOUND
- engine/engine/__init__.py: FOUND
- engine/tests/__init__.py: FOUND
- engine/tests/conftest.py: FOUND
- engine/tests/ftms/__init__.py: FOUND
- engine/tests/ftms/test_parsers.py: FOUND
- engine/scan.py: FOUND
- engine/uv.lock: FOUND
- Commit 899ff9d: FOUND
- Commit c219f97: FOUND
- Commit ad78fdf: FOUND

---
*Phase: 01-ble-foundation-metrics-read*
*Plan: 01*
*Completed: 2026-04-13*
