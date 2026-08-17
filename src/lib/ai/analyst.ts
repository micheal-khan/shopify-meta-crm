import "server-only";
import { openai } from "@ai-sdk/openai";
import { ToolLoopAgent, tool, type InferAgentUIMessage } from "ai";
import { z } from "zod";
import { subDays } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";

export function createAnalystAgent(storeIds: string[]) {
  return new ToolLoopAgent({
    model: openai(process.env.OPENAI_MODEL ?? "gpt-5.4-mini"),
    instructions: "You are SignalDesk's read-only commerce analyst. Use tools for facts. Discuss only aggregate or anonymized data. Never request, reveal, or infer customer PII. Clearly distinguish Shopify order reporting from Meta attribution. If data is absent, say so.",
    tools: {
      getCampaignPerformance: tool({
        description: "Return anonymized aggregate order and revenue totals by UTM campaign.",
        inputSchema: z.object({ days: z.number().int().min(1).max(90).default(30) }),
        execute: async ({ days }) => {
          const admin = createAdminClient(); if (!admin || !storeIds.length) return { days, currency: "INR", campaigns: [] };
          const { data } = await admin.from("orders").select("utm_campaign,total,currency").in("store_id", storeIds).gte("shopify_created_at", subDays(new Date(), days).toISOString()).limit(20_000);
          const grouped = new Map<string, { orders: number; revenue: number }>();
          for (const order of data ?? []) { const name = order.utm_campaign ?? "Unattributed"; const current = grouped.get(name) ?? { orders: 0, revenue: 0 }; current.orders += 1; current.revenue += Number(order.total); grouped.set(name, current); }
          return { days, currency: data?.[0]?.currency ?? "INR", campaigns: [...grouped.entries()].map(([campaign, value]) => ({ campaign, ...value })).sort((a,b) => b.revenue-a.revenue).slice(0,50) };
        },
      }),
      getMetaDeliveryHealth: tool({
        description: "Return aggregate Meta CAPI delivery health without event payloads or customer data.",
        inputSchema: z.object({ days: z.number().int().min(1).max(90).default(30) }),
        execute: async ({ days }) => {
          const admin = createAdminClient(); if (!admin || !storeIds.length) return { days, sent: 0, retrying: 0, failed: 0, suppressed: 0, deliveryRate: 0, mode: "test" };
          const { data } = await admin.from("meta_events").select("status,is_test").in("store_id", storeIds).gte("created_at", subDays(new Date(), days).toISOString()).limit(20_000);
          const count = (status: string) => (data ?? []).filter((event) => event.status === status).length; const sent = count("sent"); const failed = count("failed");
          return { days, sent, retrying: count("queued") + count("processing"), failed, suppressed: count("suppressed"), deliveryRate: sent + failed ? Number((sent/(sent+failed)*100).toFixed(2)) : 0, mode: (data ?? []).some((event) => !event.is_test) ? "mixed" : "test" };
        },
      }),
      getOrderSummary: tool({
        description: "Return aggregate Shopify order totals by status and payment type.",
        inputSchema: z.object({ days: z.number().int().min(1).max(90).default(30) }),
        execute: async ({ days }) => {
          const admin = createAdminClient(); if (!admin || !storeIds.length) return { days, orders: 0, gross: 0, refunded: 0, codOrders: 0, statuses: {} };
          const { data } = await admin.from("orders").select("status,total,refunded_total,is_cod").in("store_id", storeIds).gte("shopify_created_at", subDays(new Date(), days).toISOString()).limit(20_000);
          const statuses: Record<string, number> = {}; for (const order of data ?? []) statuses[order.status] = (statuses[order.status] ?? 0) + 1;
          return { days, orders: data?.length ?? 0, gross: (data ?? []).reduce((sum,o)=>sum+Number(o.total),0), refunded: (data ?? []).reduce((sum,o)=>sum+Number(o.refunded_total),0), codOrders: (data ?? []).filter((o)=>o.is_cod).length, statuses };
        },
      }),
    },
  });
}

export type AnalystMessage = InferAgentUIMessage<ReturnType<typeof createAnalystAgent>>;
