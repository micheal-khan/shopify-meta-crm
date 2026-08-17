import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { registerOrderWebhooks, verifyShopifyConnection } from "@/lib/shopify/admin-api";
import { exchangeShopifyAuthorizationCode, verifyShopifyOAuthHmac } from "@/lib/shopify/oauth";
import { normalizeShopDomain } from "@/lib/shopify/webhooks";
import { createAdminClient } from "@/lib/supabase/admin";

type PendingConnection = {
  state: string;
  actorId: string;
  createdAt: number;
  name: string;
  shopDomain: string;
  shopifyClientId: string;
  shopifyClientSecret: string;
  datasetId?: string;
  metaAccessToken?: string;
  testEventCode?: string;
  historicalSyncDays: number;
};

function storesRedirect(request: Request, key: "shopify" | "shopify_error", value: string) {
  const url = new URL("/stores", request.url);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return storesRedirect(request, "shopify_error", auth.error);

  const cookieStore = await cookies();
  const encryptedPending = cookieStore.get("shopify_oauth_pending")?.value;
  if (!encryptedPending) return storesRedirect(request, "shopify_error", "The Shopify authorization request expired. Start the connection again.");

  let pending: PendingConnection;
  try { pending = JSON.parse(decryptSecret(encryptedPending)) as PendingConnection; }
  catch { return storesRedirect(request, "shopify_error", "The Shopify authorization request could not be verified."); }

  const url = new URL(request.url);
  const shopDomain = normalizeShopDomain(url.searchParams.get("shop"));
  if (!shopDomain || shopDomain !== pending.shopDomain || url.searchParams.get("state") !== pending.state || pending.actorId !== auth.user.id || Date.now() - pending.createdAt > 10 * 60_000) {
    return storesRedirect(request, "shopify_error", "The Shopify authorization request did not match or expired.");
  }
  if (!verifyShopifyOAuthHmac(url.searchParams, pending.shopifyClientSecret)) {
    return storesRedirect(request, "shopify_error", "Shopify callback signature verification failed.");
  }
  const code = url.searchParams.get("code");
  if (!code) return storesRedirect(request, "shopify_error", "Shopify did not provide an authorization code.");

  try {
    const token = await exchangeShopifyAuthorizationCode({
      shopDomain,
      clientId: pending.shopifyClientId,
      clientSecret: pending.shopifyClientSecret,
      code,
    });
    if (!token.scopes.includes("read_orders")) throw new Error("Shopify did not grant the required read_orders scope.");
    const verified = await verifyShopifyConnection(shopDomain, token.accessToken);
    const admin = createAdminClient();
    if (!admin) throw new Error("Database is not configured.");

    const { data: store, error: storeError } = await admin.from("stores").upsert({
      name: pending.name || verified.shop.name,
      shop_domain: shopDomain,
      currency: verified.shop.currencyCode || "INR",
      timezone: verified.shop.timezoneAbbreviation || "Asia/Kolkata",
      status: "pending",
      historical_sync_days: pending.historicalSyncDays,
      created_by: auth.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "shop_domain" }).select("id").single();
    if (storeError || !store) throw new Error(storeError?.message ?? "Store could not be saved.");

    const { error: connectionError } = await admin.schema("private").from("shopify_connections").upsert({
      store_id: store.id,
      client_id: pending.shopifyClientId,
      encrypted_client_secret: encryptSecret(pending.shopifyClientSecret),
      encrypted_access_token: encryptSecret(token.accessToken),
      webhook_secret_ciphertext: encryptSecret(pending.shopifyClientSecret),
      token_expires_at: null,
      token_refreshed_at: new Date().toISOString(),
      auth_method: "authorization_code",
      scopes: token.scopes,
      shopify_api_version: process.env.SHOPIFY_API_VERSION ?? "2026-07",
      rotated_at: new Date().toISOString(),
    });
    if (connectionError) throw new Error(connectionError.message);

    const { data: team } = await admin.from("profiles").select("id,role").neq("role", "admin");
    if (team?.length) {
      const { error } = await admin.from("store_members").upsert(team.map((profile) => ({ store_id: store.id, user_id: profile.id })));
      if (error) throw new Error(error.message);
    }

    if (pending.datasetId && pending.metaAccessToken) {
      const { error } = await admin.schema("private").from("meta_connections").upsert({
        store_id: store.id,
        dataset_id: pending.datasetId,
        encrypted_access_token: encryptSecret(pending.metaAccessToken),
        graph_api_version: process.env.META_GRAPH_API_VERSION ?? "v24.0",
        test_event_code: pending.testEventCode || null,
        production_send_enabled: false,
        rotated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    }

    const webhookBaseUrl = (process.env.SHOPIFY_WEBHOOK_BASE_URL ?? process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
    await registerOrderWebhooks({ shopDomain, accessToken: token.accessToken, callbackUrl: `${webhookBaseUrl}/api/webhooks/shopify` });
    await admin.from("audit_logs").insert({
      actor_id: auth.user.id,
      store_id: store.id,
      action: "store.connected",
      entity_type: "store",
      entity_id: store.id,
      metadata: { shop_domain: shopDomain, auth_method: "authorization_code", meta_configured: Boolean(pending.datasetId) },
    });
    const { error: statusError } = await admin.from("stores").update({ status: "connected", updated_at: new Date().toISOString() }).eq("id", store.id);
    if (statusError) throw new Error(statusError.message);
    cookieStore.delete("shopify_oauth_pending");
    return storesRedirect(request, "shopify", "connected");
  }
  catch (error) {
    return storesRedirect(request, "shopify_error", error instanceof Error ? error.message : "Shopify OAuth connection failed.");
  }
}
