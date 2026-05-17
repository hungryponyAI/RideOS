import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { OudenaLogo } from "../shared/ui/OudenaLogo";

describe("OudenaLogo", () => {
  it("wordmark renders as img with OUDENA label", () => {
    const { getByRole } = render(<OudenaLogo />);
    expect(getByRole("img", { name: "OUDENA" })).toBeTruthy();
  });

  it("mark variant renders as img with OUDENA label", () => {
    const { getByRole } = render(<OudenaLogo variant="mark" />);
    expect(getByRole("img", { name: "OUDENA" })).toBeTruthy();
  });

  it("wordmark respects height prop", () => {
    const { getByRole } = render(<OudenaLogo height={32} />);
    const svg = getByRole("img");
    expect(svg.getAttribute("height")).toBe("32");
    expect(svg.getAttribute("width")).toBe("103");
  });

  it("mark respects height prop", () => {
    const { getByRole } = render(<OudenaLogo variant="mark" height={48} />);
    const svg = getByRole("img");
    expect(svg.getAttribute("height")).toBe("48");
    expect(svg.getAttribute("width")).toBe("48");
  });
});
