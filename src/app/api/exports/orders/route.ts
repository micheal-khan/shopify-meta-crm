import { getAccessibleStoreIds, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createXlsx } from "@/lib/xlsx";
import { getSelectedStoreId } from "@/lib/store-selection";

const columns = ["store", "order", "status", "financial_status", "fulfillment_status", "payment_type", "utm_source", "utm_medium", "utm_campaign", "currency", "total", "refunded_total", "created_at"];
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: Request) {
  const auth = await requireRole(["admin", "operator"]);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const storeIds = await getAccessibleStoreIds(auth.user);
  if (!storeIds.length) return Response.json({ error: "No accessible stores" }, { status: 403 });
  const activeStoreId = await getSelectedStoreId(storeIds);
  const scopedStoreIds = activeStoreId ? [activeStoreId] : storeIds;
  const { data } = await admin.from("orders").select("*,stores(name)").in("store_id", scopedStoreIds).order("shopify_created_at", { ascending: false }).limit(50_000);
  const rows = (data ?? []).map((order) => [
    (order.stores as unknown as { name?: string } | null)?.name, order.shopify_order_number, order.status, order.financial_status, order.fulfillment_status,
    order.is_cod ? "COD" : "Prepaid / other", order.utm_source, order.utm_medium, order.utm_campaign, order.currency, Number(order.total), Number(order.refunded_total), order.shopify_created_at,
  ]);
  const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  if (format === "csv") {
    const csv = [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="signaldesk-orders.csv"', "cache-control": "no-store" } });
  }
  const workbook = new Uint8Array(createXlsx(columns, rows));
  return new Response(workbook.buffer, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": 'attachment; filename="signaldesk-orders.xlsx"', "cache-control": "no-store" } });
}
