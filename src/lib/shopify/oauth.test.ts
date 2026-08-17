import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildShopifyAuthorizationUrl, exchangeShopifyAuthorizationCode, verifyShopifyOAuthHmac } from "./oauth";

describe("Shopify authorization-code OAuth", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds an offline authorization request with the required scope", () => {
    const url = new URL(buildShopifyAuthorizationUrl({
      shopDomain: "example.myshopify.com", clientId: "client-id", redirectUri: "https://crm.example.com/api/shopify/oauth/callback",
      state: "nonce", scopes: ["read_orders"],
    }));
    expect(url.origin).toBe("https://example.myshopify.com");
    expect(url.searchParams.get("scope")).toBe("read_orders");
    expect(url.searchParams.has("grant_options[]")).toBe(false);
  });

  it("verifies Shopify callback HMACs", () => {
    const secret = "test-secret";
    const params = new URLSearchParams({ code: "code", shop: "example.myshopify.com", state: "nonce", timestamp: "123" });
    const message = [...params.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("&");
    params.set("hmac", createHmac("sha256", secret).update(message).digest("hex"));
    expect(verifyShopifyOAuthHmac(params, secret)).toBe(true);
    params.set("state", "tampered");
    expect(verifyShopifyOAuthHmac(params, secret)).toBe(false);
  });

  it("exchanges the authorization code for an offline token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "shpat_test", scope: "read_orders" }), { status: 200 })));
    const token = await exchangeShopifyAuthorizationCode({ shopDomain: "example.myshopify.com", clientId: "client-id", clientSecret: "secret", code: "code" });
    expect(token).toEqual({ accessToken: "shpat_test", scopes: ["read_orders"] });
  });
});
