import { createAgentUIStreamResponse } from "ai";
import { createAnalystAgent } from "@/lib/ai/analyst";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "OpenAI is not configured." }, { status: 503 });
  const body = await request.json();
  if (!Array.isArray(body.messages)) return Response.json({ error: "messages must be an array" }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const { data: membership } = user.role === "admin" ? await admin.from("stores").select("id") : await admin.from("store_members").select("store_id").eq("user_id", user.id);
  const storeIds = (membership ?? []).map((row) => String("id" in row ? row.id : row.store_id));
  return createAgentUIStreamResponse({ agent: createAnalystAgent(storeIds), uiMessages: body.messages });
}
