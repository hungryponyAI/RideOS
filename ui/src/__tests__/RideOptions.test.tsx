import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { RideOptions } from "../features/pre-ride/RideOptions";
import type { RideConfig } from "../features/pre-ride/RideOptions";

const defaultConfig: RideConfig = {
  ghost: false,
  reverse: false,
  cutoutStartM: null,
  cutoutEndM: null,
  laps: 1,
  warmup: false,
  cooldown: false,
  ergMode: false,
  physicsMode: true,
};

describe("RideOptions", () => {
  it("advanced options are collapsed by default", () => {
    const { getByText, queryByText } = render(
      <RideOptions config={defaultConfig} totalDistM={10000} hasStravaOrBestTime={false} onChange={vi.fn()} />
    );
    expect(getByText("Erweiterte Optionen")).toBeTruthy();
    expect(queryByText("Weniger Optionen")).toBeNull();
  });

  it("expands advanced options when disclosure button is clicked", () => {
    const { getByText } = render(
      <RideOptions config={defaultConfig} totalDistM={10000} hasStravaOrBestTime={false} onChange={vi.fn()} />
    );
    fireEvent.click(getByText("Erweiterte Optionen"));
    expect(getByText("Weniger Optionen")).toBeTruthy();
    expect(getByText("Rückwärts")).toBeTruthy();
    expect(getByText("ERG Mode")).toBeTruthy();
  });

  it("basic options are always visible", () => {
    const { getByText } = render(
      <RideOptions config={defaultConfig} totalDistM={10000} hasStravaOrBestTime={false} onChange={vi.fn()} />
    );
    expect(getByText("Ghost Rider")).toBeTruthy();
    expect(getByText("Warm-Up")).toBeTruthy();
    expect(getByText("Cool-Down")).toBeTruthy();
    expect(getByText("Runden")).toBeTruthy();
  });

  it("ghost toggle is a switch with aria-checked", () => {
    const { getByRole } = render(
      <RideOptions config={defaultConfig} totalDistM={10000} hasStravaOrBestTime={false} onChange={vi.fn()} />
    );
    const ghostSwitch = getByRole("switch", { name: /ghost rider/i });
    expect(ghostSwitch.getAttribute("aria-checked")).toBe("false");
  });

  it("lap stepper buttons have accessible labels", () => {
    const { getByLabelText } = render(
      <RideOptions config={defaultConfig} totalDistM={10000} hasStravaOrBestTime={false} onChange={vi.fn()} />
    );
    expect(getByLabelText("Runden verringern")).toBeTruthy();
    expect(getByLabelText("Runden erhöhen")).toBeTruthy();
  });

  it("calls onChange when a toggle is clicked", () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <RideOptions config={defaultConfig} totalDistM={10000} hasStravaOrBestTime={false} onChange={onChange} />
    );
    fireEvent.click(getByText("Warm-Up"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ warmup: true }));
  });
});
