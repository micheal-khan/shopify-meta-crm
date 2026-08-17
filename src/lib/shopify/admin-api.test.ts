import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeShopifyClientCredentials } from "./admin-api";

describe("Shopify client credentials grant", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("exchanges app credentials using form encoding without returning the secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "shpat_test", scope: "read_orders,read_products", expires_in: 86399 }), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const token = await exchangeShopifyClientCredentials({ shopDomain: "example.myshopify.com", clientId: "client-id", clientSecret: "very-secret-value" });
    expect(token.accessToken).toBe("shpat_test");
    expect(token.scopes).toEqual(["read_orders", "read_products"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.myshopify.com/admin/oauth/access_token");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("grant_type=client_credentials");
    expect(token).not.toHaveProperty("clientSecret");
  });

  it("returns an actionable error when the app is not installed or authorized", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 })));
    await expect(exchangeShopifyClientCredentials({ shopDomain: "example.myshopify.com", clientId: "client-id", clientSecret: "very-secret-value" }))
      .rejects.toMatchObject({ code: "invalid_client", message: "Shopify client-credentials exchange failed: invalid_client." });
  });

  it("detects when Shopify requires the authorization-code flow", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<title>400 - Oauth error shop_not_permitted</title>", { status: 400 })));
    await expect(exchangeShopifyClientCredentials({ shopDomain: "example.myshopify.com", clientId: "client-id", clientSecret: "very-secret-value" }))
      .rejects.toMatchObject({ code: "shop_not_permitted" });
  });
});
