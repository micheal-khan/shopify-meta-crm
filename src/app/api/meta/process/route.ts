import { getAccessibleStoreIds, requireRole } from "@/lib/auth";
import { processReadyMetaEvents } from "@/lib/meta/processor";
import { processReadyWebhooks } from "@/lib/shopify/orders";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const cronAuthorized = Boolean(cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`);
  let storeIds: string[] | undefined;
  if (!cronAuthorized) {
    const auth = await requireRole(["admin", "operator"]);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    storeIds = await getAccessibleStoreIds(auth.user);
  }
  const webhooks = await processReadyWebhooks(50, storeIds);
  const results = await processReadyMetaEvents(50, storeIds);
  return Response.json({ processed: results.length, webhookReceiptsProcessed: webhooks.length, results, webhooks });
}
