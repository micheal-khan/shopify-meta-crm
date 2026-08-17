import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AppRole = "admin" | "operator" | "viewer";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: AppRole;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;
  return {
    id: user.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role as AppRole,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(allowed: AppRole[]) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, status: 401, error: "Authentication required" };
  if (!allowed.includes(user.role)) return { ok: false as const, status: 403, error: "Insufficient permissions" };
  return { ok: true as const, user };
}

export async function getAccessibleStoreIds(user: CurrentUser) {
  const admin = createAdminClient();
  if (!admin) return [];
  if (user.role === "admin") {
    const { data } = await admin.from("stores").select("id");
    return (data ?? []).map((row) => String(row.id));
  }
  const { data } = await admin.from("store_members").select("store_id").eq("user_id", user.id);
  return (data ?? []).map((row) => String(row.store_id));
}
