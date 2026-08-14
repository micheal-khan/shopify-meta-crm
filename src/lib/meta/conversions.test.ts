import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildPurchaseEvent } from "./conversions";

describe("Meta Purchase payload", () => {
  it("hashes normalized identifiers and preserves deduplication fields", () => {
    const event = buildPurchaseEvent({ eventId: "shared-123", eventTime: 1_700_000_000, currency: "INR", value: 999,
      orderId: "#1001", email: " Customer@Example.com ", phone: "+91 98765 43210", fbp: "fb.1.123.456" });
    expect(event.event_id).toBe("shared-123");
    expect(event.custom_data).toEqual({ currency: "INR", value: 999, order_id: "#1001" });
    expect(event.user_data.em).toEqual([createHash("sha256").update("customer@example.com").digest("hex")]);
    expect(event.user_data.ph).toEqual([createHash("sha256").update("919876543210").digest("hex")]);
  });
});
