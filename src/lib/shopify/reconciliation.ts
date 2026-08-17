import "server-only";

import { fetchRecentOrders, getShopifyAccessToken } from "@/lib/shopify/admin-api";
import { ingestShopifyOrder, processReadyWebhooks } from "@/lib/shopify/orders";
import { createAdminClient } from "@/lib/supabase/admin";

export const RECONCILIATION_RESOURCE = "orders_reconciliation";

export type ShopifyReconciliationRun = {
  id: string;
  store_id: string;
  status: "queued" | "running" | "completed" | "failed";
  total_items: number | null;
  processed_items: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export async function queueOrderReconciliation(args: { storeId: string; requestedBy?: string | null }) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Database is not configured.");
  const { data: store } = await admin.from("stores").select("id,shop_domain,status").eq("id", args.storeId).single();
  if (!store) throw new Error("Store connection was not found.");
  if (store.status !== "connected") throw new Error("Shopify authorization is required before reconciliation.");

  const now = new Date();
  const staleBefore = new Date(now.getTime() - 15 * 60_000).toISOString();
  await admin.from("sync_runs").update({
    status: "failed", error_message: "Reconciliation worker timed out. Please retry.", completed_at: now.toISOString(), updated_at: now.toISOString(),
  }).eq("store_id", args.storeId).eq("resource", RECONCILIATION_RESOURCE).in("status", ["queued", "running"]).lt("updated_at", staleBefore);

  const { data: activeRun } = await admin.from("sync_runs").select("*").eq("store_id", args.storeId)
    .eq("resource", RECONCILIATION_RESOURCE).in("status", ["queued", "running"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (activeRun) return { run: activeRun as ShopifyReconciliationRun, alreadyRunning: true, store };

  const { data: run, error } = await admin.from("sync_runs").insert({
    store_id: args.storeId, requested_by: args.requestedBy ?? null, resource: RECONCILIATION_RESOURCE, status: "queued",
  }).select("*").single();
  if (error || !run) throw new Error(error?.message ?? "Could not queue reconciliation.");
  if (args.requestedBy) {
    await admin.from("notifications").insert({ user_id: args.requestedBy, store_id: args.storeId, level: "info",
      title: "Shopify reconciliation started", message: "Recent orders and missed webhook updates are being checked in the background.", link: "/stores" });
  }
  return { run: run as ShopifyReconciliationRun, alreadyRunning: false, store };
}

export async function runOrderReconciliation(args: {
  run: ShopifyReconciliationRun;
  store: { id: string; shop_domain: string };
  requestedBy?: string | null;
}) {
  const admin = createAdminClient();
  if (!admin) return;
  const startedAt = new Date().toISOString();
  await admin.from("sync_runs").update({ status: "running", started_at: startedAt, updated_at: startedAt }).eq("id", args.run.id);
  try {
    await processReadyWebhooks(100, [args.store.id]);
    const accessToken = await getShopifyAccessToken(args.store.id);
    const orders = await fetchRecentOrders({ shopDomain: args.store.shop_domain, accessToken, days: 7, dateField: "updated_at" });
    await admin.from("sync_runs").update({ total_items: orders.length, updated_at: new Date().toISOString() }).eq("id", args.run.id);
    let processed = 0;
    for (const order of orders) {
      await ingestShopifyOrder({ storeId: args.store.id, shopDomain: args.store.shop_domain, order, queueMeta: false });
      processed += 1;
      if (processed % 5 === 0 || processed === orders.length) {
        await admin.from("sync_runs").update({ processed_items: processed, updated_at: new Date().toISOString() }).eq("id", args.run.id);
      }
    }
    const completedAt = new Date().toISOString();
    const writes = [
      admin.from("sync_runs").update({ status: "completed", total_items: orders.length, processed_items: processed, completed_at: completedAt, updated_at: completedAt }).eq("id", args.run.id),
      admin.from("stores").update({ last_shopify_sync_at: completedAt }).eq("id", args.store.id),
      admin.from("sync_checkpoints").upsert({ store_id: args.store.id, resource: RECONCILIATION_RESOURCE, synced_through: completedAt, last_successful_at: completedAt, last_error: null, updated_at: completedAt }),
    ];
    if (args.requestedBy) writes.push(admin.from("notifications").insert({ user_id: args.requestedBy, store_id: args.store.id, level: "success",
      title: "Shopify reconciliation completed", message: `${processed} recently updated orders checked. No Meta events were created.`, link: "/orders" }));
    await Promise.all(writes);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown reconciliation error";
    const completedAt = new Date().toISOString();
    await Promise.all([
      admin.from("sync_runs").update({ status: "failed", error_message: message, completed_at: completedAt, updated_at: completedAt }).eq("id", args.run.id),
      admin.from("sync_checkpoints").upsert({ store_id: args.store.id, resource: RECONCILIATION_RESOURCE, last_error: message, updated_at: completedAt }),
      admin.from("notifications").insert({ user_id: args.requestedBy ?? null, store_id: args.store.id, level: "error",
        title: "Shopify reconciliation failed", message: "Recent Shopify changes could not be checked. Open Stores and retry reconciliation.", link: "/stores" }),
    ]);
  }
}
