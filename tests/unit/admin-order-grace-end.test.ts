/**
 * Spec 020a T-13 (AC-12; TASK-358): the panel's "Cancelled automatically at … unless rerouted"
 * line equals spec 016's `graceEnd`, printed in the viewer's zone and in the destination's zone,
 * each with its zone named. The instant comes from `graceEnd` itself, never from the display.
 */
import { describe, expect, it } from "vitest";

import { graceEndDisplay } from "@/modules/admin/order-actions";
import { graceEnd } from "@/modules/orders";

const WARSAW = { ianaZone: "Europe/Warsaw", sameDayCutoffLocal: "14:00" };

describe("T-13 graceEnd in both zones (spec 020a AC-12)", () => {
  it("an order exhausted at 21:00 Warsaw for tomorrow reads 10:00 Warsaw and 09:00 London", () => {
    // 21:00 in Warsaw (CET, UTC+1) on Wednesday 4 Nov 2026.
    const exhaustedAt = new Date("2026-11-04T20:00:00Z");
    const end = graceEnd(exhaustedAt, "2026-11-05", WARSAW);
    expect(end.toISOString()).toBe("2026-11-05T09:00:00.000Z");
    expect(graceEndDisplay(end, "Europe/Warsaw", "Europe/London")).toEqual({
      viewer: { time: "09:00", zone: "Europe/London", city: "London" },
      destination: { time: "10:00", zone: "Europe/Warsaw", city: "Warsaw" },
    });
  });

  it("reads the artboard's viewer in Tallinn an hour ahead of Warsaw", () => {
    const end = graceEnd(
      new Date("2026-11-04T20:00:00Z"),
      "2026-11-05",
      WARSAW,
    );
    expect(graceEndDisplay(end, "Europe/Warsaw", "Europe/Tallinn")).toEqual({
      viewer: { time: "11:00", zone: "Europe/Tallinn", city: "Tallinn" },
      destination: { time: "10:00", zone: "Europe/Warsaw", city: "Warsaw" },
    });
  });

  it("on the DST night (clocks back at 03:00 on 25 Oct 2026) 21:00 CEST still gives 10:00 CET the next morning, 09:00 GMT in London", () => {
    // 21:00 in Warsaw (CEST, UTC+2) on Saturday 24 Oct 2026.
    const exhaustedAt = new Date("2026-10-24T19:00:00Z");
    const end = graceEnd(exhaustedAt, "2026-10-25", WARSAW);
    expect(end.toISOString()).toBe("2026-10-25T09:00:00.000Z");
    expect(graceEndDisplay(end, "Europe/Warsaw", "Europe/London")).toEqual({
      viewer: { time: "09:00", zone: "Europe/London", city: "London" },
      destination: { time: "10:00", zone: "Europe/Warsaw", city: "Warsaw" },
    });
  });

  it("names a multi-word zone city with spaces", () => {
    const end = new Date("2026-11-05T09:00:00Z");
    expect(
      graceEndDisplay(end, "Europe/Warsaw", "America/New_York").viewer,
    ).toEqual({ time: "04:00", zone: "America/New_York", city: "New York" });
  });
});
