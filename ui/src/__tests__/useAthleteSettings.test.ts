import { describe, it, expect, beforeEach } from "vitest";
import { loadAthleteSettings } from "../features/settings/hooks/useAthleteSettings";

beforeEach(() => {
  localStorage.clear();
});

describe("loadAthleteSettings", () => {
  it("returns defaults when nothing is stored", () => {
    const settings = loadAthleteSettings();
    expect(settings.height_cm).toBe(180);
    expect(settings.weight_kg).toBe(75);
    expect(settings.ftp_w).toBe(200);
  });

  it("returns stored values when valid", () => {
    localStorage.setItem("rideos-athlete", JSON.stringify({ height_cm: 175, weight_kg: 68, ftp_w: 240 }));
    const settings = loadAthleteSettings();
    expect(settings.height_cm).toBe(175);
    expect(settings.weight_kg).toBe(68);
    expect(settings.ftp_w).toBe(240);
  });

  it("falls back to defaults for zero values", () => {
    localStorage.setItem("rideos-athlete", JSON.stringify({ height_cm: 0, weight_kg: 0, ftp_w: 0 }));
    const settings = loadAthleteSettings();
    expect(settings.height_cm).toBe(180);
    expect(settings.weight_kg).toBe(75);
    expect(settings.ftp_w).toBe(200);
  });

  it("falls back to defaults for invalid JSON", () => {
    localStorage.setItem("rideos-athlete", "not-json{{");
    const settings = loadAthleteSettings();
    expect(settings.ftp_w).toBe(200);
  });
});
