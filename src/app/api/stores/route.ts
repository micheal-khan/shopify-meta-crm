import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { normalizeShopDomain } from "@/lib/shopify/webhooks";
import { exchangeShopifyClientCredentials, missingShopifyOrderReadScopes, registerOrderWebhooks, SHOPIFY_ORDER_READ_SCOPES, ShopifyClientCredentialsError, verifyShopifyConnection } from "@/lib/shopify/admin-api";
import { buildShopifyAuthorizationUrl } from "@/lib/shopify/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().trim().min(2).max(80), shopDomain: z.string().trim().min(4),
  shopifyClientId: z.string().trim().regex(/^[a-f0-9]{32}$/i, "Enter the 32-character Client ID from Shopify Dev Dashboard → Settings, not an email address."),
  shopifyClientSecret: z.string().trim().min(16), datasetId: z.string().trim().optional(), metaAccessToken: z.string().trim().optional(),
  testEventCode: z.string().trim().optional(), historicalSyncDays: z.number().int().min(1).max(60).default(30),
}).refine((value) => Boolean(value.datasetId) === Boolean(value.metaAccessToken), { message: "Meta Dataset ID and access token must be supplied together." });

export async function POST(request: Request) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid store configuration" }, { status: 400 });
  const shopDomain = normalizeShopDomain(parsed.data.shopDomain);
  if (!shopDomain) return Response.json({ error: "Enter the store's myshopify.com domain, for example kyyf0v-ez.myshopify.com." }, { status: 400 });
  let token;
  let verified;
  try {
    token = await exchangeShopifyClientCredentials({ shopDomain, clientId: parsed.data.shopifyClientId, clientSecret: parsed.data.shopifyClientSecret });
    const missingScopes = missingShopifyOrderReadScopes(token.scopes);
    if (missingScopes.length) throw new Error(`The released Shopify app version must include: ${missingScopes.join(", ")}.`);
    verified = await verifyShopifyConnection(shopDomain, token.accessToken);
  }
  catch (error) {
    if (error instanceof ShopifyClientCredentialsError && error.code === "shop_not_permitted") {
      const state = randomBytes(24).toString("base64url");
      const appUrl = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
      const redirectUri = `${appUrl}/api/shopify/oauth/callback`;
      const pendingConnection = encryptSecret(JSON.stringify({
        state,
        actorId: auth.user.id,
        createdAt: Date.now(),
        ...parsed.data,
        shopDomain,
      }));
      const cookieStore = await cookies();
      cookieStore.set("shopify_oauth_pending", pendingConnection, {
        httpOnly: true,
        sameSite: "lax",
        secure: appUrl.startsWith("https://"),
        path: "/",
        maxAge: 10 * 60,
      });
      return Response.json({
        requiresOAuth: true,
        authorizeUrl: buildShopifyAuthorizationUrl({
          shopDomain,
          clientId: parsed.data.shopifyClientId,
          redirectUri,
          state,
          scopes: [...SHOPIFY_ORDER_READ_SCOPES],
        }),
      }, { status: 202 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Shopify connection failed" }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const { data: store, error: storeError } = await admin.from("stores").upsert({
    name: parsed.data.name || verified.shop.name, shop_domain: shopDomain, currency: verified.shop.currencyCode || "INR",
    status: "pending", historical_sync_days: parsed.data.historicalSyncDays, created_by: auth.user.id, updated_at: new Date().toISOString(),
  }, { onConflict: "shop_domain" }).select("id").single();
  if (storeError || !store) return Response.json({ error: storeError?.message ?? "Store could not be saved" }, { status: 500 });
  const { error: connectionError } = await admin.schema("private").from("shopify_connections").upsert({
    store_id: store.id,
    client_id: parsed.data.shopifyClientId,
    encrypted_client_secret: encryptSecret(parsed.data.shopifyClientSecret),
    encrypted_access_token: encryptSecret(token.accessToken),
    webhook_secret_ciphertext: encryptSecret(parsed.data.shopifyClientSecret),
    token_expires_at: token.expiresAt,
    token_refreshed_at: new Date().toISOString(),
    auth_method: "client_credentials",
    scopes: token.scopes,
    shopify_api_version: process.env.SHOPIFY_API_VERSION ?? "2026-07",
    rotated_at: new Date().toISOString(),
  });
  if (connectionError) return Response.json({ error: connectionError.message }, { status: 500 });
  const { data: team } = await admin.from("profiles").select("id,role").neq("role", "admin");
  if (team?.length) {
    const { error: membershipError } = await admin.from("store_members").upsert(team.map((profile) => ({ store_id: store.id, user_id: profile.id })));
    if (membershipError) return Response.json({ error: membershipError.message }, { status: 500 });
  }
  if (parsed.data.datasetId && parsed.data.metaAccessToken) {
    const { error } = await admin.schema("private").from("meta_connections").upsert({
      store_id: store.id, dataset_id: parsed.data.datasetId, encrypted_access_token: encryptSecret(parsed.data.metaAccessToken),
      graph_api_version: process.env.META_GRAPH_API_VERSION ?? "v24.0", test_event_code: parsed.data.testEventCode || null,
      production_send_enabled: false, rotated_at: new Date().toISOString(),
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  await admin.from("audit_logs").insert({ actor_id: auth.user.id, store_id: store.id, action: "store.connected", entity_type: "store", entity_id: store.id,
    metadata: { shop_domain: shopDomain, meta_configured: Boolean(parsed.data.datasetId) } });
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const webhooks = appUrl ? await registerOrderWebhooks({ shopDomain, accessToken: token.accessToken, callbackUrl: `${appUrl}/api/webhooks/shopify` }) : [];
  const { error: statusError } = await admin.from("stores").update({ status: "connected", updated_at: new Date().toISOString() }).eq("id", store.id);
  if (statusError) return Response.json({ error: statusError.message }, { status: 500 });
  return Response.json({ storeId: store.id, verifiedShop: verified.shop.name, tokenExpiresAt: token.expiresAt, webhooks, historicalImportReady: true }, { status: 201 });
}
