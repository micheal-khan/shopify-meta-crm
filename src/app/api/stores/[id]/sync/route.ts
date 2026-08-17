import { getAccessibleStoreIds, requireRole } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { fetchRecentOrders } from "@/lib/shopify/admin-api";
import { ingestShopifyOrder } from "@/lib/shopify/orders";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin", "operator"]);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  if (!(await getAccessibleStoreIds(auth.user)).includes(id)) return Response.json({ error: "Store access denied" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const [{ data: store }, { data: connection }] = await Promise.all([
    admin.from("stores").select("id,shop_domain,historical_sync_days").eq("id", id).single(),
    admin.schema("private").from("shopify_connections").select("encrypted_access_token").eq("store_id", id).single(),
  ]);
  if (!store || !connection) return Response.json({ error: "Store connection was not found" }, { status: 404 });
  try {
    const orders = await fetchRecentOrders({ shopDomain: store.shop_domain, accessToken: decryptSecret(connection.encrypted_access_token), days: store.historical_sync_days });
    let imported = 0;
    for (const order of orders) {
      await ingestShopifyOrder({ storeId: store.id, shopDomain: store.shop_domain, order, queueMeta: false });
      imported += 1;
    }
    const now = new Date().toISOString();
    await Promise.all([
      admin.from("stores").update({ last_shopify_sync_at: now }).eq("id", id),
      admin.from("sync_checkpoints").upsert({ store_id: id, resource: "orders", synced_through: now, last_successful_at: now, last_error: null, updated_at: now }),
      admin.from("notifications").insert({ user_id: auth.user.id, store_id: id, level: "success", title: "Historical import completed",
        message: `${imported} orders imported into the CRM. No historical Purchase events were sent to Meta.`, link: "/orders" }),
    ]);
    return Response.json({ imported, metaEventsCreated: 0 });
  } catch (error) {
    await admin.from("sync_checkpoints").upsert({ store_id: id, resource: "orders", last_error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error", updated_at: new Date().toISOString() });
    return Response.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 502 });
  }
}
