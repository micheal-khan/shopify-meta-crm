import "server-only";

import { createHash } from "node:crypto";
import { buildPurchaseEvent } from "@/lib/meta/conversions";
import { createAdminClient } from "@/lib/supabase/admin";

type ShopifyOrder = Record<string, unknown> & {
  id: number | string;
  name?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  total_price?: unknown;
  subtotal_price?: unknown;
  total_discounts?: unknown;
  total_tax?: unknown;
  currency?: unknown;
  line_items?: Array<Record<string, unknown>>;
};

const asObject = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asString = (value: unknown) => value == null ? null : String(value);
const asNumber = (value: unknown) => Number(value ?? 0) || 0;

function noteValue(order: ShopifyOrder, names: string[]) {
  const attributes = Array.isArray(order.note_attributes) ? order.note_attributes : [];
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const raw of attributes) {
    const attribute = asObject(raw);
    if (wanted.has(String(attribute.name ?? "").toLowerCase())) return asString(attribute.value);
  }
  return null;
}

function tracking(order: ShopifyOrder) {
  const landingSite = asString(order.landing_site);
  let params = new URLSearchParams();
  try { params = new URL(landingSite ?? "", "https://shop.invalid").searchParams; } catch { /* malformed Shopify landing URL */ }
  const get = (name: string) => noteValue(order, [name, `_${name}`]) ?? params.get(name);
  return {
    landingSite,
    utm_source: get("utm_source"), utm_medium: get("utm_medium"), utm_campaign: get("utm_campaign"),
    utm_content: get("utm_content"), utm_term: get("utm_term"),
    fbp: noteValue(order, ["_fbp", "fbp"]), fbc: noteValue(order, ["_fbc", "fbc"]),
    eventId: noteValue(order, ["event_id", "meta_event_id", "fb_event_id"]),
  };
}

function orderStatus(order: ShopifyOrder) {
  if (order.cancelled_at) return "cancelled";
  if (order.financial_status === "refunded") return "refunded";
  if (order.financial_status === "partially_refunded") return "partially_refunded";
  if (order.fulfillment_status === "fulfilled") return "fulfilled";
  return "open";
}

