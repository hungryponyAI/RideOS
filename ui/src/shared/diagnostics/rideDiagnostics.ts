type RideDiagEvent =
  | "error"
  | "webgl"
  | "mapbox"
  | "summary"
  | "lifecycle";

interface RideDiagEntry {
  at: string;
  event: RideDiagEvent;
  message: string;
  data?: Record<string, unknown>;
}

interface RideDiagSnapshot {
  enabled: boolean;
  entries: RideDiagEntry[];
  counters: Record<string, number>;
  gauges: Record<string, number | string | null>;
}

type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
};

const STORAGE_ENABLE_KEY = "rideos_ride_diag";
export const RIDE_DIAG_STORAGE_KEY = "rideos_last_crash_diag";
const RING_LIMIT = 160;

const entries: RideDiagEntry[] = [];
const counters: Record<string, number> = {};
const gauges: Record<string, number | string | null> = {};

let enabledCache: boolean | null = null;
let summaryTimer: ReturnType<typeof setInterval> | null = null;
let lastSummaryCounters: Record<string, number> = {};

function nowIso(): string {
  return new Date().toISOString();
}

function safeStorageGet(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    // Diagnostics must never crash the ride UI.
  }
}

function truthy(value: string | null): boolean {
  return value != null && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function isRideDiagEnabled(): boolean {
  if (enabledCache !== null) return enabledCache;
  let enabled = false;
  if (typeof window !== "undefined") {
    try {
      enabled = new URLSearchParams(window.location.search).has("rideDiag");
    } catch {
      enabled = false;
    }
  }
  enabledCache = enabled || truthy(safeStorageGet(STORAGE_ENABLE_KEY));
  return enabledCache;
}

export function resetRideDiagForTests(): void {
  entries.length = 0;
  Object.keys(counters).forEach((key) => delete counters[key]);
  Object.keys(gauges).forEach((key) => delete gauges[key]);
  enabledCache = null;
  lastSummaryCounters = {};
  if (summaryTimer) {
    clearInterval(summaryTimer);
    summaryTimer = null;
  }
}

export function incrementRideDiagCounter(name: string, amount = 1): void {
  if (!isRideDiagEnabled()) return;
  counters[name] = (counters[name] ?? 0) + amount;
}

export function setRideDiagGauge(name: string, value: number | string | null): void {
  if (!isRideDiagEnabled()) return;
  gauges[name] = value;
}

export function sampleRideDiagFrame(frameMs: number): void {
  if (!isRideDiagEnabled()) return;
  incrementRideDiagCounter("frames");
  if (frameMs >= 50) incrementRideDiagCounter("long_frames_50ms");
  if (frameMs >= 100) incrementRideDiagCounter("long_frames_100ms");
  gauges.last_frame_ms = Math.round(frameMs);
  gauges.max_frame_ms = Math.max(Number(gauges.max_frame_ms ?? 0), Math.round(frameMs));
}

function memoryStats(): Record<string, unknown> {
  if (typeof performance === "undefined") return {};
  const memory = (performance as PerformanceWithMemory).memory;
  if (!memory) return {};
  return {
    heap_used_mb: memory.usedJSHeapSize != null ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : null,
    heap_total_mb: memory.totalJSHeapSize != null ? Math.round(memory.totalJSHeapSize / 1024 / 1024) : null,
    heap_limit_mb: memory.jsHeapSizeLimit != null ? Math.round(memory.jsHeapSizeLimit / 1024 / 1024) : null,
  };
}

export function recordRideDiag(
  event: RideDiagEvent,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!isRideDiagEnabled()) return;
  const entry: RideDiagEntry = { at: nowIso(), event, message, data };
  entries.push(entry);
  if (entries.length > RING_LIMIT) entries.splice(0, entries.length - RING_LIMIT);
  safeStorageSet(RIDE_DIAG_STORAGE_KEY, JSON.stringify(getRideDiagSnapshot()));
  console.info("[RideOS diag]", event, message, data ?? "");
}

export function getRideDiagSnapshot(): RideDiagSnapshot {
  return {
    enabled: isRideDiagEnabled(),
    entries: [...entries],
    counters: { ...counters },
    gauges: { ...gauges },
  };
}

export function exposeRideDiag(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & {
    __rideosDiag?: {
      dump: () => RideDiagSnapshot;
      record: typeof recordRideDiag;
    };
  };
  w.__rideosDiag = {
    dump: getRideDiagSnapshot,
    record: recordRideDiag,
  };
}

export function startRideDiagSummary(): () => void {
  if (!isRideDiagEnabled()) return () => {};
  exposeRideDiag();
  if (summaryTimer) return () => {};
  recordRideDiag("lifecycle", "ride diagnostics enabled");
  summaryTimer = setInterval(() => {
    const deltas: Record<string, number> = {};
    Object.entries(counters).forEach(([key, value]) => {
      deltas[`${key}_per_10s`] = value - (lastSummaryCounters[key] ?? 0);
    });
    lastSummaryCounters = { ...counters };
    recordRideDiag("summary", "ride diagnostics summary", {
      ...memoryStats(),
      ...deltas,
      counters: { ...counters },
      gauges: { ...gauges },
    });
  }, 10_000);
  return () => {
    if (summaryTimer) {
      clearInterval(summaryTimer);
      summaryTimer = null;
    }
  };
}

export function installRideDiagGlobalHandlers(): () => void {
  if (!isRideDiagEnabled() || typeof window === "undefined") return () => {};
  exposeRideDiag();
  const onError = (event: ErrorEvent) => {
    recordRideDiag("error", "window error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error instanceof Error ? event.error.stack ?? null : null,
    });
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    recordRideDiag("error", "unhandled rejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack ?? null : null,
    });
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
