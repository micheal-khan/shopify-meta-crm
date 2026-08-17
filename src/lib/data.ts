import "server-only";

import { subDays } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { getSelectedStoreId } from "@/lib/store-selection";

export const money = (value: number, currency = "INR") => new Intl.NumberFormat("en-IN", {
  style: "currency", currency, maximumFractionDigits: 0,
}).format(value);

async function accessibleStoreIds(userId: string, role: string) {
  const admin = createAdminClient();
  if (!admin) return [];
  if (role === "admin") {
    const { data } = await admin.from("stores").select("id").order("created_at");
    return (data ?? []).map((row) => row.id as string);
  }
  const { data } = await admin.from("store_members").select("store_id").eq("user_id", userId).order("created_at");
  return (data ?? []).map((row) => row.store_id as string);
}

export async function getWorkspaceData() {
  const user = await requireUser();
  const admin = createAdminClient();
  if (!admin) return { user, activeStoreId: null, stores: [], orders: [], events: [], notifications: [], profiles: [], syncRuns: [] };
  const storeIds = await accessibleStoreIds(user.id, user.role);
  if (!storeIds.length) {
    const { data: profiles } = user.role === "admin" ? await admin.from("profiles").select("id,email,full_name,role,created_at").order("created_at") : { data: [] };
    return { user, activeStoreId: null, stores: [], orders: [], events: [], notifications: [], profiles: profiles ?? [], syncRuns: [] };
  }
  const activeStoreId = await getSelectedStoreId(storeIds);
  const scopedStoreIds = activeStoreId ? [activeStoreId] : storeIds;
  const since = subDays(new Date(), 30).toISOString();
  const [storesResult, ordersResult, eventsResult, notificationsResult, profilesResult, syncRunsResult] = await Promise.all([
    admin.from("stores").select("*").in("id", storeIds).order("created_at"),
    admin.from("orders").select("*").in("store_id", scopedStoreIds).gte("shopify_created_at", since).order("shopify_created_at", { ascending: false }).limit(1000),
    admin.from("meta_events").select("*").in("store_id", scopedStoreIds).gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
    admin.from("notifications").select("*").or(`user_id.eq.${user.id},user_id.is.null`).order("created_at", { ascending: false }).limit(100),
    user.role === "admin" ? admin.from("profiles").select("id,email,full_name,role,created_at").order("created_at") : Promise.resolve({ data: [] }),
    admin.from("sync_runs").select("*").in("store_id", storeIds).order("created_at", { ascending: false }).limit(100),
  ]);
  return {
    user,
    activeStoreId,
    stores: storesResult.data ?? [],
    orders: ordersResult.data ?? [],
    events: eventsResult.data ?? [],
    notifications: notificationsResult.data ?? [],
    profiles: profilesResult.data ?? [],
    syncRuns: syncRunsResult.data ?? [],
  };
}

export async function getOrdersPage(page: number, pageSize = 25) {
  const user = await requireUser();
  const admin = createAdminClient();
  if (!admin) return { orders: [], summary: { count: 0, gross: 0, net: 0 }, page: 1, pageSize, pageCount: 1 };
  const storeIds = await accessibleStoreIds(user.id, user.role);
  const activeStoreId = await getSelectedStoreId(storeIds);
  const scopedStoreIds = activeStoreId ? [activeStoreId] : storeIds;
  if (!scopedStoreIds.length) return { orders: [], summary: { count: 0, gross: 0, net: 0 }, page: 1, pageSize, pageCount: 1 };

  const since = subDays(new Date(), 30).toISOString();
  const { data: summaryRows, error: summaryError } = await admin.rpc("order_summary_for_stores", {
    requested_store_ids: scopedStoreIds,
    since_at: since,
  });
  if (summaryError) throw new Error(`Order summary failed: ${summaryError.message}`);
  const row = (summaryRows ?? [])[0] as { order_count?: number | string; gross?: number | string; refunded?: number | string; cancelled?: number | string } | undefined;
  const count = Number(row?.order_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const currentPage = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const from = (currentPage - 1) * pageSize;
  const { data: orders, error: ordersError } = await admin.from("orders").select("*")
    .in("store_id", scopedStoreIds)
    .gte("shopify_created_at", since)
    .order("shopify_created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (ordersError) throw new Error(`Orders page failed: ${ordersError.message}`);
  const gross = Number(row?.gross ?? 0);
  const refunded = Number(row?.refunded ?? 0);
  const cancelled = Number(row?.cancelled ?? 0);
  return { orders: orders ?? [], summary: { count, gross, net: gross - refunded - cancelled }, page: currentPage, pageSize, pageCount };
}

export function summarize(orders: Record<string, unknown>[], events: Record<string, unknown>[]) {
  const gross = orders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const refunded = orders.reduce((sum, order) => sum + Number(order.refunded_total ?? 0), 0);
  const cancelled = orders.filter((order) => order.status === "cancelled").reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const cod = orders.filter((order) => order.is_cod).length;
  const sent = events.filter((event) => event.status === "sent").length;
  const failed = events.filter((event) => event.status === "failed").length;
  return {
    gross,
    net: gross - refunded - cancelled,
    count: orders.length,
    average: orders.length ? gross / orders.length : 0,
    codShare: orders.length ? (cod / orders.length) * 100 : 0,
    sent,
    failed,
    deliveryRate: sent + failed ? (sent / (sent + failed)) * 100 : 0,
  };
}

export function campaignRows(orders: Record<string, unknown>[]) {
  const grouped = new Map<string, { orders: number; revenue: number }>();
  for (const order of orders) {
    const name = String(order.utm_campaign || "Unattributed");
    const current = grouped.get(name) ?? { orders: 0, revenue: 0 };
    current.orders += 1;
    current.revenue += Number(order.total ?? 0);
    grouped.set(name, current);
  }
  return [...grouped.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.revenue - a.revenue);
}
