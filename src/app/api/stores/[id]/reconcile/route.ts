import { after } from "next/server";
import { getAccessibleStoreIds, requireRole } from "@/lib/auth";
import { queueOrderReconciliation, RECONCILIATION_RESOURCE, runOrderReconciliation } from "@/lib/shopify/reconciliation";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

async function authorizeStore(id: string) {
  const auth = await requireRole(["admin", "operator"]);
  if (!auth.ok) return auth;
  if (!(await getAccessibleStoreIds(auth.user)).includes(id)) return { ok: false as const, status: 403, error: "Store access denied" };
  return auth;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await authorizeStore(id);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const { data: run } = await admin.from("sync_runs").select("*").eq("store_id", id).eq("resource", RECONCILIATION_RESOURCE)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return Response.json({ run });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await authorizeStore(id);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const queued = await queueOrderReconciliation({ storeId: id, requestedBy: auth.user.id });
    if (!queued.alreadyRunning) after(() => runOrderReconciliation({ run: queued.run, store: queued.store, requestedBy: auth.user.id }));
    return Response.json({ run: queued.run, alreadyRunning: queued.alreadyRunning }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not start reconciliation" }, { status: 500 });
  }
}
