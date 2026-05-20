import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RIDE_DIAG_STORAGE_KEY,
  getRideDiagSnapshot,
  incrementRideDiagCounter,
  installRideDiagGlobalHandlers,
  isRideDiagEnabled,
  recordRideDiag,
  resetRideDiagForTests,
  startRideDiagSummary,
} from "../shared/diagnostics/rideDiagnostics";

describe("rideDiagnostics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetRideDiagForTests();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    resetRideDiagForTests();
  });

  it("enables diagnostics from the rideDiag query param", () => {
    window.history.replaceState(null, "", "/?rideDiag=1");
    expect(isRideDiagEnabled()).toBe(true);
  });

  it("enables diagnostics from localStorage", () => {
    localStorage.setItem("rideos_ride_diag", "1");
    expect(isRideDiagEnabled()).toBe(true);
  });

  it("persists crash diagnostic entries", () => {
    window.history.replaceState(null, "", "/?rideDiag=1");
    recordRideDiag("error", "boom", { detail: "test" });
    const stored = JSON.parse(localStorage.getItem(RIDE_DIAG_STORAGE_KEY) ?? "{}");
    expect(stored.entries[0]).toMatchObject({ event: "error", message: "boom" });
  });

  it("records counter deltas in periodic summaries", () => {
    window.history.replaceState(null, "", "/?rideDiag=1");
    startRideDiagSummary();
    incrementRideDiagCounter("frames", 3);
    vi.advanceTimersByTime(10_000);
    const snapshot = getRideDiagSnapshot();
    expect(snapshot.entries.some((entry) => entry.event === "summary")).toBe(true);
  });

  it("captures global errors", () => {
    window.history.replaceState(null, "", "/?rideDiag=1");
    const uninstall = installRideDiagGlobalHandlers();
    window.dispatchEvent(new ErrorEvent("error", { message: "kaputt" }));
    uninstall();
    expect(getRideDiagSnapshot().entries.some((entry) => entry.message === "window error")).toBe(true);
  });
});
