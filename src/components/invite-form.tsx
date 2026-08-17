"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function InviteForm() {
  const router = useRouter(); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    setPending(true); setMessage(""); const response = await fetch("/api/admin/invite", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: formData.get("email"), fullName: formData.get("fullName"), role: formData.get("role") }) });
    const body = await response.json(); setMessage(response.ok ? "Invitation sent." : body.error); setPending(false); if (response.ok) router.refresh();
  }
  return <form action={submit} className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="fullName">Name</Label><Input id="fullName" name="fullName" required /></div><div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div><div className="space-y-2"><Label htmlFor="role">Role</Label><Select name="role" defaultValue="viewer"><SelectTrigger id="role"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="viewer">Viewer</SelectItem><SelectItem value="operator">Operator</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select></div><div className="flex items-end"><Button disabled={pending}>{pending ? "Sending…" : "Send invitation"}</Button></div>{message && <p role="status" className="sm:col-span-2 text-sm text-muted-foreground">{message}</p>}</form>;
}
