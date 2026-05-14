import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DevicesScreen } from "../features/devices/DevicesScreen";
import { useDeviceStatus } from "../features/settings/hooks/useDeviceStatus";

vi.mock("../shared/ws/useWS", () => ({
  useWS: () => ({ sendMessage: vi.fn(), status: "connected" }),
}));

vi.mock("../shared/ws/useWSSubscription", () => ({
  useWSSubscription: vi.fn(),
}));

vi.mock("../features/settings/hooks/useDeviceStatus", () => ({
  useDeviceStatus: vi.fn(() => ({ kickrConnected: false, clickConnected: false })),
}));

beforeEach(() => {
  vi.mocked(useDeviceStatus).mockReturnValue({ kickrConnected: false, clickConnected: false });
});

describe("DevicesScreen", () => {
  it("renders device names", () => {
    render(<DevicesScreen />);
    expect(screen.getByText("Wahoo KICKR Core")).toBeTruthy();
    expect(screen.getByText("Zwift Click")).toBeTruthy();
  });

  it("shows searching copy when not connected and ws is connected", () => {
    render(<DevicesScreen />);
    const searchingItems = screen.getAllByText("Trainer wird gesucht");
    expect(searchingItems.length).toBeGreaterThan(0);
  });

  it("renders connected state when kickrConnected is true", () => {
    vi.mocked(useDeviceStatus).mockReturnValue({ kickrConnected: true, clickConnected: false });
    render(<DevicesScreen />);
    expect(screen.getByText("Verbunden")).toBeTruthy();
  });

  it("renders testid for screen", () => {
    render(<DevicesScreen />);
    expect(screen.getByTestId("devices-screen")).toBeTruthy();
  });
});
