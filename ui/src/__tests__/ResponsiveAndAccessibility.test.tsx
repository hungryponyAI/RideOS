import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AppNav } from "../app/AppNav";
import { RideControls } from "../features/ride/components/RideControls";
import { ConnectionBanner } from "../shared/ui/ConnectionBanner";
import { RideScreen } from "../features/ride/RideScreen";
import { WSProvider } from "../shared/ws/WSProvider";
import { RideSummaryScreen } from "../features/summary/RideSummaryScreen";
import { HistoryScreen } from "../features/history/HistoryScreen";
import { AnalyticsScreen } from "../features/analytics/AnalyticsScreen";

vi.mock("../features/ride/components/MiniMap", () => ({
  MiniMap: () => <div data-testid="mini-map-mock" />,
}));

vi.mock("../shared/ws/useWSSubscription", () => ({
  useWSSubscription: vi.fn(),
}));

// --- AppNav: color-independent active state ---

describe("AppNav - active indicator", () => {
  it("renders an active bar indicator for the current view", () => {
    const { container } = render(<AppNav current="home" onNavigate={vi.fn()} />);
    const indicator = container.querySelector('[aria-hidden="true"]');
    expect(indicator).toBeTruthy();
  });

  it("active indicator span is present only on active button", () => {
    const { getByLabelText } = render(<AppNav current="home" onNavigate={vi.fn()} />);
    const homeBtn = getByLabelText("Startseite");
    // The active indicator is a <span aria-hidden="true"> (not an SVG)
    expect(homeBtn.querySelector('span[aria-hidden="true"]')).toBeTruthy();
    const routesBtn = getByLabelText("Strecken");
    expect(routesBtn.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it("nav has accessible label", () => {
    const { container } = render(<AppNav current="home" onNavigate={vi.fn()} />);
    const nav = container.querySelector('nav');
    expect(nav?.getAttribute("aria-label")).toBe("Hauptnavigation");
  });

  it("all 6 nav buttons have aria-labels", () => {
    const { getByLabelText } = render(<AppNav current="home" onNavigate={vi.fn()} />);
    expect(getByLabelText("Startseite")).toBeTruthy();
    expect(getByLabelText("Strecken")).toBeTruthy();
    expect(getByLabelText("Verlauf")).toBeTruthy();
    expect(getByLabelText("Analyse")).toBeTruthy();
    expect(getByLabelText("Gerät")).toBeTruthy();
    expect(getByLabelText("Einstellungen")).toBeTruthy();
  });

  it("active button has aria-current=page, inactive buttons do not", () => {
    const { getByLabelText } = render(<AppNav current="analytics" onNavigate={vi.fn()} />);
    expect(getByLabelText("Analyse").getAttribute("aria-current")).toBe("page");
    expect(getByLabelText("Startseite").getAttribute("aria-current")).toBeNull();
    expect(getByLabelText("Verlauf").getAttribute("aria-current")).toBeNull();
  });
});

// --- RideControls: ARIA labels ---

describe("RideControls - ARIA labels", () => {
  const baseProps = {
    isPaused: false,
    visible: true,
    onTogglePause: vi.fn(),
    onEndRide: vi.fn(),
    onShiftGear: vi.fn(),
    onCycleCamera: vi.fn(),
    viewMode: "chase" as const,
  };

  it("gear-down button has aria-label", () => {
    render(<RideControls {...baseProps} />);
    expect(screen.getByLabelText("Gang runter")).toBeTruthy();
  });

  it("gear-up button has aria-label", () => {
    render(<RideControls {...baseProps} />);
    expect(screen.getByLabelText("Gang rauf")).toBeTruthy();
  });

  it("camera button has aria-label including view mode", () => {
    render(<RideControls {...baseProps} viewMode="follow" />);
    expect(screen.getByLabelText("Kameraansicht: Follow")).toBeTruthy();
  });

  it("pause button has aria-label", () => {
    render(<RideControls {...baseProps} />);
    expect(screen.getByLabelText("Fahrt pausieren")).toBeTruthy();
  });

  it("end-ride button has aria-label", () => {
    render(<RideControls {...baseProps} />);
    expect(screen.getByLabelText("Fahrt beenden")).toBeTruthy();
  });

  it("resume button has aria-label when paused", () => {
    render(<RideControls {...baseProps} isPaused={true} />);
    expect(screen.getByLabelText("Fahrt fortsetzen")).toBeTruthy();
  });
});

// --- ConnectionBanner: ARIA roles ---

describe("ConnectionBanner - ARIA roles", () => {
  it("connected state has role=status", () => {
    const { container } = render(<ConnectionBanner status="connected" />);
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });

  it("live state has role=status", () => {
    const { container } = render(<ConnectionBanner status="live" />);
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });

  it("disconnected state has role=alert", () => {
    const { container } = render(<ConnectionBanner status="disconnected" />);
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
  });

  it("connecting state has role=status", () => {
    const { container } = render(<ConnectionBanner status="connecting" />);
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });
});

// --- RideScreen: dialog focus trap ---

let mockWs: {
  readyState: number;
  sentMessages: string[];
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  send: (data: string) => void;
  close: () => void;
};

type MockWSCtor = ReturnType<typeof vi.fn> & { OPEN: number };

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
  }) as MockWSCtor;
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

describe("EndRideConfirmation - focus management", () => {
  it("dialog has role=dialog and aria-modal", () => {
    render(<WSProvider><RideScreen isDark={true} /></WSProvider>);
    openWs();
    fireEvent.click(screen.getByTestId("end-ride-paused"));
    const dialog = screen.getByRole("dialog", { name: /bestätigen/i });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("cancel button receives focus when dialog opens", () => {
    render(<WSProvider><RideScreen isDark={true} /></WSProvider>);
    openWs();
    act(() => { fireEvent.click(screen.getByTestId("end-ride-paused")); });
    expect(document.activeElement?.textContent).toBe("Abbrechen");
  });

  it("Tab key cycles focus from cancel to confirm", () => {
    render(<WSProvider><RideScreen isDark={true} /></WSProvider>);
    openWs();
    act(() => { fireEvent.click(screen.getByTestId("end-ride-paused")); });
    expect(document.activeElement?.textContent).toBe("Abbrechen");
    const dialog = screen.getByRole("dialog", { name: /bestätigen/i });
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement?.textContent).toBe("Beenden");
  });

  it("Tab key cycles focus from confirm back to cancel", () => {
    render(<WSProvider><RideScreen isDark={true} /></WSProvider>);
    openWs();
    act(() => { fireEvent.click(screen.getByTestId("end-ride-paused")); });
    const dialog = screen.getByRole("dialog", { name: /bestätigen/i });
    fireEvent.keyDown(dialog, { key: "Tab" });
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement?.textContent).toBe("Abbrechen");
  });

  it("Escape key closes dialog via RideScreen keyboard handler", () => {
    render(<WSProvider><RideScreen isDark={true} /></WSProvider>);
    openWs();
    fireEvent.click(screen.getByTestId("end-ride-paused"));
    expect(screen.getByRole("dialog", { name: /bestätigen/i })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /bestätigen/i })).toBeNull();
  });
});

