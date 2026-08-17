import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type GraphQLError = { message?: string };

type ClientCredentialsToken = {
  accessToken: string;
  scopes: string[];
  expiresAt: string;
};

export async function exchangeShopifyClientCredentials(args: { shopDomain: string; clientId: string; clientSecret: string }): Promise<ClientCredentialsToken> {
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: args.clientId, client_secret: args.clientSecret });
  const response = await fetch(`https://${args.shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { access_token?: string; scope?: string; expires_in?: number; error?: string; error_description?: string } | null;
  if (!response.ok || !payload?.access_token || !payload.expires_in) {
    const reason = payload?.error_description ?? payload?.error ?? `HTTP ${response.status}`;
    throw new Error(`Shopify client-credentials exchange failed: ${reason}. Release the app version, include read_orders, and install the app on this store in the Dev Dashboard before retrying.`);
  }
  return {
    accessToken: payload.access_token,
    scopes: (payload.scope ?? "").split(",").map((scope) => scope.trim()).filter(Boolean),
    expiresAt: new Date(Date.now() + payload.expires_in * 1000).toISOString(),
  };
}

export async function getShopifyAccessToken(storeId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  const [{ data: store }, { data: connection }] = await Promise.all([
    admin.from("stores").select("shop_domain").eq("id", storeId).single(),
    admin.schema("private").from("shopify_connections").select("client_id,encrypted_client_secret,encrypted_access_token,token_expires_at,auth_method").eq("store_id", storeId).single(),
  ]);
  if (!store || !connection) throw new Error("Shopify connection was not found.");

  if (connection.auth_method === "legacy_access_token") return decryptSecret(connection.encrypted_access_token);
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 30 * 60_000) return decryptSecret(connection.encrypted_access_token);
  if (!connection.client_id || !connection.encrypted_client_secret) throw new Error("Shopify Client ID or Client Secret is missing.");

  const token = await exchangeShopifyClientCredentials({
    shopDomain: store.shop_domain,
    clientId: connection.client_id,
    clientSecret: decryptSecret(connection.encrypted_client_secret),
  });
  const { error } = await admin.schema("private").from("shopify_connections").update({
    encrypted_access_token: encryptSecret(token.accessToken),
    token_expires_at: token.expiresAt,
    token_refreshed_at: new Date().toISOString(),
    scopes: token.scopes,
  }).eq("store_id", storeId);
  if (error) throw new Error(`Refreshed Shopify token could not be stored: ${error.message}`);
  return token.accessToken;
}

export async function shopifyGraphql<T>(args: { shopDomain: string; accessToken: string; query: string; variables?: Record<string, unknown> }) {
  const version = process.env.SHOPIFY_API_VERSION ?? "2026-07";
  const response = await fetch(`https://${args.shopDomain}/admin/api/${version}/graphql.json`, {
    method: "POST", headers: { "content-type": "application/json", "x-shopify-access-token": args.accessToken },
    body: JSON.stringify({ query: args.query, variables: args.variables ?? {} }), cache: "no-store",
  });
  const body = await response.json() as { data?: T; errors?: GraphQLError[] };
  if (!response.ok || body.errors?.length || !body.data) {
    throw new Error(body.errors?.map((error) => error.message).filter(Boolean).join("; ") || `Shopify Admin API returned HTTP ${response.status}.`);
  }
  return body.data;
}

export async function verifyShopifyConnection(shopDomain: string, accessToken: string) {
  return shopifyGraphql<{ shop: { name: string; currencyCode: string; timezoneAbbreviation: string } }>({
    shopDomain, accessToken, query: `query VerifyShop { shop { name currencyCode timezoneAbbreviation } }`,
  });
}

export async function registerOrderWebhooks(args: { shopDomain: string; accessToken: string; callbackUrl: string }) {
  const mutation = `mutation RegisterWebhook($topic: WebhookSubscriptionTopic!, $webhook: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhook) {
      webhookSubscription { id topic uri }
      userErrors { field message }
    }
  }`;
  const topics = ["ORDERS_CREATE", "ORDERS_UPDATED", "ORDERS_CANCELLED", "REFUNDS_CREATE", "APP_UNINSTALLED"];
  const existing = await shopifyGraphql<{ webhookSubscriptions: { nodes: Array<{ topic: string; uri: string }> } }>({
    shopDomain: args.shopDomain,
    accessToken: args.accessToken,
    query: `query ExistingWebhooks { webhookSubscriptions(first: 250) { nodes { topic uri } } }`,
  });
  const results = [];
  for (const topic of topics) {
    if (existing.webhookSubscriptions.nodes.some((subscription) => subscription.topic === topic && subscription.uri === args.callbackUrl)) {
      results.push({ topic, ok: true, message: "Already registered" });
      continue;
    }
    try {
      const data = await shopifyGraphql<{ webhookSubscriptionCreate: { webhookSubscription: unknown; userErrors: Array<{ message: string }> } }>({
        shopDomain: args.shopDomain, accessToken: args.accessToken, query: mutation,
        variables: { topic, webhook: { uri: args.callbackUrl, format: "JSON" } },
      });
      const errors = data.webhookSubscriptionCreate.userErrors;
      results.push({ topic, ok: errors.length === 0, message: errors.map((error) => error.message).join("; ") });
    } catch (error) { results.push({ topic, ok: false, message: error instanceof Error ? error.message : "Unknown error" }); }
  }
  return results;
}

