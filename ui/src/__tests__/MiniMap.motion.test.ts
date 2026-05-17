import { describe, expect, it } from "vitest";
import {
  clampExtrapolationM,
  EXTRAPOLATION_HORIZON_MS,
  lerp,
  lerpAngleDeg,
  projectOntoRoute,
  springAlpha,
} from "../features/ride/components/MiniMap.motion";

describe("MiniMap.motion", () => {
  describe("lerp", () => {
    it("returns endpoints at t=0 and t=1", () => {
      expect(lerp(10, 20, 0)).toBe(10);
      expect(lerp(10, 20, 1)).toBe(20);
    });
    it("interpolates linearly", () => {
      expect(lerp(0, 100, 0.25)).toBe(25);
    });
  });

  describe("springAlpha", () => {
    it("returns 0 for zero dt", () => {
      expect(springAlpha(0, 200)).toBe(0);
    });
    it("approaches 1 as dt grows much larger than tau", () => {
      expect(springAlpha(2000, 100)).toBeGreaterThan(0.99);
    });
    it("returns ~0.632 at dt == tau (1 - 1/e)", () => {
      expect(springAlpha(200, 200)).toBeCloseTo(0.6321, 3);
    });
    it("returns 1 for non-positive tau (instant)", () => {
      expect(springAlpha(16, 0)).toBe(1);
    });
  });

  describe("lerpAngleDeg", () => {
    it("takes the shortest path across the 360→0 boundary", () => {
      expect(lerpAngleDeg(350, 10, 0.5)).toBeCloseTo(0, 3);
    });
    it("does not wrap the long way", () => {
      expect(lerpAngleDeg(10, 350, 0.5)).toBeCloseTo(0, 3);
    });
    it("stays put when from == to", () => {
      expect(lerpAngleDeg(90, 90, 0.5)).toBe(90);
    });
    it("at alpha=0 returns the from value", () => {
      expect(lerpAngleDeg(45, 270, 0)).toBe(45);
    });
  });

  describe("clampExtrapolationM", () => {
    it("returns 0 for non-positive speed", () => {
      expect(clampExtrapolationM(0, 100)).toBe(0);
      expect(clampExtrapolationM(-5, 100)).toBe(0);
    });
    it("returns 0 for non-positive age", () => {
      expect(clampExtrapolationM(5, 0)).toBe(0);
      expect(clampExtrapolationM(5, -10)).toBe(0);
    });
    it("extrapolates linearly under the horizon", () => {
      // 10 m/s * 0.2 s = 2 m
      expect(clampExtrapolationM(10, 200)).toBeCloseTo(2, 5);
    });
    it("caps at the horizon", () => {
      const max = clampExtrapolationM(10, 10_000);
      expect(max).toBeCloseTo(10 * (EXTRAPOLATION_HORIZON_MS / 1000), 5);
    });
  });

  describe("projectOntoRoute", () => {
    const coords: Array<[number, number]> = [
      [47.0, 11.0],
      [47.001, 11.0],
      [47.002, 11.0],
    ];
    // Roughly 111 m per 0.001° latitude
    const cumDist = [0, 111, 222];

    it("returns null when route is too short", () => {
      expect(projectOntoRoute(47, 11, [[47, 11]], [0])).toBeNull();
    });

    it("snaps a point near the route back to the route", () => {
      const proj = projectOntoRoute(47.0005, 11.00001, coords, cumDist);
      expect(proj).not.toBeNull();
      if (!proj) return;
      expect(proj.distM).toBeGreaterThan(40);
      expect(proj.distM).toBeLessThan(80);
      expect(proj.crossTrackM).toBeLessThan(6);
    });

    it("returns null when point is far off the route", () => {
      const proj = projectOntoRoute(47.0005, 11.01, coords, cumDist);
      expect(proj).toBeNull();
    });
  });
});
