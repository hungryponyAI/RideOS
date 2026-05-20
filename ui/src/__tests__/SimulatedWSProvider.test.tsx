import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SIM_ROUTE_ID,
  SIM_SESSION_ID,
  SimulatedWSProvider,
  getSimViewMode,
  isRideSimEnabled,
} from "../shared/ws/SimulatedWSProvider";
import { useWS } from "../shared/ws/useWS";

describe("SimulatedWSProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/?rideSim=1&simTelemetryHz=4&simRoutePoints=50");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
  });

  it("detects sim mode and view mode from query params", () => {
    window.history.replaceState(null, "", "/?rideSim=1&simView=follow");
    expect(isRideSimEnabled()).toBe(true);
    expect(getSimViewMode()).toBe("follow");
  });

  it("emits route data and telemetry", () => {
    const received: Record<string, unknown>[] = [];
    function Consumer() {
      const { subscribe } = useWS();
      useEffect(() => {
        const offRoute = subscribe("route_data", (msg) => received.push(msg as Record<string, unknown>));
        const offTelemetry = subscribe("telemetry", (msg) => received.push(msg as Record<string, unknown>));
        return () => {
          offRoute();
          offTelemetry();
        };
      }, [subscribe]);
      return null;
    }

    render(<SimulatedWSProvider><Consumer /></SimulatedWSProvider>);
    act(() => { vi.advanceTimersByTime(300); });

    expect(received.find((msg) => msg.type === "route_data")).toMatchObject({
      route_id: SIM_ROUTE_ID,
      ride_session_id: SIM_SESSION_ID,
    });
    expect(received.find((msg) => msg.type === "telemetry")).toMatchObject({
      type: "telemetry",
      route_loaded: true,
    });
  });

  it("handles pause, gear shift, and end ride commands", () => {
    const telemetry: Record<string, unknown>[] = [];
    function Controller() {
      const { subscribe, sendMessage } = useWS();
      useEffect(() => subscribe("telemetry", (msg) => telemetry.push(msg as Record<string, unknown>)), [subscribe]);
      useEffect(() => {
        sendMessage({ type: "set_paused", paused: true });
        sendMessage({ type: "gear_shift", direction: "up" });
        sendMessage({ type: "end_ride" });
      }, [sendMessage]);
      return null;
    }

    render(<SimulatedWSProvider><Controller /></SimulatedWSProvider>);
    act(() => { vi.advanceTimersByTime(300); });

    const last = telemetry[telemetry.length - 1];
    expect(last).toMatchObject({ ride_phase: "done", ended_reason: "user_ended", gear: 7 });
  });

  it("uses wall-clock time and simSpeed for accelerated elapsed time", () => {
    window.history.replaceState(null, "", "/?rideSim=1&simDurationMin=1&simSpeed=20&simTelemetryHz=4&simRoutePoints=50");
    const telemetry: Record<string, unknown>[] = [];
    function Consumer() {
      const { subscribe } = useWS();
      useEffect(() => subscribe("telemetry", (msg) => telemetry.push(msg as Record<string, unknown>)), [subscribe]);
      return null;
    }

    render(<SimulatedWSProvider><Consumer /></SimulatedWSProvider>);
    act(() => { vi.advanceTimersByTime(3000); });

    const last = telemetry[telemetry.length - 1];
    expect(last.elapsed_s).toBeGreaterThanOrEqual(60);
    expect(last).toMatchObject({ ride_phase: "done", ended_reason: "completed" });
  });
});
