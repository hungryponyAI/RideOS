import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AnalyticsScreen } from "../features/analytics/AnalyticsScreen";
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

function simulateOverview(overrides: object = {}) {
  act(() => {
    mockWs.onmessage?.({
      data: JSON.stringify({
        type: "analytics_overview",
        total_rides: 5,
        total_distance_m: 125000,
        total_duration_s: 18000,
        avg_power_w: 185.0,
        rides_last_7_days: 2,
        rides_last_30_days: 5,
        power_trend: [
          { started_at: "2026-05-10T10:00:00+00:00", avg_power_w: 175.0 },
          { started_at: "2026-05-15T10:00:00+00:00", avg_power_w: 190.0 },
        ],
        ...overrides,
      }),
    });
  });
}

function renderAnalytics() {
  return render(
    <WSProvider>
      <AnalyticsScreen />
    </WSProvider>
  );
}

describe("AnalyticsScreen", () => {
  it("renders analytics screen", () => {
    renderAnalytics();
    expect(screen.getByTestId("analytics-screen")).toBeTruthy();
  });

  it("sends get_analytics_overview when WS connects", () => {
    renderAnalytics();
    openWs();
    const msgs = mockWs.sentMessages.map(m => JSON.parse(m));
    expect(msgs.find(m => m.type === "get_analytics_overview")).toBeTruthy();
  });

  it("shows loading state before overview arrives", () => {
    renderAnalytics();
    openWs();
    expect(screen.getByText(/Lade Analyse/i)).toBeTruthy();
  });

  it("shows empty state when total_rides is 0", () => {
    renderAnalytics();
    openWs();
    simulateOverview({ total_rides: 0, power_trend: [] });
    expect(screen.getByText(/mehreren Fahrten/i)).toBeTruthy();
    expect(screen.queryByTestId("overview-stats")).toBeNull();
  });

  it("renders overview stats when rides are present", () => {
    renderAnalytics();
    openWs();
    simulateOverview();
    expect(screen.getByTestId("overview-stats")).toBeTruthy();
  });

  it("shows total rides count", () => {
    renderAnalytics();
    openWs();
    simulateOverview();
    expect(screen.getByTestId("overview-stats").textContent).toContain("5");
  });

  it("shows consistency section", () => {
    renderAnalytics();
    openWs();
    simulateOverview();
    expect(screen.getByTestId("consistency-section")).toBeTruthy();
    expect(screen.getByTestId("consistency-section").textContent).toContain("2");
  });

  it("renders power trend chart when trend data exists", () => {
    renderAnalytics();
    openWs();
    simulateOverview();
    expect(screen.getByTestId("power-trend-section")).toBeTruthy();
  });

  it("hides power trend when trend is empty", () => {
    renderAnalytics();
    openWs();
    simulateOverview({ power_trend: [] });
    expect(screen.queryByTestId("power-trend-section")).toBeNull();
  });

  it("advanced section is collapsed by default", () => {
    renderAnalytics();
    openWs();
    simulateOverview();
    expect(screen.queryByTestId("advanced-content")).toBeNull();
  });

  it("advanced section opens on toggle click", () => {
    renderAnalytics();
    openWs();
    simulateOverview();
    fireEvent.click(screen.getByTestId("advanced-toggle"));
    expect(screen.getByTestId("advanced-content")).toBeTruthy();
  });

  it("advanced section closes on second toggle click", () => {
    renderAnalytics();
    openWs();
    simulateOverview();
    fireEvent.click(screen.getByTestId("advanced-toggle"));
    fireEvent.click(screen.getByTestId("advanced-toggle"));
    expect(screen.queryByTestId("advanced-content")).toBeNull();
  });

  it("advanced toggle has correct aria-expanded attribute", () => {
    renderAnalytics();
    openWs();
    simulateOverview();
    const toggle = screen.getByTestId("advanced-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("hides avg power tile when avg_power_w is null", () => {
    renderAnalytics();
    openWs();
    simulateOverview({ avg_power_w: null });
    expect(screen.getByTestId("overview-stats").textContent).not.toContain("Ø Leistung");
  });
});
