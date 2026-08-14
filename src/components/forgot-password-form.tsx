"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  async function submit(formData: FormData) {
    setPending(true); const email = String(formData.get("email") ?? "");
    await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback` });
    setPending(false); setMessage("If that address belongs to a CRM account, a reset link is on its way.");
  }
  return <form action={submit} className="space-y-4"><div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div><Button className="w-full" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</Button>{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}</form>;
}
