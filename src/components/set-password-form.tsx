"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function SetPasswordForm() {
  const router = useRouter(); const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  async function submit(formData: FormData) { const password = String(formData.get("password") ?? ""); const confirm = String(formData.get("confirm") ?? "");
    if (password.length < 10 || password !== confirm) return setMessage("Use at least 10 characters and make both passwords match.");
    setPending(true); const { error } = await createClient().auth.updateUser({ password }); setPending(false); if (error) return setMessage(error.message); router.replace("/"); router.refresh(); }
  return <form action={submit} className="space-y-4"><div className="space-y-2"><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" minLength={10} required /></div><div className="space-y-2"><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" name="confirm" type="password" minLength={10} required /></div>{message && <p className="text-sm text-destructive">{message}</p>}<Button className="w-full" disabled={pending}>{pending ? "Saving…" : "Set password"}</Button></form>;
}
