import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useEffect, useCallback } from "react";
import { WSProvider } from "../shared/ws/WSProvider";
import { useWS } from "../shared/ws/useWS";

let mockWs: {
  readyState: number;
  sentMessages: string[];
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  send: (data: string) => void;
  close: () => void;
};

type MockWebSocketConstructor = ReturnType<typeof vi.fn> & {
  OPEN: number;
};

beforeEach(() => {
  mockWs = {
    readyState: 1, // OPEN
    sentMessages: [],
    onopen: null,
    onmessage: null,
    onclose: null,
    send(data: string) { this.sentMessages.push(data); },
    close() { this.onclose?.(); },
  };

  // Must be a constructor for `new WebSocket()` to work
  const MockWS = vi.fn(function (this: typeof mockWs) {
    Object.assign(this, mockWs);
    // Keep shared reference so tests can control it
    mockWs = this as typeof mockWs;
  }) as MockWebSocketConstructor;
  MockWS.OPEN = 1;
  vi.stubGlobal("WebSocket", MockWS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WSProvider", () => {
  it("renders children without crashing", () => {
    const { getByText } = render(
      <WSProvider><div>hello</div></WSProvider>
    );
    expect(getByText("hello")).toBeTruthy();
  });

  it("sends list_routes on open", () => {
    render(<WSProvider><div /></WSProvider>);
    act(() => { mockWs.onopen?.(); });
    expect(mockWs.sentMessages).toContain(JSON.stringify({ type: "list_routes" }));
  });

  it("dispatches messages to subscribers", () => {
    const received: unknown[] = [];
    function Consumer() {
      const { subscribe } = useWS();
      const cb = useCallback((msg: unknown) => received.push(msg), []);
      useEffect(() => subscribe("telemetry", cb), [subscribe, cb]);
      return null;
    }
    render(<WSProvider><Consumer /></WSProvider>);
    act(() => {
      mockWs.onopen?.();
      mockWs.onmessage?.({ data: JSON.stringify({ type: "telemetry", speed_kmh: 30 }) });
    });
    expect(received).toHaveLength(1);
    expect((received[0] as Record<string, unknown>).speed_kmh).toBe(30);
  });

  it("replays last known message to new subscribers", () => {
    const received: unknown[] = [];
    function Consumer() {
      const { subscribe } = useWS();
      const cb = useCallback((msg: unknown) => received.push(msg), []);
      useEffect(() => subscribe("strava_status", cb), [subscribe, cb]);
      return null;
    }
    // Receive a message before the subscriber is mounted
    const { rerender } = render(<WSProvider><div /></WSProvider>);
    act(() => {
      mockWs.onopen?.();
      mockWs.onmessage?.({ data: JSON.stringify({ type: "strava_status", connected: true, athlete_name: "Alice", syncing: false }) });
    });
    // Now mount a subscriber — it should immediately receive the last known state
    rerender(<WSProvider><Consumer /></WSProvider>);
    expect(received).toHaveLength(1);
    expect((received[0] as Record<string, unknown>).connected).toBe(true);
  });

  it("isolates subscriber errors during live dispatch", () => {
    const received: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Consumer() {
      const { subscribe } = useWS();
      const badCb = useCallback(() => { throw new Error("subscriber failed"); }, []);
      const goodCb = useCallback((msg: unknown) => received.push(msg), []);
      useEffect(() => {
        const unsubscribeBad = subscribe("telemetry", badCb);
        const unsubscribeGood = subscribe("telemetry", goodCb);
        return () => {
          unsubscribeBad();
          unsubscribeGood();
        };
      }, [subscribe, badCb, goodCb]);
      return null;
    }

    render(<WSProvider><Consumer /></WSProvider>);
    act(() => {
      mockWs.onopen?.();
      mockWs.onmessage?.({ data: JSON.stringify({ type: "telemetry", speed_kmh: 30 }) });
    });

    expect(received).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith("[RideOS] WS subscriber failed", expect.any(Error));
    spy.mockRestore();
  });

  it("isolates subscriber errors during replay", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Consumer() {
      const { subscribe } = useWS();
      const cb = useCallback(() => { throw new Error("replay subscriber failed"); }, []);
      useEffect(() => subscribe("strava_status", cb), [subscribe, cb]);
      return null;
    }
    const { rerender } = render(<WSProvider><div /></WSProvider>);
    act(() => {
      mockWs.onopen?.();
      mockWs.onmessage?.({ data: JSON.stringify({ type: "strava_status", connected: true }) });
    });

    rerender(<WSProvider><Consumer /></WSProvider>);

    expect(spy).toHaveBeenCalledWith("[RideOS] WS subscriber failed during replay", expect.any(Error));
    spy.mockRestore();
  });

  it("ignores malformed JSON messages", () => {
    const received: unknown[] = [];
    function Consumer() {
      const { subscribe } = useWS();
      const cb = useCallback((msg: unknown) => received.push(msg), []);
      useEffect(() => subscribe("telemetry", cb), [subscribe, cb]);
      return null;
    }
    render(<WSProvider><Consumer /></WSProvider>);
    act(() => {
      mockWs.onopen?.();
      mockWs.onmessage?.({ data: "not json{{" });
    });
    expect(received).toHaveLength(0);
  });

  it("does not dispatch to wrong message type subscriber", () => {
    const received: unknown[] = [];
    function Consumer() {
      const { subscribe } = useWS();
      const cb = useCallback((msg: unknown) => received.push(msg), []);
      useEffect(() => subscribe("route_data", cb), [subscribe, cb]);
      return null;
    }
    render(<WSProvider><Consumer /></WSProvider>);
    act(() => {
      mockWs.onopen?.();
      mockWs.onmessage?.({ data: JSON.stringify({ type: "telemetry", speed_kmh: 30 }) });
    });
    expect(received).toHaveLength(0);
  });
});
