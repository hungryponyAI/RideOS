import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { RideSummaryScreen } from "../features/summary/RideSummaryScreen";
import { WSProvider } from "../shared/ws/WSProvider";

let mockWs: {
  readyState: number;
  sentMessages: string[];
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  send: (data: string) => void;
  close: () => void;
};

type MockWSConstructor = ReturnType<typeof vi.fn> & { OPEN: number };

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
  }) as MockWSConstructor;
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

function simulateSummaryMsg(payload: Record<string, unknown>) {
  act(() => {
    mockWs.onmessage?.({ data: JSON.stringify({ type: "ride_summary", ...payload }) });
  });
}

function renderSummary(props: Partial<React.ComponentProps<typeof RideSummaryScreen>> = {}) {
  const defaults = {
    summaryData: null,
    onReturnHome: vi.fn(),
  };
  return render(
    <WSProvider>
      <RideSummaryScreen {...defaults} {...props} />
    </WSProvider>
  );
}

describe("RideSummaryScreen", () => {
  it("renders summary screen with no data", () => {
    renderSummary();
    expect(screen.getByTestId("summary-screen")).toBeTruthy();
  });

  it("renders elapsed time for completed ride", () => {
    renderSummary({
      summaryData: { elapsed_s: 4523, reason: "completed" },
    });
    expect(screen.getByTestId("summary-elapsed").textContent).toBe("1:15:23");
  });

  it("renders elapsed time for user-ended ride", () => {
    renderSummary({
      summaryData: { elapsed_s: 300, reason: "user_ended" },
    });
    expect(screen.getByTestId("summary-elapsed").textContent).toBe("5:00");
  });

  it("shows route name when provided", () => {
    renderSummary({
      summaryData: { elapsed_s: 1200, reason: "completed", route_name: "Alpenrunde" },
    });
    expect(screen.getByTestId("summary-route-name").textContent).toBe("Alpenrunde");
  });

  it("does not render route name section when absent", () => {
    renderSummary({
      summaryData: { elapsed_s: 600, reason: "completed" },
    });
    expect(screen.queryByTestId("summary-route-name")).toBeNull();
  });

  it("renders distance metric when distance_m is available", () => {
    renderSummary({
      summaryData: { elapsed_s: 3600, reason: "completed", distance_m: 25400 },
    });
    expect(screen.getByTestId("summary-metrics").textContent).toContain("25.4 km");
  });

  it("renders ghost comparison when ghost data is available", () => {
    renderSummary({
      summaryData: { elapsed_s: 3600, reason: "completed", ghost_time_gap_s: -15 },
    });
    const metrics = screen.getByTestId("summary-metrics");
    expect(metrics.textContent).toContain("-15s");
    expect(metrics.textContent).toContain("Ghost");
  });

  it("shows positive ghost gap with + prefix", () => {
    renderSummary({
      summaryData: { elapsed_s: 3600, reason: "completed", ghost_time_gap_s: 42 },
    });
    expect(screen.getByTestId("summary-metrics").textContent).toContain("+42s");
  });

  it("shows completed insight when route completed with no ghost", () => {
    renderSummary({
      summaryData: { elapsed_s: 3600, reason: "completed" },
    });
    expect(screen.getByTestId("summary-insight").textContent).toContain("abgeschlossen");
  });

  it("shows user-ended insight when ride was stopped", () => {
    renderSummary({
      summaryData: { elapsed_s: 600, reason: "user_ended" },
    });
    expect(screen.getByTestId("summary-insight").textContent).toContain("gestoppt");
  });

  it("shows ghost-ahead insight when ghost_time_gap_s is negative", () => {
    renderSummary({
      summaryData: { elapsed_s: 3600, reason: "completed", ghost_time_gap_s: -20 },
    });
    expect(screen.getByTestId("summary-insight").textContent).toContain("Ghost ins Ziel");
  });

  it("return home button calls onReturnHome", () => {
    const onReturnHome = vi.fn();
    renderSummary({ onReturnHome });
    fireEvent.click(screen.getByTestId("return-home-button"));
    expect(onReturnHome).toHaveBeenCalledOnce();
  });

  it("ride again button is shown when onRideAgain is provided", () => {
    const onRideAgain = vi.fn();
    renderSummary({ onRideAgain });
    expect(screen.getByTestId("ride-again-button")).toBeTruthy();
  });

  it("ride again button calls onRideAgain when clicked", () => {
    const onRideAgain = vi.fn();
    renderSummary({ onRideAgain });
    fireEvent.click(screen.getByTestId("ride-again-button"));
    expect(onRideAgain).toHaveBeenCalledOnce();
  });

  it("ride again button is absent when onRideAgain is not provided", () => {
    renderSummary();
    expect(screen.queryByTestId("ride-again-button")).toBeNull();
  });

  it("sends get_ride_summary when WS connects", () => {
    renderSummary();
    openWs();
    const msgs = mockWs.sentMessages.map(m => JSON.parse(m));
    expect(msgs.find(m => m.type === "get_ride_summary")).toBeTruthy();
  });

  it("renders avg power from backend ride_summary message", () => {
    renderSummary({
      summaryData: { elapsed_s: 3600, reason: "completed", distance_m: 20000 },
    });
    openWs();
    simulateSummaryMsg({ found: true, avg_power_w: 185, distance_m: 20000 });
    expect(screen.getByTestId("summary-metrics").textContent).toContain("185 W");
  });

  it("does not render metrics section when no data available", () => {
    renderSummary({
      summaryData: { elapsed_s: 600, reason: "completed" },
    });
    openWs();
    simulateSummaryMsg({ found: false });
    expect(screen.queryByTestId("summary-metrics")).toBeNull();
  });
});