export async function ingestShopifyOrder(args: { storeId: string; shopDomain: string; order: ShopifyOrder; queueMeta: boolean }) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  const order = args.order;
  const address = asObject(order.shipping_address);
  const billing = asObject(order.billing_address);
  const customer = asObject(order.customer);
  const trackingData = tracking(order);
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
  const gateways = Array.isArray(order.payment_gateway_names) ? order.payment_gateway_names.map(String) : [];
  const shippingLines = Array.isArray(order.shipping_lines) ? order.shipping_lines : [];
  const shippingTotal = shippingLines.reduce((sum, line) => sum + asNumber(asObject(line).price), 0);
  const shopifyId = String(order.id);
  const createdAt = asString(order.created_at) ?? new Date().toISOString();
  const refunds = Array.isArray(order.refunds) ? order.refunds : [];
  const refundEntries = refunds.map((rawRefund, index) => {
    const refund = asObject(rawRefund); const transactions = Array.isArray(refund.transactions) ? refund.transactions : [];
    const amount = transactions.reduce((transactionSum, rawTransaction) => {
      const transaction = asObject(rawTransaction);
      return transactionSum + (/refund/i.test(String(transaction.kind ?? "refund")) ? asNumber(transaction.amount) : 0);
    }, 0);
    return { shopify_refund_id: String(refund.id ?? `${shopifyId}${index}`), amount, shopify_created_at: asString(refund.created_at) };
  }).filter((entry) => entry.amount > 0);
  const { data: existingOrder } = await admin.from("orders").select("refunded_total").eq("store_id", args.storeId).eq("shopify_order_id", shopifyId).maybeSingle();
  const { data: savedOrder, error: orderError } = await admin.from("orders").upsert({
    store_id: args.storeId,
    shopify_order_id: shopifyId,
    shopify_order_number: asString(order.name) ?? `#${shopifyId}`,
    status: orderStatus(order), financial_status: asString(order.financial_status), fulfillment_status: asString(order.fulfillment_status),
    source_name: asString(order.source_name), currency: asString(order.currency) ?? "INR",
    subtotal: asNumber(order.subtotal_price), discount_total: asNumber(order.total_discounts), shipping_total: shippingTotal,
    tax_total: asNumber(order.total_tax), total: asNumber(order.total_price), refunded_total: Number(existingOrder?.refunded_total ?? 0),
    item_count: lineItems.reduce((sum, line) => sum + asNumber(asObject(line).quantity), 0),
    is_cod: gateways.some((gateway) => /cod|cash on delivery/i.test(gateway)),
    utm_source: trackingData.utm_source, utm_medium: trackingData.utm_medium, utm_campaign: trackingData.utm_campaign,
    utm_content: trackingData.utm_content, utm_term: trackingData.utm_term,
    landing_site: trackingData.landingSite, referring_site: asString(order.referring_site),
    shopify_created_at: createdAt, cancelled_at: asString(order.cancelled_at), closed_at: asString(order.closed_at),
    updated_at: new Date().toISOString(),
  }, { onConflict: "store_id,shopify_order_id" }).select("id").single();
  if (orderError || !savedOrder) throw new Error(`Order persistence failed: ${orderError?.message ?? "unknown error"}`);

  if (refundEntries.length) {
    await admin.from("order_refunds").upsert(refundEntries.map((entry) => ({ order_id: savedOrder.id, ...entry })), { onConflict: "order_id,shopify_refund_id" });
    const { data: savedRefunds } = await admin.from("order_refunds").select("amount").eq("order_id", savedOrder.id);
    const totalRefunded = (savedRefunds ?? []).reduce((sum, refund) => sum + Number(refund.amount), 0);
    await admin.from("orders").update({ refunded_total: totalRefunded, status: totalRefunded >= asNumber(order.total_price) ? "refunded" : "partially_refunded" }).eq("id", savedOrder.id).neq("status", "cancelled");
  }

  const email = asString(order.email) ?? asString(customer.email);
  const phone = asString(order.phone) ?? asString(address.phone) ?? asString(billing.phone) ?? asString(customer.phone);
  const client = asObject(order.client_details);
  const { error: detailError } = await admin.schema("private").from("order_details").upsert({
    order_id: savedOrder.id, customer_shopify_id: customer.id ? String(customer.id) : null,
    email, phone, customer_first_name: asString(customer.first_name), customer_last_name: asString(customer.last_name),
    billing_address: order.billing_address ?? null, shipping_address: order.shipping_address ?? null,
    client_ip: asString(order.browser_ip) ?? asString(client.browser_ip), user_agent: asString(client.user_agent),
    fbp: trackingData.fbp, fbc: trackingData.fbc, shopify_payload: order, updated_at: new Date().toISOString(),
  });
  if (detailError) throw new Error(`Private order persistence failed: ${detailError.message}`);

  await admin.from("order_items").delete().eq("order_id", savedOrder.id);
  if (lineItems.length) {
    const { error: itemsError } = await admin.from("order_items").insert(lineItems.map((raw, index) => {
      const line = asObject(raw);
      return { order_id: savedOrder.id, shopify_line_item_id: String(line.id ?? `${shopifyId}${index}`), product_id: line.product_id ? String(line.product_id) : null,
        variant_id: line.variant_id ? String(line.variant_id) : null, title: String(line.title ?? "Item"), variant_title: asString(line.variant_title),
        sku: asString(line.sku), quantity: Math.max(1, asNumber(line.quantity)), unit_price: asNumber(line.price), total_discount: asNumber(line.total_discount) };
    }));
    if (itemsError) throw new Error(`Order items persistence failed: ${itemsError.message}`);
  }

  if (args.queueMeta && orderStatus(order) === "open" && asNumber(order.total_price) > 0) {
    const { data: metaConnection } = await admin.schema("private").from("meta_connections").select("store_id").eq("store_id", args.storeId).maybeSingle();
    if (metaConnection) {
      const eventId = trackingData.eventId ?? `shopify_${args.shopDomain}_${shopifyId}`;
      const event = buildPurchaseEvent({ eventId, eventTime: Math.floor(new Date(createdAt).getTime() / 1000), sourceUrl: trackingData.landingSite ?? undefined,
        currency: asString(order.currency) ?? "INR", value: asNumber(order.total_price), orderId: asString(order.name) ?? shopifyId,
        email, phone, clientIp: asString(order.browser_ip) ?? asString(client.browser_ip), userAgent: asString(client.user_agent), fbp: trackingData.fbp, fbc: trackingData.fbc });
      const { data: metaEvent, error: eventError } = await admin.from("meta_events").upsert({
        store_id: args.storeId, order_id: savedOrder.id, event_id: eventId, status: "queued", is_test: true,
      }, { onConflict: "store_id,event_id", ignoreDuplicates: true }).select("id").maybeSingle();
      if (eventError) throw new Error(`Meta queue persistence failed: ${eventError.message}`);
      if (metaEvent) {
        const serialized = JSON.stringify(event);
        await admin.schema("private").from("meta_event_payloads").insert({ event_id: metaEvent.id, payload: event,
          payload_sha256: createHash("sha256").update(serialized).digest("hex") });
      }
    }
  }
  return savedOrder.id as string;
}

