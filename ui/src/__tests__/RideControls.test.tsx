import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { RideControls } from "../features/ride/components/RideControls";
import { WSProvider } from "../shared/ws/WSProvider";
import { RideScreen } from "../features/ride/RideScreen";

// Mock Mapbox MiniMap to avoid WebGL initialization in tests
vi.mock("../features/ride/components/MiniMap", () => ({
  MiniMap: () => <div data-testid="mini-map-mock" />,
}));

// --- RideControls unit tests ---

describe("RideControls", () => {
  const baseProps = {
    isPaused: false,
    visible: true,
    onTogglePause: vi.fn(),
    onEndRide: vi.fn(),
    onShiftGear: vi.fn(),
    onCycleCamera: vi.fn(),
    viewMode: "chase" as const,
  };

  it("shows centered pause button and end-ride button when riding", () => {
    render(<RideControls {...baseProps} />);
    expect(screen.getByTestId("pause-button")).toBeTruthy();
    expect(screen.getByTestId("end-ride-button")).toBeTruthy();
    expect(screen.getByTestId("gear-down")).toBeTruthy();
    expect(screen.getByTestId("gear-up")).toBeTruthy();
    expect(screen.getByTestId("camera-mode-button")).toBeTruthy();
  });

  it("centered pause button hidden when not visible and not paused", () => {
    render(<RideControls {...baseProps} visible={false} isPaused={false} />);
    expect(screen.queryByTestId("pause-button")).toBeNull();
  });

  it("calls onTogglePause when pause button clicked", () => {
    const onTogglePause = vi.fn();
    render(<RideControls {...baseProps} onTogglePause={onTogglePause} />);
    fireEvent.click(screen.getByTestId("pause-button"));
    expect(onTogglePause).toHaveBeenCalledOnce();
  });

  it("calls onShiftGear with 'down' when gear-down clicked", () => {
    const onShiftGear = vi.fn();
    render(<RideControls {...baseProps} onShiftGear={onShiftGear} />);
    fireEvent.click(screen.getByTestId("gear-down"));
    expect(onShiftGear).toHaveBeenCalledWith("down");
  });

  it("calls onShiftGear with 'up' when gear-up clicked", () => {
    const onShiftGear = vi.fn();
    render(<RideControls {...baseProps} onShiftGear={onShiftGear} />);
    fireEvent.click(screen.getByTestId("gear-up"));
    expect(onShiftGear).toHaveBeenCalledWith("up");
  });

  it("calls onCycleCamera when camera button clicked", () => {
    const onCycleCamera = vi.fn();
    render(<RideControls {...baseProps} onCycleCamera={onCycleCamera} />);
    fireEvent.click(screen.getByTestId("camera-mode-button"));
    expect(onCycleCamera).toHaveBeenCalledOnce();
  });

  it("calls onEndRide when end-ride button clicked", () => {
    const onEndRide = vi.fn();
    render(<RideControls {...baseProps} onEndRide={onEndRide} />);
    fireEvent.click(screen.getByTestId("end-ride-button"));
    expect(onEndRide).toHaveBeenCalledOnce();
  });

  it("shows resume button and end-ride-paused when paused", () => {
    render(<RideControls {...baseProps} isPaused={true} />);
    expect(screen.getByTestId("resume-button")).toBeTruthy();
    expect(screen.getByTestId("end-ride-paused")).toBeTruthy();
    // corner end-ride-button is always present in the strip
    expect(screen.getByTestId("end-ride-button")).toBeTruthy();
    // centered button uses resume-button testid when paused, no separate pause-button
    expect(screen.queryByTestId("pause-button")).toBeNull();
  });

  it("calls onTogglePause when resume button clicked", () => {
    const onTogglePause = vi.fn();
    render(<RideControls {...baseProps} isPaused={true} onTogglePause={onTogglePause} />);
    fireEvent.click(screen.getByTestId("resume-button"));
    expect(onTogglePause).toHaveBeenCalledOnce();
  });

  it("calls onEndRide when end-ride-paused button clicked", () => {
    const onEndRide = vi.fn();
    render(<RideControls {...baseProps} isPaused={true} onEndRide={onEndRide} />);
    fireEvent.click(screen.getByTestId("end-ride-paused"));
    expect(onEndRide).toHaveBeenCalledOnce();
  });

  it("control strip is invisible when not visible and not paused", () => {
    render(<RideControls {...baseProps} visible={false} isPaused={false} />);
    const strip = screen.getByTestId("ride-control-strip");
    expect(strip.className).toContain("opacity-0");
    expect(strip.className).toContain("pointer-events-none");
  });
});

