"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | undefined;

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = z.object({ email: z.email(), password: z.string().min(8) }).safeParse({
    email: formData.get("email"), password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const supabase = await createClient();
  if (!supabase) return { error: "Authentication is not configured." };
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "The email or password is incorrect." };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect("/login");
}
