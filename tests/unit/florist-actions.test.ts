/**
 * The florist's commands, their events and the delivery photo, without a database (spec 011
 * AC-27, AC-28, AC-29, AC-30, AC-31; T-29, T-30 unit half, T-31 unit half; TASK-215).
 *
 *  - The eight event types: each is a catalogue name with a registered v1 strict schema that
 *    carries `mode` and no personal key; none is an arrow label; a decline needs a reason from
 *    the closed list and a photo event its asset.
 *  - `OfferResponseInputSchema`: accept, or decline with one of the five reasons, nothing else.
 *  - `floristActionsFor` over the seeded machine (`tests/fixtures/order-machine.ts`): Accept and
 *    Decline only at `routed`, "Out for delivery" only where `order.out_for_delivery` has a
 *    partner row, "Delivered" only at `out_for_delivery`, "Add the photo" only at `delivered`
 *    with no photo; nothing for an expired, withdrawn, declined or timed-out assignment.
 *  - The photo: a GPS- and XMP-tagged JPEG with an orientation comes out a JPEG with no EXIF,
 *    XMP, IPTC or ICC block, rotated, at most 2000 px on its long edge; a GIF, a renamed PDF and
 *    a file over 15 MiB are refused; the multipart read stops at its bound.
 *  - The source scan: no file this task adds writes a status, an event or an outbox row.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  DECLINE_REASONS,
  FLORIST_EVENT_TYPES,
  floristActionsFor,
  OfferResponseInputSchema,
  type ActionFacts,
} from "../../src/modules/orders/florist-actions/index.ts";
import {
  eventSchema,
  ORDER_EVENT_TYPES,
  registeredEventTypes,
} from "../../src/modules/orders/index.ts";
import {
  checkDeliveryPhoto,
  DeliveryPhotoRefused,
  MULTIPART_OVERHEAD_BYTES,
  processDeliveryPhoto,
  readPhotoUpload,
} from "../../src/modules/orders/photo/index.ts";
import { STATES, TRANSITIONS } from "../fixtures/order-machine.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const UUID = "6f1c2e0a-3b7d-4c55-9a1e-2d8f0b7c4e91";
const MIB = 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* Events (AC-31, R1)                                                         */
/* -------------------------------------------------------------------------- */

describe("the eight event types (AC-31, ruling R1)", () => {
  it("are exactly §5.2's catalogue names, each registered once as a strict v1 schema with `mode` and no personal key", () => {
    expect([...FLORIST_EVENT_TYPES].sort()).toEqual(
      [
        "assignment.accepted",
        "assignment.declined",
        "order.captured",
        "order.delivered",
        "order.in_production",
        "order.no_partner_available",
        "order.out_for_delivery",
        "order.photo_uploaded",
      ].sort(),
    );
    for (const type of FLORIST_EVENT_TYPES) {
      expect(ORDER_EVENT_TYPES, type).toContain(type);
      expect(registeredEventTypes(), type).toContain(type);
      const registered = eventSchema(type);
      expect(registered?.version, type).toBe(1);
      const shape = (
        registered?.schema as unknown as { shape: Record<string, unknown> }
      ).shape;
      expect(Object.keys(shape), type).toContain("mode");
      for (const key of Object.keys(shape)) {
        expect(key, `${type}.${key}`).not.toMatch(
          /name|phone|email|address|street|postcode|postal|card|message/i,
        );
      }
      expect(
        registered?.schema.safeParse({ mode: "demo", fullName: "x" }).success,
        type,
      ).toBe(false);
    }
    for (const label of [
      "accept",
      "decline",
      "deliver",
      "capture",
      "dispatch",
    ]) {
      expect(FLORIST_EVENT_TYPES).not.toContain(label);
    }
  });

  it("a decline carries one reason of the closed list; a photo event carries its asset", () => {
    const declined = eventSchema("assignment.declined")?.schema;
    const base = { mode: "demo", assignment_id: UUID, by_user_id: UUID };
    expect(declined?.safeParse(base).success).toBe(false);
    expect(declined?.safeParse({ ...base, reason: "busy" }).success).toBe(
      false,
    );
    for (const reason of DECLINE_REASONS) {
      expect(declined?.safeParse({ ...base, reason }).success, reason).toBe(
        true,
      );
    }
    const photo = eventSchema("order.photo_uploaded")?.schema;
    expect(photo?.safeParse({ mode: "demo", by_user_id: UUID }).success).toBe(
      false,
    );
    expect(
      photo?.safeParse({ mode: "demo", by_user_id: UUID, media_asset_id: UUID })
        .success,
    ).toBe(true);
    const accepted = eventSchema("assignment.accepted")?.schema;
    expect(accepted?.safeParse({ mode: "demo" }).success).toBe(false);
    expect(
      accepted?.safeParse({
        mode: "demo",
        assignment_id: UUID,
        by_user_id: "u",
      }).success,
    ).toBe(false);
  });
});

