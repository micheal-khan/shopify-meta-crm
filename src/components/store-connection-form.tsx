"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StoreConnectionForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(formData: FormData) {
    setPending(true); setMessage(null);
    const response = await fetch("/api/stores", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      name: formData.get("name"), shopDomain: formData.get("shopDomain"), shopifyAccessToken: formData.get("shopifyAccessToken"),
      shopifyAppSecret: formData.get("shopifyAppSecret"), datasetId: formData.get("datasetId") || undefined,
      metaAccessToken: formData.get("metaAccessToken") || undefined, testEventCode: formData.get("testEventCode") || undefined, historicalSyncDays: 30,
    }) });
    const body = await response.json();
    setPending(false);
    if (!response.ok) return setMessage(body.error ?? "Connection failed.");
    setMessage("Store verified and saved. You can now run the 30-day CRM-only import."); router.refresh();
  }
  return <Card className="border-primary/15 bg-card/60"><CardHeader><CardTitle>Connect a Shopify store</CardTitle><CardDescription>Credentials are encrypted before storage. Meta remains in Test Events mode.</CardDescription></CardHeader><CardContent>
    <form action={submit} className="grid gap-4 md:grid-cols-2">
      <Field label="Store name" name="name" placeholder="Rang-Raze" required /><Field label="myshopify.com domain" name="shopDomain" placeholder="kyyf0v-ez.myshopify.com" required />
      <Field label="Shopify Admin API access token" name="shopifyAccessToken" type="password" required /><Field label="Shopify app client secret (webhook HMAC)" name="shopifyAppSecret" type="password" required />
      <Field label="Meta Dataset ID (optional)" name="datasetId" /><Field label="Meta system-user access token (optional)" name="metaAccessToken" type="password" />
      <Field label="Meta Test Event code" name="testEventCode" placeholder="TEST12345" />
      <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center"><Button disabled={pending}>{pending && <LoaderCircle className="size-4 animate-spin" />}{pending ? "Verifying…" : "Verify and connect"}</Button><p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" /> Live Meta Purchase sending stays locked.</p></div>
      {message && <p role="status" className="md:col-span-2 rounded-lg border border-white/10 p-3 text-sm">{message}</p>}
    </form>
  </CardContent></Card>;
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} autoComplete="off" {...props} /></div>;
}
