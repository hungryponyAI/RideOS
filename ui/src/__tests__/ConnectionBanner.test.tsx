import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ConnectionBanner } from "../shared/ui/ConnectionBanner";

describe("ConnectionBanner", () => {
  it("shows connected status for connected", () => {
    const { getByText } = render(<ConnectionBanner status="connected" />);
    expect(getByText("Trainer verbunden")).toBeTruthy();
  });

  it("shows connected status for live", () => {
    const { getByText } = render(<ConnectionBanner status="live" />);
    expect(getByText("Trainer verbunden")).toBeTruthy();
  });

  it("shows connecting banner", () => {
    const { getByText } = render(<ConnectionBanner status="connecting" />);
    expect(getByText("Verbindung wird aufgebaut")).toBeTruthy();
  });

  it("shows disconnected alert for disconnected status", () => {
    const { getByRole } = render(<ConnectionBanner status="disconnected" />);
    expect(getByRole("alert")).toBeTruthy();
  });
});
