import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ email: z.email(), fullName: z.string().trim().min(2).max(80), role: z.enum(["admin", "operator", "viewer"]) });

export async function POST(request: Request) {
  const auth = await requireRole(["admin"]);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid invitation" }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Authentication admin is not configured" }, { status: 503 });
  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { full_name: parsed.data.fullName }, redirectTo: `${process.env.APP_URL ?? new URL(request.url).origin}/auth/callback`,
  });
  if (error || !data.user) return Response.json({ error: error?.message ?? "Invitation failed" }, { status: 400 });
  const { error: profileError } = await admin.from("profiles").update({ role: parsed.data.role, invited_by: auth.user.id, full_name: parsed.data.fullName }).eq("id", data.user.id);
  if (profileError) return Response.json({ error: profileError.message }, { status: 500 });
  const { data: stores } = await admin.from("stores").select("id");
  if (parsed.data.role !== "admin" && stores?.length) {
    const { error: membershipError } = await admin.from("store_members").upsert(stores.map((store) => ({ store_id: store.id, user_id: data.user.id })));
    if (membershipError) return Response.json({ error: membershipError.message }, { status: 500 });
  }
  await admin.from("audit_logs").insert({ actor_id: auth.user.id, action: "user.invited", entity_type: "profile", entity_id: data.user.id,
    metadata: { email: parsed.data.email, role: parsed.data.role } });
  return Response.json({ invited: true });
}
