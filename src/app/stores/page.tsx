import { CircleCheckBig, CircleDashed, Store as StoreIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { StoreConnectionForm } from "@/components/store-connection-form";
import { SyncStoreButton } from "@/components/operation-buttons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkspaceData } from "@/lib/data";

export default async function StoresPage({ searchParams }: { searchParams: Promise<{ shopify?: string; shopify_error?: string }> }) {
  const query = await searchParams;
  const data = await getWorkspaceData();
  return <AppShell><div className="space-y-7 pb-20 lg:pb-0"><PageHeading eyebrow="Connections" title="Stores" description="Connect 7–15 Shopify stores and map each one to its own Meta Dataset." />
    {data.user.role === "admin" && <StoreConnectionForm initialMessage={query.shopify_error ?? (query.shopify === "connected" ? "Shopify store connected successfully." : null)} />}
    <div className="grid gap-5 lg:grid-cols-2">{data.stores.map((store) => {
      const isConnected = store.status === "connected";
      const latestRun = data.syncRuns.find((run) => run.store_id === store.id);
      return <Card key={String(store.id)} className="border-white/[0.07] bg-card/60 shadow-none"><CardHeader className="flex-row items-start gap-4"><div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><StoreIcon className="size-5" /></div><div className="flex-1"><div className="flex items-center justify-between gap-3"><CardTitle>{store.name}</CardTitle><Badge variant="outline" className={isConnected ? "border-emerald-400/20 text-emerald-400" : "border-amber-400/20 text-amber-300"}>{store.status}</Badge></div><CardDescription className="mt-1">{store.shop_domain}</CardDescription></div></CardHeader><CardContent className="space-y-4"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Historical window</span><span>{store.historical_sync_days} days</span></div><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Shopify Admin API</span>{isConnected ? <span className="flex items-center gap-1.5 text-emerald-400"><CircleCheckBig className="size-4" /> Connected</span> : <span className="flex items-center gap-1.5 text-amber-300"><CircleDashed className="size-4" /> Authorization required</span>}</div><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Last sync</span><span>{store.last_shopify_sync_at ? new Date(String(store.last_shopify_sync_at)).toLocaleString("en-IN") : "Not imported"}</span></div>{["admin","operator"].includes(data.user.role) && (isConnected ? <SyncStoreButton storeId={String(store.id)} initialRun={latestRun ?? null} /> : <p className="text-sm text-muted-foreground">Complete Shopify authorization before importing orders.</p>)}</CardContent></Card>;
    })}</div>
  </div></AppShell>;
}