describe("OfferResponseInputSchema (AC-28)", () => {
  it("takes accept, or decline with one of the five reasons, and nothing else", () => {
    expect(
      OfferResponseInputSchema.safeParse({ response: "accept" }).success,
    ).toBe(true);
    expect(
      OfferResponseInputSchema.safeParse({ response: "decline" }).success,
    ).toBe(false);
    expect(
      OfferResponseInputSchema.safeParse({ response: "decline", reason: "" })
        .success,
    ).toBe(false);
    expect(
      OfferResponseInputSchema.safeParse({
        response: "accept",
        reason: "capacity",
      }).success,
    ).toBe(false);
    expect(
      OfferResponseInputSchema.safeParse({ response: "timeout" }).success,
    ).toBe(false);
    expect(DECLINE_REASONS).toEqual([
      "capacity",
      "out_of_area",
      "product_unavailable",
      "closed",
      "other",
    ]);
    for (const reason of DECLINE_REASONS) {
      expect(
        OfferResponseInputSchema.safeParse({ response: "decline", reason })
          .success,
      ).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Actions offered (AC-29)                                                    */
/* -------------------------------------------------------------------------- */

/** The events a `partner` may write from `status`, read off the seeded machine. */
function partnerEvents(status: string): Set<string> {
  return new Set(
    TRANSITIONS.filter(
      (row) => row.from === status && row.allowedActors.includes("partner"),
    ).map((row) => row.event),
  );
}

const NOW = new Date("2026-10-24T09:00:00Z");
const LATER = new Date("2026-10-24T10:00:00Z");
const EARLIER = new Date("2026-10-24T08:00:00Z");

function facts(over: Partial<ActionFacts>): ActionFacts {
  return {
    response: "accept",
    withdrawn: false,
    hasPhoto: false,
    slaExpiresAt: LATER,
    ...over,
  };
}

/** Every status of A6.4 at which `facts` offers `action`. */
function statusesOffering(action: string, over: Partial<ActionFacts>) {
  return STATES.map((state) => state.key)
    .filter((status) =>
      floristActionsFor(facts(over), partnerEvents(status), NOW).includes(
        action as never,
      ),
    )
    .sort();
}

describe("floristActionsFor over the seeded order_transition (AC-29)", () => {
  it("offers each action only in the statuses the machine lets a partner write it from", () => {
    expect(statusesOffering("accept", { response: null })).toEqual(["routed"]);
    expect(statusesOffering("decline", { response: null })).toEqual(["routed"]);
    expect(statusesOffering("outForDelivery", {})).toEqual([
      "in_production",
      "redelivery_scheduled",
    ]);
    expect(statusesOffering("delivered", {})).toEqual(["out_for_delivery"]);
    expect(statusesOffering("addPhoto", {})).toEqual(["delivered"]);
    expect(statusesOffering("addPhoto", { hasPhoto: true })).toEqual([]);
    expect(statusesOffering("delivered", { hasPhoto: true })).toEqual([]);
  });

  it("an open offer shows Decline then Accept until its time, then nothing", () => {
    const routed = partnerEvents("routed");
    expect(floristActionsFor(facts({ response: null }), routed, NOW)).toEqual([
      "decline",
      "accept",
    ]);
    expect(
      floristActionsFor(
        facts({ response: null, slaExpiresAt: EARLIER }),
        routed,
        NOW,
      ),
    ).toEqual([]);
    // The boundary: at the answer-by instant itself the offer has expired.
    expect(
      floristActionsFor(
        facts({ response: null, slaExpiresAt: NOW }),
        routed,
        NOW,
      ),
    ).toEqual([]);
  });

  it("offers nothing to a declined, timed-out or withdrawn assignment, nor accept to an accepted one", () => {
    for (const status of STATES.map((state) => state.key)) {
      const events = partnerEvents(status);
      expect(
        floristActionsFor(facts({ response: "decline" }), events, NOW),
      ).toEqual([]);
      expect(
        floristActionsFor(facts({ response: "timeout" }), events, NOW),
      ).toEqual([]);
      expect(
        floristActionsFor(facts({ withdrawn: true }), events, NOW),
      ).toEqual([]);
      expect(
        floristActionsFor(facts({ response: "accept" }), events, NOW),
      ).not.toContain("accept");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The photo (AC-30)                                                          */
/* -------------------------------------------------------------------------- */

const XMP = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Anna</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

/** A 3000 x 2000 JPEG carrying GPS EXIF, a camera model, XMP, and orientation 6 (rotate 90°). */
async function taggedJpeg(): Promise<Uint8Array> {
  const buffer = await sharp({
    create: {
      width: 3000,
      height: 2000,
      channels: 3,
      background: { r: 200, g: 80, b: 90 },
    },
  })
    .jpeg()
    .withExif({
      IFD0: { Model: "TestCam 1", Copyright: "Florist" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "52/1 13/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "21/1 0/1 0/1",
      },
    })
    .withXmp(XMP)
    .withMetadata({ orientation: 6 })
    .toBuffer();
  return new Uint8Array(buffer);
}

describe("the delivery photo (AC-30, T-30 unit half)", () => {
  it("a GPS- and XMP-tagged JPEG comes out a rotated JPEG of at most 2000 px with no metadata block", async () => {
    const input = await taggedJpeg();
    const before = await sharp(input).metadata();
    // The fixture really carries what must be dropped (a vacuous fixture would prove nothing).
    expect(before.exif?.toString("latin1")).toContain("TestCam");
    expect(before.xmp?.toString()).toContain("Anna");
    expect(before.orientation).toBe(6);

    const out = await processDeliveryPhoto(checkDeliveryPhoto(input));
    const after = await sharp(out.jpeg).metadata();
    expect(after.format).toBe("jpeg");
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.iptc).toBeUndefined();
    expect(after.icc).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    // Orientation 6 turns the 3000 x 2000 landscape upright: 2000 px is now the long edge.
    expect({ width: out.width, height: out.height }).toEqual({
      width: 1333,
      height: 2000,
    });
    expect({ width: after.width, height: after.height }).toEqual({
      width: 1333,
      height: 2000,
    });
    const text = Buffer.from(out.jpeg).toString("latin1");
    for (const marker of ["Exif", "TestCam", "Anna", "GPS", "xpacket"]) {
      expect(text, marker).not.toContain(marker);
    }
    expect(out.bytes).toBe(out.jpeg.byteLength);
    expect(out.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("PNG and WebP are taken; a small photo is not enlarged", async () => {
    for (const format of ["png", "webp"] as const) {
      const input = new Uint8Array(
        await sharp({
          create: {
            width: 400,
            height: 300,
            channels: 3,
            background: { r: 1, g: 2, b: 3 },
          },
        })
          [format]()
          .toBuffer(),
      );
      expect(checkDeliveryPhoto(input).mime).toBe(`image/${format}`);
      const out = await processDeliveryPhoto(checkDeliveryPhoto(input));
      expect((await sharp(out.jpeg).metadata()).format).toBe("jpeg");
      expect({ width: out.width, height: out.height }).toEqual({
        width: 400,
        height: 300,
      });
    }
  });

  it("refuses a GIF, a renamed PDF, an empty file and anything over 15 MiB, by its bytes", async () => {
    const gif = new Uint8Array(
      await sharp({
        create: {
          width: 4,
          height: 4,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .gif()
        .toBuffer(),
    );
    const reason = (body: Uint8Array) => {
      try {
        checkDeliveryPhoto(body);
        return "taken";
      } catch (error) {
        return error instanceof DeliveryPhotoRefused ? error.reason : "thrown";
      }
    };
    expect(reason(gif)).toBe("wrong_type");
    expect(reason(new TextEncoder().encode("%PDF-1.7\n…"))).toBe("wrong_type");
    expect(reason(new Uint8Array())).toBe("missing");
    const jpeg = await taggedJpeg();
    const big = new Uint8Array(16 * MIB);
    big.set(jpeg);
    expect(reason(big)).toBe("too_large");
    const atLimit = new Uint8Array(15 * MIB);
    atLimit.set(jpeg);
    expect(reason(atLimit)).toBe("taken");
  });

  it("JPEG magic bytes over a body that is not one are refused at decode as the wrong type", async () => {
    const fake = new Uint8Array(64);
    fake.set([0xff, 0xd8, 0xff, 0xe0]);
    await expect(
      processDeliveryPhoto(checkDeliveryPhoto(fake)),
    ).rejects.toMatchObject({ reason: "wrong_type" });
  });
});

describe("readPhotoUpload: bounded while streaming (AC-30)", () => {
  function multipart(file: Uint8Array, name = "photo"): Request {
    const form = new FormData();
    form.set(name, new Blob([new Uint8Array(file)]), "IMG_2041.jpg");
    return new Request("https://example.test/upload", {
      method: "POST",
      body: form,
    });
  }

  it("returns the photo field's bytes", async () => {
    const jpeg = await taggedJpeg();
    const read = await readPhotoUpload(multipart(jpeg));
    expect(read).toEqual(jpeg);
  });

  it("a declared length over the bound is refused before a byte is read", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    const request = new Request("https://example.test/upload", {
      method: "POST",
      body,
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(15 * MIB + MULTIPART_OVERHEAD_BYTES + 1),
      },
      duplex: "half",
    } as RequestInit);
    await expect(readPhotoUpload(request)).rejects.toMatchObject({
      reason: "too_large",
    });
    expect(pulled).toBeLessThanOrEqual(1);
  });

  it("an undeclared (chunked) body stops at the bound instead of buffering it all", async () => {
    let sent = 0;
    const chunk = new Uint8Array(MIB);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const request = new Request("https://example.test/upload", {
      method: "POST",
      body,
      headers: { "content-type": "multipart/form-data; boundary=x" },
      duplex: "half",
    } as RequestInit);
    await expect(readPhotoUpload(request)).rejects.toMatchObject({
      reason: "too_large",
    });
    // An endless stream: the read gave up just past 15 MiB plus the framing.
    expect(sent).toBeLessThanOrEqual(17 * MIB);
  });

  it("a photo over 15 MiB inside the framing allowance, or no photo field, is refused", async () => {
    const over = new Uint8Array(15 * MIB + 1);
    await expect(readPhotoUpload(multipart(over))).rejects.toMatchObject({
      reason: "too_large",
    });
    await expect(
      readPhotoUpload(multipart(new Uint8Array([1, 2, 3]), "other")),
    ).rejects.toMatchObject({ reason: "missing" });
    await expect(
      readPhotoUpload(
        new Request("https://example.test/upload", {
          method: "POST",
          body: "photo=x",
          headers: { "content-type": "application/x-www-form-urlencoded" },
        }),
      ),
    ).rejects.toMatchObject({ reason: "missing" });
  });
});

/* -------------------------------------------------------------------------- */
/* The source scan (AC-31, T-31 lint half)                                    */
/* -------------------------------------------------------------------------- */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("no direct status, event or outbox write (AC-31)", () => {
  const files = [
    ...walk(join(ROOT, "src/modules/orders/florist-actions")),
    ...walk(join(ROOT, "src/modules/orders/photo")),
    ...walk(join(ROOT, "src/app/demo/vendor-inbox/api/orders")),
    ...walk(join(ROOT, "src/app/demo/vendor-inbox/orders")),
    join(ROOT, "src/app/demo/vendor-inbox/actions.ts"),
  ];

  it("scans the files this task adds", () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it("none updates a status, inserts an event or an outbox row, or names an arrow label as an event", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/UPDATE\s+"?order"?\s+SET/i);
      expect(text, file).not.toMatch(/set\(\s*\{\s*status/);
      expect(text, file).not.toMatch(/INSERT\s+INTO\s+order_event/i);
      expect(text, file).not.toMatch(/INSERT\s+INTO\s+outbox/i);
      expect(text, file).not.toMatch(/app\.allow_status_write/);
    }
  });
});
