import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeShopifyClientCredentials, fetchRecentOrders, missingShopifyOrderReadScopes, SHOPIFY_ORDER_READ_SCOPES } from "./admin-api";

describe("Shopify client credentials grant", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requires the read-only scopes used by the order importer", () => {
    expect(SHOPIFY_ORDER_READ_SCOPES).toEqual(["read_orders"]);
    expect(missingShopifyOrderReadScopes(["read_orders"])).toEqual([]);
  });

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

  it("reconciles by updated time and maps Shopify refund totals", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { orders: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [{ legacyResourceId: "123", name: "#123", createdAt: "2026-08-16T10:00:00Z", updatedAt: "2026-08-17T10:00:00Z",
        currencyCode: "INR", lineItems: { nodes: [] }, refunds: [{ legacyResourceId: "456", createdAt: "2026-08-17T09:00:00Z",
          totalRefundedSet: { shopMoney: { amount: "499.00" } } }] }],
    } } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const orders = await fetchRecentOrders({ shopDomain: "example.myshopify.com", accessToken: "token", days: 7, dateField: "updated_at" });
    const request = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as { variables: { query: string; sortKey: string } };
    expect(request.variables.query).toContain("updated_at:>=");
    expect(request.variables.sortKey).toBe("UPDATED_AT");
    expect(orders[0].refunds).toEqual([{ id: "456", created_at: "2026-08-17T09:00:00Z", transactions: [{ kind: "refund", amount: "499.00" }] }]);
  });
});
