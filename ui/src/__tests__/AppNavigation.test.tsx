import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { AppNav } from "../app/AppNav";
import { RideHistorySection } from "../features/history/HistoryScreen";
import { AnalyticsScreen } from "../features/analytics/AnalyticsScreen";
import { DevicesScreen } from "../features/devices/DevicesScreen";
import { RideSummaryScreen } from "../features/summary/RideSummaryScreen";

vi.mock("../shared/ws/useWS", () => ({
  useWS: () => ({ sendMessage: vi.fn(), status: "connected" }),
}));

vi.mock("../shared/ws/useWSSubscription", () => ({
  useWSSubscription: vi.fn(),
}));

vi.mock("../features/settings/hooks/useDeviceStatus", () => ({
  useDeviceStatus: () => ({ kickrConnected: false, clickConnected: false }),
}));

describe("AppNav", () => {
  it("renders all navigation items", () => {
    const { getByLabelText } = render(
      <AppNav current="home" onNavigate={vi.fn()} />
    );
    expect(getByLabelText("Startseite")).toBeTruthy();
    expect(getByLabelText("Strecken")).toBeTruthy();
    expect(() => getByLabelText("Verlauf")).toThrow();
    expect(getByLabelText("Analyse")).toBeTruthy();
    expect(getByLabelText("Gerät")).toBeTruthy();
    expect(getByLabelText("Einstellungen")).toBeTruthy();
  });

  it("marks Home as current when view is home", () => {
    const { getByLabelText } = render(
      <AppNav current="home" onNavigate={vi.fn()} />
    );
    expect(getByLabelText("Startseite").getAttribute("aria-current")).toBe("page");
    expect(getByLabelText("Analyse").getAttribute("aria-current")).toBeNull();
  });

  it("marks Strecken as current when view is routes", () => {
    const { getByLabelText } = render(
      <AppNav current="routes" onNavigate={vi.fn()} />
    );
    expect(getByLabelText("Strecken").getAttribute("aria-current")).toBe("page");
    expect(getByLabelText("Startseite").getAttribute("aria-current")).toBeNull();
  });

  it("calls onNavigate with routes when clicking Strecken", () => {
    const onNavigate = vi.fn();
    const { getByLabelText } = render(
      <AppNav current="home" onNavigate={onNavigate} />
    );
    fireEvent.click(getByLabelText("Strecken"));
    expect(onNavigate).toHaveBeenCalledWith("routes");
  });

  it("calls onNavigate with analytics when clicking Analyse", () => {
    const onNavigate = vi.fn();
    const { getByLabelText } = render(
      <AppNav current="home" onNavigate={onNavigate} />
    );
    fireEvent.click(getByLabelText("Analyse"));
    expect(onNavigate).toHaveBeenCalledWith("analytics");
  });

  it("calls onNavigate with devices when clicking Gerät", () => {
    const onNavigate = vi.fn();
    const { getByLabelText } = render(
      <AppNav current="home" onNavigate={onNavigate} />
    );
    fireEvent.click(getByLabelText("Gerät"));
    expect(onNavigate).toHaveBeenCalledWith("devices");
  });

  it("calls onNavigate with settings when clicking Einstellungen", () => {
    const onNavigate = vi.fn();
    const { getByLabelText } = render(
      <AppNav current="home" onNavigate={onNavigate} />
    );
    fireEvent.click(getByLabelText("Einstellungen"));
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("marks Einstellungen as current when view is settings", () => {
    const { getByLabelText } = render(
      <AppNav current="settings" onNavigate={vi.fn()} />
    );
    expect(getByLabelText("Einstellungen").getAttribute("aria-current")).toBe("page");
  });
});

describe("RideHistorySection", () => {
  it("renders with testid", () => {
    const { getByTestId } = render(<RideHistorySection />);
    expect(getByTestId("ride-history-section")).toBeTruthy();
  });
});

describe("AnalyticsScreen", () => {
  it("renders with testid", () => {
    const { getByTestId } = render(<AnalyticsScreen />);
    expect(getByTestId("analytics-screen")).toBeTruthy();
  });
});

describe("DevicesScreen", () => {
  it("renders with testid", () => {
    const { getByTestId } = render(<DevicesScreen />);
    expect(getByTestId("devices-screen")).toBeTruthy();
  });
});

describe("RideSummaryScreen", () => {
  it("renders with testid", () => {
    const { getByTestId } = render(<RideSummaryScreen summaryData={null} onReturnHome={vi.fn()} />);
    expect(getByTestId("summary-screen")).toBeTruthy();
  });

  it("calls onReturnHome when button clicked", () => {
    const onReturnHome = vi.fn();
    const { getByText } = render(<RideSummaryScreen summaryData={null} onReturnHome={onReturnHome} />);
    fireEvent.click(getByText("Zur Startseite"));
    expect(onReturnHome).toHaveBeenCalled();
  });

  it("shows elapsed time when summaryData is provided", () => {
    const { getByText } = render(
      <RideSummaryScreen summaryData={{ elapsed_s: 3661, reason: "completed" }} onReturnHome={vi.fn()} />
    );
    expect(getByText("1:01:01")).toBeTruthy();
  });
});
