import { after } from "next/server";
import { queueOrderReconciliation, runOrderReconciliation } from "@/lib/shopify/reconciliation";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const { data: stores, error } = await admin.from("stores").select("id").eq("status", "connected");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const queued = [];
  for (const store of stores ?? []) {
    try {
      const job = await queueOrderReconciliation({ storeId: store.id });
      queued.push({ storeId: store.id, runId: job.run.id, alreadyRunning: job.alreadyRunning });
      if (!job.alreadyRunning) after(() => runOrderReconciliation({ run: job.run, store: job.store }));
    } catch (queueError) {
      queued.push({ storeId: store.id, error: queueError instanceof Error ? queueError.message : "Queue failed" });
    }
  }
  return Response.json({ queued });
}
