import { describe, it, expect } from "vitest";
import type { GearShiftMessage, StartRideMessage } from "../types/route";

describe("WS outbound message types", () => {
  it("gear shift up message is valid", () => {
    const msg: GearShiftMessage = { type: "gear_shift", direction: "up" };
    expect(msg.type).toBe("gear_shift");
    expect(msg.direction).toBe("up");
  });

  it("gear shift down message is valid", () => {
    const msg: GearShiftMessage = { type: "gear_shift", direction: "down" };
    expect(msg.direction).toBe("down");
  });

  it("start_ride message carries required fields", () => {
    const msg: StartRideMessage = {
      type: "start_ride",
      route_id: "abc-123",
      reverse: false,
      cutout_start_m: null,
      cutout_end_m: null,
      laps: 1,
      ghost: false,
      warmup_s: 0,
      cooldown_s: 0,
      erg_mode: false,
      physics_mode: false,
      paused: true,
    };
    expect(msg.route_id).toBe("abc-123");
    expect(msg.laps).toBe(1);
    expect(msg.physics_mode).toBe(false);
    expect(msg.paused).toBe(true);
  });
});
