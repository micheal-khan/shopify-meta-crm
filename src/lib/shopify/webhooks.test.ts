import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeShopDomain, verifyShopifyWebhook } from "./webhooks";

describe("Shopify webhook security", () => {
  it("accepts only the correct HMAC over the raw body", () => {
    const body = JSON.stringify({ id: 123, name: "#1001" }); const secret = "test-secret";
    const signature = createHmac("sha256", secret).update(body).digest("base64");
    expect(verifyShopifyWebhook(body, signature, secret)).toBe(true);
    expect(verifyShopifyWebhook(`${body} `, signature, secret)).toBe(false);
    expect(verifyShopifyWebhook(body, null, secret)).toBe(false);
  });
  it("normalizes only valid myshopify domains", () => {
    expect(normalizeShopDomain("  STORE-1.myshopify.com ")).toBe("store-1.myshopify.com");
    expect(normalizeShopDomain("store.example.com")).toBeNull();
  });
});
