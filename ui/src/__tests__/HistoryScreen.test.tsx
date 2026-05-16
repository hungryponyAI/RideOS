import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { RideHistorySection } from "../features/history/HistoryScreen";
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

function simulateRideList(rides: unknown[]) {
  act(() => {
    mockWs.onmessage?.({ data: JSON.stringify({ type: "ride_list", rides }) });
  });
}

const SAMPLE_RIDE = {
  id: "r1",
  route_id: "route1",
  route_name: "Alpenrunde",
  started_at: "2026-05-15T10:00:00+00:00",
  finished_at: "2026-05-15T11:00:00+00:00",
  duration_s: 3600,
  distance_m: 25000,
  avg_power_w: 185,
  completed: true,
};

function renderHistory() {
  return render(
    <WSProvider>
      <RideHistorySection />
    </WSProvider>
  );
}

describe("RideHistorySection", () => {
  it("renders ride history section", () => {
    renderHistory();
    expect(screen.getByTestId("ride-history-section")).toBeTruthy();
    expect(screen.getByText("Letzte Fahrten")).toBeTruthy();
  });

  it("sends list_rides when WS connects", () => {
    renderHistory();
    openWs();
    const msgs = mockWs.sentMessages.map(m => JSON.parse(m));
    expect(msgs.find(m => m.type === "list_rides")).toBeTruthy();
  });

  it("shows loading state before ride_list arrives", () => {
    renderHistory();
    openWs();
    expect(screen.getByText(/Lade Fahrten/i)).toBeTruthy();
  });

  it("shows empty state when no rides", () => {
    renderHistory();
    openWs();
    simulateRideList([]);
    expect(screen.getByText(/ersten Ritt/i)).toBeTruthy();
    expect(screen.queryByTestId("ride-list")).toBeNull();
  });

  it("renders ride list when rides are present", () => {
    renderHistory();
    openWs();
    simulateRideList([SAMPLE_RIDE]);
    expect(screen.getByTestId("ride-list")).toBeTruthy();
    expect(screen.getAllByTestId("ride-card")).toHaveLength(1);
  });

  it("shows route name on ride card", () => {
    renderHistory();
    openWs();
    simulateRideList([SAMPLE_RIDE]);
    expect(screen.getByText("Alpenrunde")).toBeTruthy();
  });

  it("shows 'Freie Fahrt' for rides without a route name", () => {
    renderHistory();
    openWs();
    simulateRideList([{ ...SAMPLE_RIDE, route_name: null }]);
    expect(screen.getByText("Freie Fahrt")).toBeTruthy();
  });

  it("shows completion badge for completed ride", () => {
    renderHistory();
    openWs();
    simulateRideList([SAMPLE_RIDE]);
    expect(screen.getByText("Abgeschlossen")).toBeTruthy();
  });

  it("shows aborted badge for incomplete ride", () => {
    renderHistory();
    openWs();
    simulateRideList([{ ...SAMPLE_RIDE, completed: false, finished_at: null }]);
    expect(screen.getByText("Abgebrochen")).toBeTruthy();
  });

  it("renders multiple ride cards", () => {
    renderHistory();
    openWs();
    simulateRideList([
      SAMPLE_RIDE,
      { ...SAMPLE_RIDE, id: "r2", route_name: "Schwarzwald" },
    ]);
    expect(screen.getAllByTestId("ride-card")).toHaveLength(2);
  });

  it("clicking a ride card opens detail view", () => {
    renderHistory();
    openWs();
    simulateRideList([SAMPLE_RIDE]);
    fireEvent.click(screen.getByTestId("ride-card"));
    expect(screen.getByTestId("ride-detail")).toBeTruthy();
  });

  it("detail view shows route name", () => {
    renderHistory();
    openWs();
    simulateRideList([SAMPLE_RIDE]);
    fireEvent.click(screen.getByTestId("ride-card"));
    const detail = screen.getByTestId("ride-detail");
    expect(detail.textContent).toContain("Alpenrunde");
  });

  it("detail view shows duration", () => {
    renderHistory();
    openWs();
    simulateRideList([SAMPLE_RIDE]);
    fireEvent.click(screen.getByTestId("ride-card"));
    expect(screen.getByTestId("ride-detail").textContent).toContain("1:00:00");
  });

  it("back button returns to list view", () => {
    renderHistory();
    openWs();
    simulateRideList([SAMPLE_RIDE]);
    fireEvent.click(screen.getByTestId("ride-card"));
    expect(screen.getByTestId("ride-detail")).toBeTruthy();
    fireEvent.click(screen.getByTestId("back-button"));
    expect(screen.queryByTestId("ride-detail")).toBeNull();
    expect(screen.getByTestId("ride-list")).toBeTruthy();
  });

  it("deletes a single ride after confirmation", () => {
    renderHistory();
    openWs();
    simulateRideList([SAMPLE_RIDE]);

    fireEvent.click(screen.getByTestId("delete-ride-button"));
    expect(screen.getByTestId("delete-ride-dialog")).toBeTruthy();
    fireEvent.click(screen.getByTestId("delete-confirm-button"));

    const msgs = mockWs.sentMessages.map(m => JSON.parse(m));
    expect(msgs.find(m => m.type === "delete_ride" && m.ride_id === "r1")).toBeTruthy();
    expect(screen.queryByTestId("ride-card")).toBeNull();
  });

  it("can cancel single ride deletion", () => {
    renderHistory();
    openWs();
    simulateRideList([SAMPLE_RIDE]);

    fireEvent.click(screen.getByTestId("delete-ride-button"));
    fireEvent.click(screen.getByTestId("delete-cancel-button"));

    const msgs = mockWs.sentMessages.map(m => JSON.parse(m));
    expect(msgs.find(m => m.type === "delete_ride")).toBeFalsy();
    expect(screen.getByTestId("ride-card")).toBeTruthy();
  });

  it("deletes all rides after confirmation", () => {
    renderHistory();
    openWs();
    simulateRideList([
      SAMPLE_RIDE,
      { ...SAMPLE_RIDE, id: "r2", route_name: "Schwarzwald" },
    ]);

    fireEvent.click(screen.getByTestId("delete-all-rides-button"));
    expect(screen.getByTestId("delete-all-rides-dialog")).toBeTruthy();
    fireEvent.click(screen.getByTestId("delete-confirm-button"));

    const msgs = mockWs.sentMessages.map(m => JSON.parse(m));
    expect(msgs.find(m => m.type === "delete_all_rides")).toBeTruthy();
    expect(screen.queryByTestId("ride-card")).toBeNull();
  });
});