type Money = { amount: string };
type OrderNode = Record<string, unknown> & {
  legacyResourceId: string; name: string; createdAt: string; displayFinancialStatus?: string; displayFulfillmentStatus?: string;
  currencyCode: string; currentSubtotalPriceSet?: { shopMoney: Money }; currentTotalPriceSet?: { shopMoney: Money };
  currentTotalDiscountsSet?: { shopMoney: Money }; currentTotalTaxSet?: { shopMoney: Money }; totalShippingPriceSet?: { shopMoney: Money };
  lineItems: { nodes: Array<Record<string, unknown>> };
};

export async function fetchRecentOrders(args: { shopDomain: string; accessToken: string; days: number }) {
  const query = `query RecentOrders($cursor: String, $query: String!) {
    orders(first: 100, after: $cursor, query: $query, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        legacyResourceId name createdAt updatedAt cancelledAt closedAt email phone currencyCode
        displayFinancialStatus displayFulfillmentStatus paymentGatewayNames noteAttributes { name value }
        currentSubtotalPriceSet { shopMoney { amount } }
        currentTotalPriceSet { shopMoney { amount } }
        currentTotalDiscountsSet { shopMoney { amount } }
        currentTotalTaxSet { shopMoney { amount } }
        totalShippingPriceSet { shopMoney { amount } }
        customer { legacyResourceId firstName lastName email phone }
        shippingAddress { firstName lastName address1 address2 city province zip country phone }
        billingAddress { firstName lastName address1 address2 city province zip country phone }
        lineItems(first: 100) { nodes {
          legacyResourceId title variantTitle sku quantity
          originalUnitPriceSet { shopMoney { amount } }
          totalDiscountSet { shopMoney { amount } }
          product { legacyResourceId } variant { legacyResourceId }
        } }
      }
    }
  }`;
  const since = new Date(Date.now() - args.days * 86_400_000).toISOString();
  const collected: OrderNode[] = [];
  let cursor: string | null = null;
  do {
    const data: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: OrderNode[] } } = await shopifyGraphql({
      shopDomain: args.shopDomain, accessToken: args.accessToken, query, variables: { cursor, query: `created_at:>=${since}` },
    });
    collected.push(...data.orders.nodes);
    cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
  } while (cursor && collected.length < 10_000);
  return collected.map((node) => ({
    id: node.legacyResourceId, name: node.name, created_at: node.createdAt, updated_at: node.updatedAt,
    cancelled_at: node.cancelledAt, closed_at: node.closedAt, email: node.email, phone: node.phone, currency: node.currencyCode,
    financial_status: node.displayFinancialStatus?.toLowerCase(),
    fulfillment_status: node.displayFulfillmentStatus === "FULFILLED" ? "fulfilled" : node.displayFulfillmentStatus?.toLowerCase(),
    payment_gateway_names: node.paymentGatewayNames, note_attributes: node.noteAttributes,
    subtotal_price: node.currentSubtotalPriceSet?.shopMoney.amount ?? "0", total_price: node.currentTotalPriceSet?.shopMoney.amount ?? "0",
    total_discounts: node.currentTotalDiscountsSet?.shopMoney.amount ?? "0", total_tax: node.currentTotalTaxSet?.shopMoney.amount ?? "0",
    shipping_lines: [{ price: node.totalShippingPriceSet?.shopMoney.amount ?? "0" }], customer: mapCustomer(node.customer),
    shipping_address: node.shippingAddress, billing_address: node.billingAddress,
    line_items: node.lineItems.nodes.map((line) => ({
      id: line.legacyResourceId, title: line.title, variant_title: line.variantTitle, sku: line.sku, quantity: line.quantity,
      price: (line.originalUnitPriceSet as { shopMoney?: Money } | undefined)?.shopMoney?.amount ?? "0",
      total_discount: (line.totalDiscountSet as { shopMoney?: Money } | undefined)?.shopMoney?.amount ?? "0",
      product_id: (line.product as { legacyResourceId?: string } | undefined)?.legacyResourceId,
      variant_id: (line.variant as { legacyResourceId?: string } | undefined)?.legacyResourceId,
    })),
  }));
}

function mapCustomer(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const customer = value as Record<string, unknown>;
  return { id: customer.legacyResourceId, first_name: customer.firstName, last_name: customer.lastName, email: customer.email, phone: customer.phone };
}
