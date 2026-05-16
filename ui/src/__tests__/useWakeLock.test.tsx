import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWakeLock } from "../shared/hooks/useWakeLock";

class MockWakeLockSentinel extends EventTarget {
  release = vi.fn(async () => {
    this.dispatchEvent(new Event("release"));
  });
}

function setWakeLock(request?: () => Promise<MockWakeLockSentinel>) {
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: request ? { request } : undefined,
  });
}

describe("useWakeLock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setWakeLock(undefined);
  });

  it("requests a screen wake lock when enabled", async () => {
    const sentinel = new MockWakeLockSentinel();
    const request = vi.fn(async () => sentinel);
    setWakeLock(request);

    const { result } = renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(result.current.active).toBe(true));

    expect(request).toHaveBeenCalledWith("screen");
    expect(result.current.warning).toBeNull();
  });

  it("returns a warning when wake lock is unavailable", async () => {
    setWakeLock(undefined);

    const { result } = renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(result.current.warning).toContain("Ruhestand"));

    expect(result.current.active).toBe(false);
  });

  it("releases the wake lock when disabled", async () => {
    const sentinel = new MockWakeLockSentinel();
    setWakeLock(vi.fn(async () => sentinel));

    const { rerender } = renderHook(({ enabled }) => useWakeLock(enabled), {
      initialProps: { enabled: true },
    });
    await vi.waitFor(() => expect(sentinel.release).not.toHaveBeenCalled());

    await act(async () => {
      rerender({ enabled: false });
    });

    expect(sentinel.release).toHaveBeenCalled();
  });
});
