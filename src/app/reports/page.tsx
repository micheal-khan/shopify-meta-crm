import Link from "next/link";
import { Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { campaignRows, getWorkspaceData, money, summarize } from "@/lib/data";

export default async function ReportsPage() {
  const data = await getWorkspaceData(); const summary = summarize(data.orders, data.events); const campaigns = campaignRows(data.orders); const max = campaigns[0]?.revenue || 1;
  return <AppShell><div className="space-y-7 pb-20 lg:pb-0"><PageHeading eyebrow="Reporting" title="Performance reports" description="Store, status and UTM performance. Shopify remains the order source of truth." actions={<Button asChild><Link href="/api/exports/orders?format=xlsx"><Download className="size-4" /> Export Excel</Link></Button>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Gross sales",money(summary.gross)],["Net after refunds",money(summary.net)],["Average order",money(summary.average)],["Meta test delivery",`${summary.deliveryRate.toFixed(1)}%`]].map(([key,value]) => <Card key={key} className="border-white/[0.07] bg-card/60 shadow-none"><CardContent className="p-5"><p className="text-xs text-muted-foreground">{key}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>)}</div>
    <Card className="border-white/[0.07] bg-card/60 shadow-none"><CardHeader><CardTitle>Campaign revenue</CardTitle><CardDescription>Orders grouped by Shopify UTM campaign</CardDescription></CardHeader><CardContent className="space-y-6">{campaigns.map((campaign) => <div key={campaign.name} className="grid items-center gap-3 sm:grid-cols-[1fr_120px_2fr]"><div><p className="font-mono text-sm">{campaign.name}</p><p className="text-xs text-muted-foreground">{campaign.orders} orders</p></div><p className="font-medium sm:text-right">{money(campaign.revenue)}</p><Progress value={(campaign.revenue / max) * 100} className="h-2" /></div>)}{!campaigns.length && <p className="text-sm text-muted-foreground">Import orders to populate reports.</p>}</CardContent></Card>
  </div></AppShell>;
}
