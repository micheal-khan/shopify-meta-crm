import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export function buildShopifyAuthorizationUrl(args: {
  shopDomain: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
}) {
  const url = new URL(`https://${args.shopDomain}/admin/oauth/authorize`);
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("scope", args.scopes.join(","));
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("state", args.state);
  return url.toString();
}

export function verifyShopifyOAuthHmac(searchParams: URLSearchParams, clientSecret: string) {
  const received = searchParams.get("hmac");
  if (!received) return false;
  const message = [...searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const expected = createHmac("sha256", clientSecret).update(message, "utf8").digest("hex");
  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function exchangeShopifyAuthorizationCode(args: {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
  code: string;
}) {
  const response = await fetch(`https://${args.shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: args.clientId, client_secret: args.clientSecret, code: args.code }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { access_token?: string; scope?: string; error?: string; error_description?: string } | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description ?? payload?.error ?? `Shopify OAuth token exchange returned HTTP ${response.status}.`);
  }
  return {
    accessToken: payload.access_token,
    scopes: (payload.scope ?? "").split(",").map((scope) => scope.trim()).filter(Boolean),
  };
}
