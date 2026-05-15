import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  it("shows pause and end-ride buttons when riding", () => {
    render(<RideControls {...baseProps} />);
    expect(screen.getByTestId("pause-button")).toBeTruthy();
    expect(screen.getByTestId("end-ride-button")).toBeTruthy();
    expect(screen.getByTestId("gear-down")).toBeTruthy();
    expect(screen.getByTestId("gear-up")).toBeTruthy();
    expect(screen.getByTestId("camera-mode-button")).toBeTruthy();
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
});
