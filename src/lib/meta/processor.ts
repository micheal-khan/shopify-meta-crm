import "server-only";

import { decryptSecret } from "@/lib/crypto";
import { isProductionMetaEnabled } from "@/lib/env";
import { sendPurchaseToMeta } from "@/lib/meta/conversions";
import { createAdminClient } from "@/lib/supabase/admin";

type MetaBody = { events_received?: number; fbtrace_id?: string; messages?: string[] };

export async function processMetaEvent(eventId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  const { data: row } = await admin.from("meta_events").select("id,store_id,status,attempt_count").eq("id", eventId).single();
  if (!row || !["queued", "failed"].includes(row.status)) return { skipped: true };
  const [{ data: connection }, { data: stored }, { data: store }] = await Promise.all([
    admin.schema("private").from("meta_connections").select("dataset_id,encrypted_access_token,test_event_code,production_send_enabled").eq("store_id", row.store_id).single(),
    admin.schema("private").from("meta_event_payloads").select("payload").eq("event_id", row.id).single(),
    admin.from("stores").select("send_new_orders_to_meta").eq("id", row.store_id).single(),
  ]);
  if (!connection || !stored || !store) throw new Error("Meta connection, payload, or store is missing.");
  const production = isProductionMetaEnabled();
  if (production && (!connection.production_send_enabled || !store.send_new_orders_to_meta)) {
    throw new Error("Meta production sending is locked by the per-store safety gates.");
  }
  if (!production && !connection.test_event_code) throw new Error("A Meta Test Event code is required while production is locked.");
  const attempt = Number(row.attempt_count ?? 0) + 1;
  await admin.from("meta_events").update({ status: "processing", attempt_count: attempt, last_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id);
  try {
    const result = await sendPurchaseToMeta({ datasetId: connection.dataset_id, accessToken: decryptSecret(connection.encrypted_access_token),
      event: stored.payload as Parameters<typeof sendPurchaseToMeta>[0]["event"], testEventCode: connection.test_event_code ?? undefined });
    const body = result.body as MetaBody;
    await admin.from("meta_events").update({ status: "sent", sent_at: new Date().toISOString(), response_code: result.status,
      response_message: `Accepted ${body.events_received ?? 0} event(s) in ${result.mode} mode`, meta_trace_id: body.fbtrace_id ?? null,
      is_test: result.mode === "test", updated_at: new Date().toISOString() }).eq("id", row.id);
    return { sent: true, mode: result.mode };
  } catch (error) {
    const delayMinutes = Math.min(24 * 60, 2 ** Math.min(attempt, 10));
    await admin.from("meta_events").update({ status: "failed", response_message: error instanceof Error ? error.message.slice(0, 1000) : "Unknown Meta error",
      next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id);
    if (attempt === 1) await admin.from("notifications").insert({ store_id: row.store_id, level: "error", title: "Meta Purchase delivery failed",
      message: "The event is queued with exponential backoff and can also be retried by an Operator.", link: "/meta-events" });
    throw error;
  }
}

export async function processReadyMetaEvents(limit = 25, storeIds?: string[]) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  let query = admin.from("meta_events").select("id").in("status", ["queued", "failed"]).lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit);
  if (storeIds) {
    if (!storeIds.length) return [];
    query = query.in("store_id", storeIds);
  }
  const { data } = await query;
  const results = [];
  for (const event of data ?? []) {
    try { results.push({ id: event.id, ...(await processMetaEvent(event.id)) }); }
    catch (error) { results.push({ id: event.id, error: error instanceof Error ? error.message : "Unknown error" }); }
  }
  return results;
}
