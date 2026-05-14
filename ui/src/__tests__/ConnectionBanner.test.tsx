import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ConnectionBanner } from "../shared/ui/ConnectionBanner";

describe("ConnectionBanner", () => {
  it("shows LIVE for connected status", () => {
    const { getByText } = render(<ConnectionBanner status="connected" />);
    expect(getByText("LIVE")).toBeTruthy();
  });

  it("shows LIVE for live status", () => {
    const { getByText } = render(<ConnectionBanner status="live" />);
    expect(getByText("LIVE")).toBeTruthy();
  });

  it("shows connecting banner", () => {
    const { getByText } = render(<ConnectionBanner status="connecting" />);
    expect(getByText(/VERBINDUNG WIRD AUFGEBAUT/)).toBeTruthy();
  });

  it("shows disconnected alert for disconnected status", () => {
    const { getByRole } = render(<ConnectionBanner status="disconnected" />);
    expect(getByRole("alert")).toBeTruthy();
  });
});
