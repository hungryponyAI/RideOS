import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MetricDisplay } from "../shared/ui/MetricDisplay";

describe("MetricDisplay", () => {
  it("renders display size value and unit", () => {
    const { getByText } = render(<MetricDisplay value="32.5" unit="KM/H" size="display" />);
    expect(getByText("32.5")).toBeTruthy();
    expect(getByText("KM/H")).toBeTruthy();
  });

  it("renders body size value and unit", () => {
    const { getByText } = render(<MetricDisplay value={250} unit="WATT" size="body" />);
    expect(getByText("250")).toBeTruthy();
    expect(getByText("WATT")).toBeTruthy();
  });

  it("renders em dash placeholder", () => {
    const { getByText } = render(<MetricDisplay value="–" unit="KM/H" size="display" />);
    expect(getByText("–")).toBeTruthy();
  });
});