// --- RideScreen integration tests ---

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

function openWs() {
  act(() => { mockWs.onopen?.(); });
}

function simulateTelemetry(partial: Record<string, unknown> = {}) {
  act(() => {
    mockWs.onmessage?.({
      data: JSON.stringify({
        type: "telemetry",
        speed_kmh: 25,
        power_w: 150,
        cadence_rpm: 90,
        gear: 5,
        real_grade_pct: 0,
        effective_grade_pct: 0,
        ride_phase: "route",
        elapsed_s: 60,
        ...partial,
      }),
    });
  });
}

function simulateRouteData(partial: Record<string, unknown> = {}) {
  act(() => {
    mockWs.onmessage?.({
      data: JSON.stringify({
        type: "route_data",
        lats: [47.0, 47.001],
        lons: [11.0, 11.001],
        elevations_m: [500, 510],
        cum_dist_m: [0, 1000],
        grades_pct: [1, 1],
        total_dist_m: 1000,
        ...partial,
      }),
    });
  });
}

describe("RideScreen – ride controls integration", () => {
  it("pause button sends set_paused true", () => {
    render(
      <WSProvider>
        <RideScreen isDark={true} />
      </WSProvider>
    );
    openWs();
    // already paused initially; resume first
    fireEvent.click(screen.getByTestId("resume-button"));
    const msgs = mockWs.sentMessages.map(m => JSON.parse(m));
    const setPaused = msgs.find(m => m.type === "set_paused" && m.paused === false);
    expect(setPaused).toBeTruthy();
  });

  it("gear-up button sends gear_shift up", () => {
    render(
      <WSProvider>
        <RideScreen isDark={true} />
      </WSProvider>
    );
    openWs();
    fireEvent.click(screen.getByTestId("gear-up"));
    const msgs = mockWs.sentMessages.map(m => JSON.parse(m));
    expect(msgs.find(m => m.type === "gear_shift" && m.direction === "up")).toBeTruthy();
  });

  it("gear-down button sends gear_shift down", () => {
    render(
      <WSProvider>
        <RideScreen isDark={true} />
      </WSProvider>
    );
    openWs();
    fireEvent.click(screen.getByTestId("gear-down"));
    const msgs = mockWs.sentMessages.map(m => JSON.parse(m));
    expect(msgs.find(m => m.type === "gear_shift" && m.direction === "down")).toBeTruthy();
  });

  it("end ride button opens confirmation dialog", () => {
    render(
      <WSProvider>
        <RideScreen isDark={true} />
      </WSProvider>
    );
    openWs();
    // paused initially — use end-ride-paused button
    fireEvent.click(screen.getByTestId("end-ride-paused"));
    expect(screen.getByRole("dialog", { name: /bestätigen/i })).toBeTruthy();
  });

  it("confirming end ride sends end_ride message", () => {
    render(
      <WSProvider>
        <RideScreen isDark={true} />
      </WSProvider>
    );
    openWs();
    fireEvent.click(screen.getByTestId("end-ride-paused"));
    fireEvent.click(screen.getByTestId("end-ride-confirm"));
    const msgs = mockWs.sentMessages.map(m => JSON.parse(m));
    expect(msgs.find(m => m.type === "end_ride")).toBeTruthy();
  });

  it("aria-live region announces pause state changes", () => {
    render(
      <WSProvider>
        <RideScreen isDark={true} />
      </WSProvider>
    );
    openWs();
    // Resume the ride (initially paused)
    fireEvent.click(screen.getByTestId("resume-button"));
    const announcer = screen.getByTestId("ride-announcer");
    expect(announcer.textContent).toBe("Fahrt fortgesetzt");
  });

  it("aria-live region announces ride completed", () => {
    render(
      <WSProvider>
        <RideScreen isDark={true} />
      </WSProvider>
    );
    openWs();
    simulateTelemetry({ ride_phase: "done", ended_reason: "completed" });
    const announcer = screen.getByTestId("ride-announcer");
    expect(announcer.textContent).toBe("Fahrt beendet");
  });

  it("allows camera mode switching before the ride is resumed", () => {
    function Harness() {
      const [viewMode, setViewMode] = useState<"chase" | "follow" | "birdseye">("chase");
      return (
        <WSProvider>
          <RideScreen
            isDark={true}
            viewMode={viewMode}
            onCycleCamera={() => setViewMode(m => m === "chase" ? "follow" : m === "follow" ? "birdseye" : "chase")}
          />
        </WSProvider>
      );
    }
    render(
      <Harness />
    );
    openWs();

    expect(screen.getByLabelText("Kameraansicht: Chase")).toBeTruthy();
    fireEvent.click(screen.getByTestId("camera-mode-button"));
    expect(screen.getByLabelText("Kameraansicht: Follow")).toBeTruthy();
  });

  it("shows distance remaining from route data before telemetry arrives", () => {
    render(
      <WSProvider>
        <RideScreen isDark={true} />
      </WSProvider>
    );
    openWs();
    simulateRouteData();

    expect(screen.getByText("Reststrecke")).toBeTruthy();
    expect(screen.getByText("1.0 km")).toBeTruthy();
  });

  it("ignores stale telemetry from a different route at startup", () => {
    render(
      <WSProvider>
        <RideScreen isDark={true} activeRouteId="current-route" activeRideSessionId="current-session" />
      </WSProvider>
    );
    openWs();
    simulateRouteData({ route_id: "current-route", ride_session_id: "current-session" });
    simulateTelemetry({
      route_id: "old-route",
      ride_session_id: "current-session",
      route_loaded: true,
      position_m: 750,
      dist_remaining_m: 250,
    });

    expect(screen.getByText("Reststrecke")).toBeTruthy();
    expect(screen.getByText("1.0 km")).toBeTruthy();
    expect(screen.queryByText("0.3 km")).toBeNull();

    simulateTelemetry({
      route_id: "current-route",
      ride_session_id: "old-session",
      route_loaded: true,
      position_m: 750,
      dist_remaining_m: 250,
    });
    expect(screen.queryByText("0.3 km")).toBeNull();

    simulateTelemetry({
      route_id: "current-route",
      ride_session_id: "current-session",
      route_loaded: true,
      position_m: 100,
      dist_remaining_m: 900,
    });
    expect(screen.getByText("0.9 km")).toBeTruthy();
  });

  it("renders labeled ride status metrics", () => {
    render(
      <WSProvider>
        <RideScreen isDark={true} />
      </WSProvider>
    );
    openWs();
    simulateTelemetry({
      ghost_time_gap_s: 42,
      elapsed_s: 3661,
      dist_remaining_m: 12500,
    });

    expect(screen.getByText("Ghost Gap")).toBeTruthy();
    expect(screen.getByText("Ghost voraus")).toBeTruthy();
    expect(screen.getByText("+42s")).toBeTruthy();
    expect(screen.getByText("Fahrzeit")).toBeTruthy();
    expect(screen.getByText("Aktive Zeit")).toBeTruthy();
    expect(screen.getByText("1:01:01")).toBeTruthy();
    expect(screen.getByText("Reststrecke")).toBeTruthy();
    expect(screen.getByText("Bis Ziel")).toBeTruthy();
    expect(screen.getByText("12.5 km")).toBeTruthy();
  });

  it("renders Steigung from the real route grade at the rider position", () => {
    render(
      <WSProvider>
        <RideScreen isDark={true} />
      </WSProvider>
    );
    openWs();
    simulateTelemetry({
      real_grade_pct: 4.2,
      effective_grade_pct: 9.8,
    });

    expect(screen.getByText("Steigung")).toBeTruthy();
    expect(screen.getByText("+4,2%")).toBeTruthy();
    expect(screen.queryByText("+9,8%")).toBeNull();
  });

  it("shows trainer not connected when websocket is connected but KICKR status is absent", () => {
    render(
      <WSProvider>
        <RideScreen isDark={true} />
      </WSProvider>
    );
    openWs();

    expect(screen.getByText("Trainer nicht verbunden")).toBeTruthy();
    expect(screen.queryByText("Trainer verbunden")).toBeNull();
  });

  it("hides the mouse cursor after idle and restores it on movement", () => {
    render(
      <WSProvider>
        <RideScreen isDark={true} />
      </WSProvider>
    );
    openWs();
    const rideScreen = screen.getByTestId("ride-screen");

    expect(rideScreen.className).not.toContain("cursor-none");
    act(() => { vi.advanceTimersByTime(2000); });
    expect(rideScreen.className).toContain("cursor-none");

    fireEvent.mouseMove(window);
    expect(rideScreen.className).not.toContain("cursor-none");
  });
});
