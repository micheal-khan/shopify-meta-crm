import Link from "next/link";
import { Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { OrderFilters } from "@/components/order-filters";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getOrdersPage, money, type OrderFilters as OrderFilterValues } from "@/lib/data";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

const statuses = new Set(["open", "fulfilled", "cancelled", "refunded", "partially_refunded"]);
const payments = new Set(["cod", "prepaid"]);

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string; search?: string; status?: string; payment?: string }> }) {
  const query = await searchParams;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const filters: Required<OrderFilterValues> = {
    search: query.search?.slice(0, 80) ?? "",
    status: (statuses.has(query.status ?? "") ? query.status : "all") as Required<OrderFilterValues>["status"],
    payment: (payments.has(query.payment ?? "") ? query.payment : "all") as Required<OrderFilterValues>["payment"],
  };
  const data = await getOrdersPage({ page: requestedPage, ...filters });
  const { summary } = data;
  return <AppShell><div className="space-y-7 pb-20 lg:pb-0"><PageHeading eyebrow="Shopify" title="Orders" description="Every synced Shopify order. Customer PII remains isolated in the private database schema." actions={<><Button variant="outline" asChild><Link href="/api/exports/orders?format=csv"><Download className="size-4" /> CSV</Link></Button><Button variant="outline" asChild><Link href="/api/exports/orders?format=xlsx"><Download className="size-4" /> Excel</Link></Button></>} />
    <div className="grid gap-4 sm:grid-cols-3">{[["Total orders",summary.count.toLocaleString("en-IN")],["Gross sales",money(summary.gross)],["Net after refunds",money(summary.net)]].map(([key,value]) => <Card key={key} className="border-white/[0.07] bg-card/60 shadow-none"><CardContent className="p-5"><p className="text-xs text-muted-foreground">{key}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>)}</div>
    <OrderFilters key={`${filters.search}:${filters.status}:${filters.payment}`} initial={filters} />
    <Card className="border-white/[0.07] bg-card/60 shadow-none"><CardContent className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead className="pl-6">Order</TableHead><TableHead>Status</TableHead><TableHead>Payment</TableHead><TableHead>UTM campaign</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>{data.orders.map((order) => <TableRow key={String(order.id)}><TableCell className="pl-6 font-medium"><Link href={`/orders/${order.id}`} className="hover:text-primary hover:underline">{order.shopify_order_number}</Link></TableCell><TableCell><Badge variant="secondary" className="capitalize">{String(order.status).replaceAll("_", " ")}</Badge></TableCell><TableCell>{order.is_cod ? "COD" : "Prepaid / other"}</TableCell><TableCell className="font-mono text-xs text-muted-foreground">{order.utm_campaign ?? "Unattributed"}</TableCell><TableCell className="text-muted-foreground">{new Date(String(order.shopify_created_at)).toLocaleDateString("en-IN")}</TableCell><TableCell className="text-right font-medium">{money(Number(order.total), String(order.currency))}</TableCell></TableRow>)}</TableBody></Table>{!data.orders.length && <p className="p-6 text-sm text-muted-foreground">No orders match these filters.</p>}</CardContent></Card>
    <div className="flex flex-col items-center gap-3"><p className="text-xs text-muted-foreground">{data.filteredCount.toLocaleString("en-IN")} matching order{data.filteredCount === 1 ? "" : "s"}</p>{data.pageCount > 1 && <OrdersPagination page={data.page} pageCount={data.pageCount} filters={filters} />}</div>
  </div></AppShell>;
}

function OrdersPagination({ page, pageCount, filters }: { page: number; pageCount: number; filters: Required<OrderFilterValues> }) {
  const start = Math.max(1, Math.min(page - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => start + index);
  return <Pagination aria-label="Orders pagination"><PaginationContent>
    <PaginationItem><PaginationPrevious href={page > 1 ? orderPageHref(page - 1, filters) : "#"} aria-disabled={page === 1} className={page === 1 ? "pointer-events-none opacity-50" : undefined} /></PaginationItem>
    {pages.map((item) => <PaginationItem key={item}><PaginationLink href={orderPageHref(item, filters)} isActive={item === page}>{item}</PaginationLink></PaginationItem>)}
    <PaginationItem><PaginationNext href={page < pageCount ? orderPageHref(page + 1, filters) : "#"} aria-disabled={page === pageCount} className={page === pageCount ? "pointer-events-none opacity-50" : undefined} /></PaginationItem>
  </PaginationContent></Pagination>;
}

function orderPageHref(page: number, filters: Required<OrderFilterValues>) {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.search) params.set("search", filters.search);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.payment !== "all") params.set("payment", filters.payment);
  return `/orders?${params}`;
}
