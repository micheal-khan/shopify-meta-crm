import "server-only";
import { createHash } from "node:crypto";
import { isProductionMetaEnabled } from "@/lib/env";

const sha256 = (value?: string | null) => value ? createHash("sha256").update(value.trim().toLowerCase()).digest("hex") : undefined;

export type PurchaseInput = {
  eventId: string;
  eventTime: number;
  sourceUrl?: string;
  currency: string;
  value: number;
  orderId: string;
  email?: string | null;
  phone?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
};

export function buildPurchaseEvent(input: PurchaseInput) {
  return {
    event_name: "Purchase",
    event_time: input.eventTime,
    event_id: input.eventId,
    action_source: "website",
    ...(input.sourceUrl ? { event_source_url: input.sourceUrl } : {}),
    user_data: {
      ...(input.email ? { em: [sha256(input.email)] } : {}),
      ...(input.phone ? { ph: [sha256(input.phone.replace(/\D/g, ""))] } : {}),
      ...(input.clientIp ? { client_ip_address: input.clientIp } : {}),
      ...(input.userAgent ? { client_user_agent: input.userAgent } : {}),
      ...(input.fbp ? { fbp: input.fbp } : {}),
      ...(input.fbc ? { fbc: input.fbc } : {}),
    },
    custom_data: { currency: input.currency, value: input.value, order_id: input.orderId },
  };
}

export async function sendPurchaseToMeta(args: { datasetId: string; accessToken: string; event: ReturnType<typeof buildPurchaseEvent>; testEventCode?: string }) {
  const production = isProductionMetaEnabled();
  if (!production && !args.testEventCode) throw new Error("Meta sending is fail-closed: provide a test event code.");
  const version = process.env.META_GRAPH_API_VERSION ?? "v24.0";
  const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(args.datasetId)}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: [args.event], access_token: args.accessToken, ...(!production ? { test_event_code: args.testEventCode } : {}) }),
    cache: "no-store",
  });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(`Meta CAPI returned HTTP ${response.status}.`);
  return { status: response.status, body, mode: production ? "production" : "test" };
}
