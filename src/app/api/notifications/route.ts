import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request) {
  const auth = await requireRole(["admin", "operator", "viewer"]);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const user = auth.user;
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Database is not configured" }, { status: 503 });
  const body = await request.json().catch(() => null) as { id?: string; all?: boolean } | null;
  if (!body?.all && !body?.id) return Response.json({ error: "Notification id is required" }, { status: 400 });

  let query = admin.from("notifications").update({ read_at: new Date().toISOString() })
    .or(`user_id.eq.${user.id},user_id.is.null`).is("read_at", null);
  if (!body.all) query = query.eq("id", body.id as string);
  const { error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
