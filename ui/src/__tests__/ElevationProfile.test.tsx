import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ELEVATION_PROFILE_LABEL_ROUNDING_M,
  ElevationProfile,
} from "../features/ride/components/ElevationProfile";
import type { ElevationChartDatum } from "../shared/types/route";

const makeData = (count = 5, distStep = 2000): ElevationChartDatum[] =>
  Array.from({ length: count }, (_, i) => ({ dist: i * distStep, elev: 100 + i * 10 }));

describe("ElevationProfile", () => {
  it("shows empty state with no data", () => {
    render(<ElevationProfile data={null} gradesPct={null} positionM={null} />);
    expect(screen.getByText("Keine Strecke geladen")).toBeTruthy();
  });

  it("renders elevation bounds when data provided", () => {
    const data = makeData(6);
    render(<ElevationProfile data={data} gradesPct={null} positionM={5000} />);
    expect(screen.getAllByText(/m/).length).toBeGreaterThanOrEqual(1);
  });

  it("rounds smoothed elevation bounds to stable label steps", () => {
    const data: ElevationChartDatum[] = [
      { dist: 0, elev: 100 },
      { dist: 50, elev: 130 },
      { dist: 100, elev: 101 },
      { dist: 150, elev: 102 },
      { dist: 200, elev: 103 },
    ];

    render(<ElevationProfile data={data} gradesPct={null} positionM={100} />);

    const labels = screen.getAllByText(/m$/).map((node) => Number(node.textContent?.replace(" m", "")));
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(labels.every((value) => value % ELEVATION_PROFILE_LABEL_ROUNDING_M === 0)).toBe(true);
    expect(Math.max(...labels)).toBeLessThan(130);
  });

  it("renders rider position line when positionM is in window", () => {
    const data = makeData(6);
    const { container } = render(
      <ElevationProfile data={data} gradesPct={null} positionM={5000} />
    );
    const lines = container.querySelectorAll("line");
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it("renders ghost marker when ghostDistM is within visible window", () => {
    const data = makeData(10);
    const { container } = render(
      <ElevationProfile data={data} gradesPct={null} positionM={9000} ghostDistM={7000} />
    );
    // Ghost produces a dashed line (strokeDasharray)
    const dashed = Array.from(container.querySelectorAll("line")).filter(
      el => el.getAttribute("stroke-dasharray") != null,
    );
    expect(dashed.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("GHOST")).toBeNull();
  });

  it("positions rider and ghost dots on the elevation curve", () => {
    const data: ElevationChartDatum[] = [
      { dist: 0, elev: 100 },
      { dist: 100, elev: 110 },
      { dist: 200, elev: 120 },
      { dist: 300, elev: 130 },
      { dist: 400, elev: 140 },
    ];

    const { container } = render(
      <ElevationProfile data={data} gradesPct={null} positionM={400} ghostDistM={100} />
    );

    const circles = Array.from(container.querySelectorAll("circle"));
    const yValues = circles.map((circle) => Number(circle.getAttribute("cy")));
    expect(yValues.length).toBeGreaterThanOrEqual(3);
    expect(yValues.every((value) => Number.isFinite(value) && value > 0 && value < 100)).toBe(true);
    expect(yValues.every((value) => value !== 50)).toBe(true);
  });

  it("does not render ghost marker when ghostDistM is null", () => {
    const data = makeData(10);
    const { container } = render(
      <ElevationProfile data={data} gradesPct={null} positionM={9000} ghostDistM={null} />
    );
    const dashed = Array.from(container.querySelectorAll("line")).filter(
      el => el.getAttribute("stroke-dasharray") != null,
    );
    expect(dashed.length).toBe(0);
    expect(screen.queryByText("GHOST")).toBeNull();
  });

  it("does not render ghost marker when ghostDistM is outside visible window", () => {
    const data = makeData(6);
    // positionM=5000, window is [0,10000]. ghostDistM=99000 is outside.
    const { container } = render(
      <ElevationProfile data={data} gradesPct={null} positionM={5000} ghostDistM={99000} />
    );
    const dashed = Array.from(container.querySelectorAll("line")).filter(
      el => el.getAttribute("stroke-dasharray") != null,
    );
    expect(dashed.length).toBe(0);
  });

  it("renders climb terrain rects when grades exceed threshold", () => {
    const data = makeData(6);
    // All grades above climb threshold (4%)
    const grades = [5, 5, 5, 5, 5, 5];
    const { container } = render(
      <ElevationProfile data={data} gradesPct={grades} positionM={5000} />
    );
    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBeGreaterThanOrEqual(1);
  });

  it("renders descent terrain rects when grades are below threshold", () => {
    const data = makeData(6);
    const grades = [-4, -4, -4, -4, -4, -4];
    const { container } = render(
      <ElevationProfile data={data} gradesPct={grades} positionM={5000} />
    );
    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBeGreaterThanOrEqual(1);
  });

  it("does not render terrain rects for flat grades", () => {
    const data = makeData(6);
    const grades = [1, 1, 1, 1, 1, 1];
    const { container } = render(
      <ElevationProfile data={data} gradesPct={grades} positionM={5000} />
    );
    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBe(0);
  });
});
