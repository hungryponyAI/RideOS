import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import { WSProvider } from "../shared/ws/WSProvider";
import { RideStartRitual } from "../features/ride-start/RideStartRitual";
import type { RideConfig } from "../features/pre-ride/RideOptions";

const DEFAULT_CONFIG: RideConfig = {
  ghost: false,
  reverse: false,
  cutoutStartM: null,
  cutoutEndM: null,
  laps: 1,
  warmup: false,
  cooldown: false,
  ergMode: false,
  physicsMode: true,
};

let mockWs: {
  readyState: number;
  sentMessages: string[];
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  send: (data: string) => void;
  close: () => void;
};

type MockWebSocketConstructor = ReturnType<typeof vi.fn> & { OPEN: number };

beforeEach(() => {
  vi.useFakeTimers();
  mockWs = {
    readyState: 1,
    sentMessages: [],
    onopen: null,
    onmessage: null,
    onclose: null,
    send(data: string) { this.sentMessages.push(data); },
    close() { this.onclose?.(); },
  };
  const MockWS = vi.fn(function (this: typeof mockWs) {
    Object.assign(this, mockWs);
    mockWs = this as typeof mockWs;
  }) as MockWebSocketConstructor;
  MockWS.OPEN = 1;
  vi.stubGlobal("WebSocket", MockWS);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return <WSProvider>{children}</WSProvider>;
}

function openWs() {
  act(() => { mockWs.onopen?.(); });
}

function simulateMessage(msg: object) {
  act(() => { mockWs.onmessage?.({ data: JSON.stringify(msg) }); });
}

describe("RideStartRitual", () => {
  it("renders preparing state on mount", () => {
    const onReady = vi.fn();
    const onCancel = vi.fn();
    render(
      <Wrapper>
        <RideStartRitual
          routeId="r1"
          rideSessionId="s1"
          routeName="Testroute"
          config={DEFAULT_CONFIG}
          viewMode="chase"
          onCycleCamera={vi.fn()}
          onReady={onReady}
          onCancel={onCancel}
        />
      </Wrapper>
    );
    openWs();
    expect(screen.getByTestId("ride-start-ritual")).toBeTruthy();
    expect(screen.getByText("Testroute")).toBeTruthy();
    expect(screen.getByTestId("cancel-preparing")).toBeTruthy();
  });

  it("sends start_ride and set_paused on mount", () => {
    render(
      <Wrapper>
        <RideStartRitual
          routeId="r42"
          rideSessionId="s42"
          routeName="Testroute"
          config={{ ...DEFAULT_CONFIG, ghost: true }}
          viewMode="chase"
          onCycleCamera={vi.fn()}
          onReady={vi.fn()}
          onCancel={vi.fn()}
        />
      </Wrapper>
    );
    openWs();
    const startMsg = mockWs.sentMessages.find(m => JSON.parse(m).type === "start_ride");
    expect(startMsg).toBeTruthy();
    expect(JSON.parse(startMsg!).route_id).toBe("r42");
    expect(JSON.parse(startMsg!).ride_session_id).toBe("s42");
    expect(JSON.parse(startMsg!).ghost).toBe(true);
    expect(JSON.parse(startMsg!).paused).toBe(true);
    const pausedMsg = mockWs.sentMessages.find(m => {
      const p = JSON.parse(m);
      return p.type === "set_paused" && p.paused === true;
    });
    expect(pausedMsg).toBeTruthy();
  });

  it("shows countdown after route_data received", () => {
    render(
      <Wrapper>
        <RideStartRitual
          routeId="r1"
          rideSessionId="s1"
          routeName="Testroute"
          config={DEFAULT_CONFIG}
          viewMode="chase"
          onCycleCamera={vi.fn()}
          onReady={vi.fn()}
          onCancel={vi.fn()}
        />
      </Wrapper>
    );
    openWs();
    simulateMessage({
      type: "route_data",
      route_id: "r1",
      ride_session_id: "s1",
      lats: [0], lons: [0], elevations_m: [0], cum_dist_m: [0], grades_pct: [0], total_dist_m: 0,
    });
    expect(screen.getByTestId("countdown-number")).toBeTruthy();
    expect(screen.getByTestId("cancel-countdown")).toBeTruthy();
  });


  it("ignores stale route_data from another route", () => {
    render(
      <Wrapper>
        <RideStartRitual
          routeId="r1"
          rideSessionId="s1"
          routeName="Testroute"
          config={DEFAULT_CONFIG}
          viewMode="chase"
          onCycleCamera={vi.fn()}
          onReady={vi.fn()}
          onCancel={vi.fn()}
        />
      </Wrapper>
    );
    openWs();
    simulateMessage({
      type: "route_data",
      route_id: "old-route",
      ride_session_id: "s1",
      lats: [0], lons: [0], elevations_m: [0], cum_dist_m: [0], grades_pct: [0], total_dist_m: 0,
    });
    expect(screen.queryByTestId("countdown-number")).toBeNull();

    simulateMessage({
      type: "route_data",
      route_id: "r1",
      ride_session_id: "old-session",
      lats: [0], lons: [0], elevations_m: [0], cum_dist_m: [0], grades_pct: [0], total_dist_m: 0,
    });
    expect(screen.queryByTestId("countdown-number")).toBeNull();

    simulateMessage({
      type: "route_data",
      route_id: "r1",
      ride_session_id: "s1",
      lats: [0], lons: [0], elevations_m: [0], cum_dist_m: [0], grades_pct: [0], total_dist_m: 0,
    });
    expect(screen.getByTestId("countdown-number")).toBeTruthy();
  });

  it("countdown opens the ride screen without resuming the backend", () => {
    const onReady = vi.fn();
    render(
      <Wrapper>
        <RideStartRitual
          routeId="r1"
          rideSessionId="s1"
          routeName="Testroute"
          config={DEFAULT_CONFIG}
          viewMode="chase"
          onCycleCamera={vi.fn()}
          onReady={onReady}
          onCancel={vi.fn()}
        />
      </Wrapper>
    );
    openWs();
    simulateMessage({
      type: "route_data",
      route_id: "r1",
      ride_session_id: "s1",
      lats: [0], lons: [0], elevations_m: [0], cum_dist_m: [0], grades_pct: [0], total_dist_m: 0,
    });
    // Advance 3 seconds
    act(() => { vi.advanceTimersByTime(3000); });
    const resumeMsg = mockWs.sentMessages.find(m => {
      const p = JSON.parse(m);
      return p.type === "set_paused" && p.paused === false;
    });
    expect(resumeMsg).toBeUndefined();
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("cancel during preparing sends end_ride and calls onCancel", () => {
    const onCancel = vi.fn();
    render(
      <Wrapper>
        <RideStartRitual
          routeId="r1"
          rideSessionId="s1"
          routeName="Testroute"
          config={DEFAULT_CONFIG}
          viewMode="chase"
          onCycleCamera={vi.fn()}
          onReady={vi.fn()}
          onCancel={onCancel}
        />
      </Wrapper>
    );
    openWs();
    fireEvent.click(screen.getByTestId("cancel-preparing"));
    const endMsg = mockWs.sentMessages.find(m => JSON.parse(m).type === "end_ride");
    expect(endMsg).toBeTruthy();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("cancel during countdown sends end_ride and calls onCancel", () => {
    const onCancel = vi.fn();
    render(
      <Wrapper>
        <RideStartRitual
          routeId="r1"
          rideSessionId="s1"
          routeName="Testroute"
          config={DEFAULT_CONFIG}
          viewMode="chase"
          onCycleCamera={vi.fn()}
          onReady={vi.fn()}
          onCancel={onCancel}
        />
      </Wrapper>
    );
    openWs();
    simulateMessage({
      type: "route_data",
      route_id: "r1",
      ride_session_id: "s1",
      lats: [0], lons: [0], elevations_m: [0], cum_dist_m: [0], grades_pct: [0], total_dist_m: 0,
    });
    fireEvent.click(screen.getByTestId("cancel-countdown"));
    const endMsg = mockWs.sentMessages.find(m => JSON.parse(m).type === "end_ride");
    expect(endMsg).toBeTruthy();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows error state on route_error", () => {
    render(
      <Wrapper>
        <RideStartRitual
          routeId="r1"
          rideSessionId="s1"
          routeName="Testroute"
          config={DEFAULT_CONFIG}
          viewMode="chase"
          onCycleCamera={vi.fn()}
          onReady={vi.fn()}
          onCancel={vi.fn()}
        />
      </Wrapper>
    );
    openWs();
    simulateMessage({ type: "route_error", message: "GPX parse failed" });
    expect(screen.getByText("Strecke konnte nicht geladen werden")).toBeTruthy();
    expect(screen.getByText("GPX parse failed")).toBeTruthy();
  });
});
