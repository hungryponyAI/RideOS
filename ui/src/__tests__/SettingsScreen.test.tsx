import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsScreen } from "../features/settings/SettingsScreen";

const mockSendMessage = vi.fn();
const mockToggleTheme = vi.fn();

vi.mock("../shared/ws/useWS", () => ({
  useWS: () => ({ sendMessage: mockSendMessage, status: "connected" }),
}));

vi.mock("../app/providers/ThemeProvider", () => ({
  useTheme: () => ({ isDark: true, toggleTheme: mockToggleTheme }),
}));

vi.mock("../features/settings/hooks/useDeviceStatus", () => ({
  useDeviceStatus: () => ({ kickrConnected: false, clickConnected: false }),
}));

vi.mock("../features/strava/hooks/useStravaStatus", () => ({
  useStravaStatus: () => ({
    stravaStatus: null,
    stravaAuthUrl: null,
    stravaError: null,
    clearStravaAuthUrl: vi.fn(),
    clearStravaError: vi.fn(),
  }),
}));

vi.mock("../shared/ws/useWSSubscription", () => ({
  useWSSubscription: vi.fn(),
}));

let mockStorage: Record<string, string> = {};
beforeEach(() => {
  mockStorage = {};
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(k => mockStorage[k] ?? null);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation((k, v) => { mockStorage[k] = v; });
  mockSendMessage.mockClear();
  mockToggleTheme.mockClear();
});

describe("SettingsScreen", () => {
  it("renders all main sections", () => {
    render(<SettingsScreen />);
    expect(screen.getByText("Athlet")).toBeTruthy();
    expect(screen.getByText("Fahrt")).toBeTruthy();
    expect(screen.getByText("Darstellung")).toBeTruthy();
    expect(screen.getByText("Integrationen")).toBeTruthy();
    expect(screen.getByText("Trainer")).toBeTruthy();
  });

  it("renders athlete number inputs", () => {
    render(<SettingsScreen />);
    expect(screen.getByText("Gewicht")).toBeTruthy();
    expect(screen.getByText("Körpergröße")).toBeTruthy();
    expect(screen.getByText("FTP")).toBeTruthy();
  });

  it("renders ride preference toggles", () => {
    render(<SettingsScreen />);
    expect(screen.getByText("Ghost standardmäßig aktiv")).toBeTruthy();
    expect(screen.getByText("Aufwärmen aktiviert")).toBeTruthy();
  });

  it("ghost toggle is on by default", () => {
    render(<SettingsScreen />);
    const toggle = screen.getByRole("switch", { name: "Ghost standardmäßig aktiv" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("toggling ghost updates localStorage", () => {
    render(<SettingsScreen />);
    const toggle = screen.getByRole("switch", { name: "Ghost standardmäßig aktiv" });
    fireEvent.click(toggle);
    const stored = JSON.parse(mockStorage["rideos-prefs"] ?? "{}");
    expect(stored.ghost_default).toBe(false);
  });

  it("renders theme segment control", () => {
    render(<SettingsScreen />);
    expect(screen.getByText("Design")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dunkel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hell" })).toBeTruthy();
  });

  it("clicking light theme calls toggleTheme when dark is active", () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Hell" }));
    expect(mockToggleTheme).toHaveBeenCalledOnce();
  });

  it("renders metric unit control", () => {
    render(<SettingsScreen />);
    expect(screen.getByText("Einheiten")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Metrisch" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Imperial" })).toBeTruthy();
  });

  it("selecting imperial saves to localStorage", () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Imperial" }));
    const stored = JSON.parse(mockStorage["rideos-prefs"] ?? "{}");
    expect(stored.metric_unit).toBe("imperial");
  });

  it("shows Strava connect button when not connected", () => {
    render(<SettingsScreen />);
    expect(screen.getByRole("button", { name: "Verbinden" })).toBeTruthy();
  });

  it("Erweitert section is collapsed by default", () => {
    render(<SettingsScreen onReopenOnboarding={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Erneut starten" })).toBeNull();
  });

  it("expanding Erweitert reveals reopen onboarding button", () => {
    const onReopen = vi.fn();
    render(<SettingsScreen onReopenOnboarding={onReopen} />);
    fireEvent.click(screen.getByRole("button", { name: /Erweitert/i }));
    const reopenBtn = screen.getByRole("button", { name: "Erneut starten" });
    fireEvent.click(reopenBtn);
    expect(onReopen).toHaveBeenCalledOnce();
  });

  it("trainer rows show not-yet-supported state", () => {
    render(<SettingsScreen />);
    expect(screen.getAllByText("Noch nicht unterstützt").length).toBe(2);
  });
});

describe("useAppSettings", () => {
  it("loads defaults when nothing is stored", async () => {
    const { loadAppPreferences } = await import("../features/settings/hooks/useAppSettings");
    const prefs = loadAppPreferences();
    expect(prefs.ghost_default).toBe(true);
    expect(prefs.warmup_enabled).toBe(false);
    expect(prefs.metric_unit).toBe("metric");
    expect(prefs.camera_default).toBe("follow");
  });

  it("loads persisted prefs from localStorage", async () => {
    mockStorage["rideos-prefs"] = JSON.stringify({ ghost_default: false, metric_unit: "imperial" });
    const { loadAppPreferences } = await import("../features/settings/hooks/useAppSettings");
    const prefs = loadAppPreferences();
    expect(prefs.ghost_default).toBe(false);
    expect(prefs.metric_unit).toBe("imperial");
    expect(prefs.warmup_enabled).toBe(false);
  });
});
