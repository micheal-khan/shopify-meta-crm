"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StoreConnectionForm({ initialMessage = null }: { initialMessage?: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(formData: FormData) {
    setPending(true); setMessage(null);
    const response = await fetch("/api/stores", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      name: formData.get("name"), shopDomain: formData.get("shopDomain"), shopifyClientId: formData.get("shopifyClientId"),
      shopifyClientSecret: formData.get("shopifyClientSecret"), datasetId: formData.get("datasetId") || undefined,
      metaAccessToken: formData.get("metaAccessToken") || undefined, testEventCode: formData.get("testEventCode") || undefined, historicalSyncDays: 30,
    }) });
    const body = await response.json();
    setPending(false);
    if (!response.ok) return setMessage(body.error ?? "Connection failed.");
    if (body.requiresOAuth && body.authorizeUrl) {
      window.open(body.authorizeUrl, "_top");
      return;
    }
    setMessage("App credentials verified and saved. The 24-hour Shopify token will renew automatically."); router.refresh();
  }
  return <Card className="border-primary/15 bg-card/60"><CardHeader><CardTitle>Connect a Shopify Dev Dashboard app</CardTitle><CardDescription>Release and install the app on the store first. SignalDesk exchanges the Client ID and Secret server-side and automatically renews the 24-hour token.</CardDescription></CardHeader><CardContent>
    <form action={submit} className="grid gap-4 md:grid-cols-2">
      <Field label="Store name" name="name" placeholder="Rang-Raze" required /><Field label="myshopify.com domain" name="shopDomain" placeholder="kyyf0v-ez.myshopify.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
      <Field label="Shopify app Client ID" name="shopifyClientId" placeholder="From Dev Dashboard → Settings" required /><Field label="Shopify app Client Secret" name="shopifyClientSecret" type="password" required />
      <Field label="Meta Dataset ID (optional)" name="datasetId" /><Field label="Meta system-user access token (optional)" name="metaAccessToken" type="password" />
      <Field label="Meta Test Event code" name="testEventCode" placeholder="TEST12345" />
      <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center"><Button disabled={pending}>{pending && <LoaderCircle className="size-4 animate-spin" />}{pending ? "Verifying…" : "Verify and connect"}</Button><p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" /> Live Meta Purchase sending stays locked.</p></div>
      {(message ?? initialMessage) && <p role="status" className="md:col-span-2 rounded-lg border border-white/10 p-3 text-sm">{message ?? initialMessage}</p>}
    </form>
  </CardContent></Card>;
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} autoComplete="off" {...props} /></div>;
}