export async function processWebhookReceipt(webhookId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  const { data: receipt } = await admin.from("shopify_webhooks").select("id,store_id,topic,attempt_count,stores(shop_domain)").eq("id", webhookId).single();
  const { data: stored } = await admin.schema("private").from("shopify_webhook_payloads").select("payload").eq("webhook_id", webhookId).single();
  if (!receipt || !stored) throw new Error("Webhook receipt or payload is missing.");
  const storeRelation = receipt.stores as unknown as { shop_domain?: string } | null;
  const attempt = Number(receipt.attempt_count ?? 0) + 1;
  await admin.from("shopify_webhooks").update({ status: "processing", attempt_count: attempt, updated_at: new Date().toISOString() }).eq("id", webhookId);
  try {
    if (String(receipt.topic).startsWith("orders/")) {
      await ingestShopifyOrder({ storeId: receipt.store_id, shopDomain: storeRelation?.shop_domain ?? "unknown.myshopify.com",
        order: stored.payload as ShopifyOrder, queueMeta: receipt.topic === "orders/create" });
    } else if (receipt.topic === "refunds/create") {
      const refund = stored.payload as Record<string, unknown>;
      const transactions = Array.isArray(refund.transactions) ? refund.transactions : [];
      const refundAmount = transactions.reduce((sum, raw) => sum + asNumber(asObject(raw).amount), 0);
      const shopifyOrderId = asString(refund.order_id);
      const shopifyRefundId = asString(refund.id);
      if (shopifyOrderId && shopifyRefundId && refundAmount > 0) {
        const { data: order } = await admin.from("orders").select("id,total,refunded_total").eq("store_id", receipt.store_id).eq("shopify_order_id", shopifyOrderId).single();
        if (order) {
          await admin.from("order_refunds").upsert({ order_id: order.id, shopify_refund_id: shopifyRefundId, amount: refundAmount, shopify_created_at: asString(refund.created_at) }, { onConflict: "order_id,shopify_refund_id" });
          const { data: savedRefunds } = await admin.from("order_refunds").select("amount").eq("order_id", order.id);
          const totalRefunded = (savedRefunds ?? []).reduce((sum, savedRefund) => sum + Number(savedRefund.amount), 0);
          await admin.from("orders").update({ refunded_total: totalRefunded, status: totalRefunded >= Number(order.total) ? "refunded" : "partially_refunded", updated_at: new Date().toISOString() }).eq("id", order.id);
        }
      }
    } else if (receipt.topic === "app/uninstalled") {
      await admin.from("stores").update({ status: "disabled", send_new_orders_to_meta: false, updated_at: new Date().toISOString() }).eq("id", receipt.store_id);
      await admin.from("notifications").insert({ store_id: receipt.store_id, level: "warning", title: "Shopify app uninstalled",
        message: "Shopify synchronization and Meta event creation have been disabled for this store.", link: "/stores" });
    }
    await admin.from("shopify_webhooks").update({ status: "processed", processed_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() }).eq("id", webhookId);
  } catch (error) {
    await admin.from("shopify_webhooks").update({ status: "failed", error_message: error instanceof Error ? error.message.slice(0, 1000) : "Unknown processing error",
      next_attempt_at: new Date(Date.now() + Math.min(24 * 60, 2 ** Math.min(attempt, 10)) * 60_000).toISOString(), updated_at: new Date().toISOString() }).eq("id", webhookId);
    await admin.from("notifications").insert({ store_id: receipt.store_id, level: "error", title: "Shopify webhook processing failed",
      message: `The ${receipt.topic} webhook is queued for retry.`, link: "/notifications" });
    throw error;
  }
}

export async function processReadyWebhooks(limit = 25, storeIds?: string[]) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  let query = admin.from("shopify_webhooks").select("id").in("status", ["received", "failed"]).lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit);
  if (storeIds) {
    if (!storeIds.length) return [];
    query = query.in("store_id", storeIds);
  }
  const { data } = await query;
  const results = [];
  for (const receipt of data ?? []) {
    try { await processWebhookReceipt(receipt.id); results.push({ id: receipt.id, processed: true }); }
    catch (error) { results.push({ id: receipt.id, error: error instanceof Error ? error.message : "Unknown error" }); }
  }
  return results;
}
