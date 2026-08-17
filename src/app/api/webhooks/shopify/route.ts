import { normalizeShopDomain, verifyShopifyWebhook } from "@/lib/shopify/webhooks";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { after } from "next/server";
import { decryptSecret } from "@/lib/crypto";
import { processWebhookReceipt } from "@/lib/shopify/orders";
import { processReadyMetaEvents } from "@/lib/meta/processor";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const shop = normalizeShopDomain(request.headers.get("x-shopify-shop-domain"));
  const topic = request.headers.get("x-shopify-topic");
  const webhookId = request.headers.get("x-shopify-webhook-id");
  const signature = request.headers.get("x-shopify-hmac-sha256");
  if (!shop || !topic || !webhookId) return Response.json({ error: "Invalid Shopify webhook headers" }, { status: 401 });

  const supabase = createAdminClient();
  if (!supabase) return Response.json({ error: "Webhook storage is not configured" }, { status: 503 });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const { data: store, error: storeError } = await supabase.from("stores").select("id").eq("shop_domain", shop).maybeSingle();
  if (storeError) return Response.json({ error: "Store lookup failed" }, { status: 503 });
  if (!store) return Response.json({ error: "Store is not connected" }, { status: 404 });
  const { data: connection } = await supabase.schema("private").from("shopify_connections").select("webhook_secret_ciphertext").eq("store_id", store.id).maybeSingle();
  let secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (connection?.webhook_secret_ciphertext) {
    try { secret = decryptSecret(connection.webhook_secret_ciphertext); } catch { return Response.json({ error: "Webhook verification is unavailable" }, { status: 503 }); }
  }
  if (!secret || !verifyShopifyWebhook(rawBody, signature, secret)) return Response.json({ error: "Invalid Shopify webhook" }, { status: 401 });

  const payloadHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const { data: receipt, error: receiptError } = await supabase.from("shopify_webhooks").upsert({
    store_id: store.id,
    shopify_webhook_id: webhookId,
    topic,
    payload_sha256: payloadHash,
  }, { onConflict: "store_id,shopify_webhook_id", ignoreDuplicates: true }).select("id").maybeSingle();

  if (receiptError) return Response.json({ error: "Webhook receipt could not be persisted" }, { status: 503 });
  if (!receipt) return Response.json({ accepted: true, duplicate: true }, { status: 200 });

  const { error: payloadError } = await supabase.schema("private").from("shopify_webhook_payloads").insert({ webhook_id: receipt.id, payload });
  if (payloadError) {
    await supabase.from("shopify_webhooks").update({ status: "failed", error_message: "Payload persistence failed" }).eq("id", receipt.id);
    return Response.json({ error: "Webhook payload could not be persisted" }, { status: 503 });
  }

  after(async () => {
    try {
      await processWebhookReceipt(receipt.id);
      await processReadyMetaEvents(10);
    } catch {
      // Durable receipt and retry metadata already record the failure.
    }
  });

  return Response.json({ accepted: true }, { status: 202 });
}
