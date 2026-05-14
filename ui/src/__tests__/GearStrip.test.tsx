import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GearStrip } from "../features/ride/components/GearStrip";

describe("GearStrip", () => {
  it("renders the current gear number", () => {
    const { getByText } = render(<GearStrip gear={5} />);
    expect(getByText("5")).toBeTruthy();
  });

  it("renders em dash when gear is null", () => {
    const { getByText } = render(<GearStrip gear={null} />);
    expect(getByText("–")).toBeTruthy();
  });

  it("renders gear 1", () => {
    const { getByText } = render(<GearStrip gear={1} />);
    expect(getByText("1")).toBeTruthy();
  });

  it("renders gear 10", () => {
    const { getByText } = render(<GearStrip gear={10} />);
    expect(getByText("10")).toBeTruthy();
  });
});
