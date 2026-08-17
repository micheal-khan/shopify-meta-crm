import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard, MapPin, Package, ShieldCheck, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getOrderDetails, money } from "@/lib/data";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getOrderDetails(id);
  if (!data) notFound();
  const { order, items, refunds, details } = data;
  const store = order.stores as unknown as { name?: string; shop_domain?: string } | null;
  return <AppShell><div className="space-y-7 pb-20 lg:pb-0">
    <PageHeading eyebrow={store?.name ?? "Shopify order"} title={String(order.shopify_order_number)} description={`Created ${new Date(String(order.shopify_created_at)).toLocaleString("en-IN")}`} actions={<Button variant="outline" asChild><Link href="/orders"><ArrowLeft className="size-4" /> Back to orders</Link></Button>} />
    <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
      <div className="space-y-5">
        <Card className="border-white/[0.07] bg-card/60 shadow-none"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Order summary</CardTitle><CardDescription>{store?.shop_domain}</CardDescription></div><Badge variant="secondary" className="capitalize">{String(order.status).replaceAll("_", " ")}</Badge></div></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Payment" value={order.is_cod ? "Cash on delivery" : "Prepaid / other"} Icon={CreditCard} /><Metric label="Items" value={String(order.item_count)} Icon={Package} /><Metric label="Gross total" value={money(Number(order.total), String(order.currency))} /><Metric label="Refunded" value={money(Number(order.refunded_total), String(order.currency))} /></CardContent></Card>
        <Card className="border-white/[0.07] bg-card/60 shadow-none"><CardHeader><CardTitle>Line items</CardTitle><CardDescription>Products stored from Shopify</CardDescription></CardHeader><CardContent className="overflow-x-auto px-0"><Table><TableHeader><TableRow><TableHead className="pl-6">Item</TableHead><TableHead>SKU</TableHead><TableHead>Quantity</TableHead><TableHead className="text-right">Unit price</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={String(item.id)}><TableCell className="pl-6"><p className="font-medium">{item.title}</p>{item.variant_title && <p className="text-xs text-muted-foreground">{item.variant_title}</p>}</TableCell><TableCell className="font-mono text-xs text-muted-foreground">{item.sku ?? "—"}</TableCell><TableCell>{item.quantity}</TableCell><TableCell className="text-right">{money(Number(item.unit_price), String(order.currency))}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        {refunds.length > 0 && <Card className="border-amber-400/15 bg-card/60 shadow-none"><CardHeader><CardTitle>Refund history</CardTitle></CardHeader><CardContent className="space-y-3">{refunds.map((refund) => <div key={String(refund.id)} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{refund.shopify_created_at ? new Date(String(refund.shopify_created_at)).toLocaleString("en-IN") : "Refund"}</span><span className="font-medium text-amber-200">{money(Number(refund.amount), String(order.currency))}</span></div>)}</CardContent></Card>}
      </div>
      <div className="space-y-5">
        <Card className="border-white/[0.07] bg-card/60 shadow-none"><CardHeader><CardTitle>Attribution</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{[["Source",order.utm_source],["Medium",order.utm_medium],["Campaign",order.utm_campaign],["Content",order.utm_content],["Term",order.utm_term]].map(([label,value]) => <div key={String(label)} className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="max-w-52 truncate font-mono text-xs">{value ?? "Unattributed"}</span></div>)}</CardContent></Card>
        {details ? <Card className="border-white/[0.07] bg-card/60 shadow-none"><CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="size-4" /> Customer</CardTitle><CardDescription>Visible to Admin and Operator roles only</CardDescription></CardHeader><CardContent className="space-y-4 text-sm"><div><p className="font-medium">{[details.customer_first_name, details.customer_last_name].filter(Boolean).join(" ") || "Customer"}</p><p className="text-muted-foreground">{details.email ?? "No email"}</p><p className="text-muted-foreground">{details.phone ?? "No phone"}</p></div><Separator />{addressBlock("Shipping address", details.shipping_address)}{addressBlock("Billing address", details.billing_address)}</CardContent></Card> : <Card className="border-primary/15 bg-primary/[0.04] shadow-none"><CardContent className="flex gap-3 p-5"><ShieldCheck className="mt-0.5 size-5 text-primary" /><div><p className="text-sm font-medium">Customer data protected</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Viewer accounts can access order operations without customer contact or address information.</p></div></CardContent></Card>}
      </div>
    </div>
  </div></AppShell>;
}

function Metric({ label, value, Icon }: { label: string; value: string; Icon?: typeof Package }) { return <div><p className="flex items-center gap-1.5 text-xs text-muted-foreground">{Icon && <Icon className="size-3.5" />}{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function addressBlock(label: string, value: unknown) { const address = value && typeof value === "object" ? value as Record<string, unknown> : null; if (!address) return null; const text = [address.address1, address.address2, address.city, address.province, address.zip, address.country].filter(Boolean).join(", "); return <div><p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="size-3.5" /> {label}</p><p className="leading-6">{text || "Not provided"}</p></div>; }