// --- RideScreen: ARIA live region ---

describe("RideScreen - ARIA live region", () => {
  it("ride-announcer has aria-live=polite", () => {
    render(<WSProvider><RideScreen isDark={true} /></WSProvider>);
    openWs();
    const announcer = screen.getByTestId("ride-announcer");
    expect(announcer.getAttribute("aria-live")).toBe("polite");
    expect(announcer.getAttribute("aria-atomic")).toBe("true");
  });
});

// --- Responsive smoke tests: screens render without crash ---

vi.mock("../shared/ws/useWS", () => ({
  useWS: () => ({ sendMessage: vi.fn(), status: "connected" }),
}));

describe("Screen render smoke tests", () => {
  it("RideSummaryScreen renders actions", () => {
    render(<RideSummaryScreen summaryData={null} onReturnHome={vi.fn()} />);
    expect(screen.getByTestId("return-home-button")).toBeTruthy();
  });

  it("RideSummaryScreen renders with elapsed time", () => {
    render(
      <RideSummaryScreen
        summaryData={{ elapsed_s: 1800, reason: "completed" }}
        onReturnHome={vi.fn()}
      />
    );
    expect(screen.getByTestId("summary-elapsed")).toBeTruthy();
  });

  it("RideSummaryScreen renders ride-again button when provided", () => {
    render(
      <RideSummaryScreen
        summaryData={{ elapsed_s: 1800, reason: "completed" }}
        onReturnHome={vi.fn()}
        onRideAgain={vi.fn()}
      />
    );
    expect(screen.getByTestId("ride-again-button")).toBeTruthy();
  });

  it("HistoryScreen renders data-testid", () => {
    render(<HistoryScreen />);
    expect(screen.getByTestId("history-screen")).toBeTruthy();
  });

  it("AnalyticsScreen renders data-testid", () => {
    render(<AnalyticsScreen />);
    expect(screen.getByTestId("analytics-screen")).toBeTruthy();
  });
});

// --- Reduced motion: control strip uses motion-reduce class ---

describe("Reduced motion - transition suppression", () => {
  it("ride control strip applies motion-reduce:transition-none", () => {
    const { container } = render(
      <RideControls
        isPaused={false}
        visible={true}
        onTogglePause={vi.fn()}
        onEndRide={vi.fn()}
        onShiftGear={vi.fn()}
        onCycleCamera={vi.fn()}
        viewMode="chase"
      />
    );
    const strip = container.querySelector('[data-testid="ride-control-strip"]');
    expect(strip?.className).toContain("motion-reduce:transition-none");
  });
});
