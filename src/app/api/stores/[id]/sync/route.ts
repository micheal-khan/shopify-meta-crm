import { after } from "next/server";
import { getAccessibleStoreIds, requireRole } from "@/lib/auth";
import { fetchRecentOrders, getShopifyAccessToken } from "@/lib/shopify/admin-api";
import { ingestShopifyOrder } from "@/lib/shopify/orders";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

type SyncRun = {
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

async function authorizeStore(id: string) {
  const auth = await requireRole(["admin", "operator"]);
  if (!auth.ok) return auth;
  if (!(await getAccessibleStoreIds(auth.user)).includes(id)) {
    return { ok: false as const, status: 403, error: "Store access denied" };
  }
  return auth;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await authorizeStore(id);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const { data: run } = await admin.from("sync_runs").select("*").eq("store_id", id).eq("resource", "orders")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return Response.json({ run });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await authorizeStore(id);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const { data: store } = await admin.from("stores").select("id,shop_domain,historical_sync_days").eq("id", id).single();
  if (!store) return Response.json({ error: "Store connection was not found" }, { status: 404 });

  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  await admin.from("sync_runs").update({ status: "failed", error_message: "Import worker timed out. Please retry.", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("store_id", id).eq("resource", "orders").in("status", ["queued", "running"]).lt("updated_at", staleBefore);
  const { data: activeRun } = await admin.from("sync_runs").select("*").eq("store_id", id).eq("resource", "orders").in("status", ["queued", "running"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (activeRun) return Response.json({ run: activeRun, alreadyRunning: true }, { status: 202 });

  const { data: run, error: runError } = await admin.from("sync_runs").insert({
    store_id: id, requested_by: auth.user.id, resource: "orders", status: "queued",
  }).select("*").single();
  if (runError || !run) return Response.json({ error: runError?.message ?? "Could not start import" }, { status: 500 });

  await admin.from("notifications").insert({ user_id: auth.user.id, store_id: id, level: "info", title: "Historical import started",
    message: "The 30-day Shopify order import is running in the background. You can leave this page.", link: "/stores" });

  after(() => runHistoricalImport({ run: run as SyncRun, store, requestedBy: auth.user.id }));
  return Response.json({ run }, { status: 202 });
}

async function runHistoricalImport({ run, store, requestedBy }: {
  run: SyncRun;
  store: { id: string; shop_domain: string; historical_sync_days: number };
  requestedBy: string;
}) {
  const admin = createAdminClient();
  if (!admin) return;
  const startedAt = new Date().toISOString();
  await admin.from("sync_runs").update({ status: "running", started_at: startedAt, updated_at: startedAt }).eq("id", run.id);
  try {
    const accessToken = await getShopifyAccessToken(store.id);
    const orders = await fetchRecentOrders({ shopDomain: store.shop_domain, accessToken, days: store.historical_sync_days });
    await admin.from("sync_runs").update({ total_items: orders.length, updated_at: new Date().toISOString() }).eq("id", run.id);
    let imported = 0;
    for (const order of orders) {
      await ingestShopifyOrder({ storeId: store.id, shopDomain: store.shop_domain, order, queueMeta: false });
      imported += 1;
      if (imported % 5 === 0 || imported === orders.length) {
        await admin.from("sync_runs").update({ processed_items: imported, updated_at: new Date().toISOString() }).eq("id", run.id);
      }
    }
    const now = new Date().toISOString();
    await Promise.all([
      admin.from("sync_runs").update({ status: "completed", total_items: orders.length, processed_items: imported, completed_at: now, updated_at: now }).eq("id", run.id),
      admin.from("stores").update({ last_shopify_sync_at: now }).eq("id", store.id),
      admin.from("sync_checkpoints").upsert({ store_id: store.id, resource: "orders", synced_through: now, last_successful_at: now, last_error: null, updated_at: now }),
      admin.from("notifications").insert({ user_id: requestedBy, store_id: store.id, level: "success", title: "Historical import completed",
        message: `${imported} orders imported into the CRM. No historical Purchase events were sent to Meta.`, link: "/orders" }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown import error";
    const now = new Date().toISOString();
    await Promise.all([
      admin.from("sync_runs").update({ status: "failed", error_message: message, completed_at: now, updated_at: now }).eq("id", run.id),
      admin.from("sync_checkpoints").upsert({ store_id: store.id, resource: "orders", last_error: message, updated_at: now }),
      admin.from("notifications").insert({ user_id: requestedBy, store_id: store.id, level: "error", title: "Historical import failed",
        message: "The Shopify import stopped before completion. Open Stores to review the error and retry.", link: "/stores" }),
    ]);
  }
}
