"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Filters = { search: string; status: string; payment: string };

export function OrderFilters({ initial }: { initial: Filters }) {
  const router = useRouter();
  const [search, setSearch] = useState(initial.search);
  const [status, setStatus] = useState(initial.status);
  const [payment, setPayment] = useState(initial.payment);
  const hasFilters = Boolean(initial.search || initial.status !== "all" || initial.payment !== "all");

  function apply(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (status !== "all") params.set("status", status);
    if (payment !== "all") params.set("payment", payment);
    router.push(`/orders${params.size ? `?${params}` : ""}`);
  }

  return <form onSubmit={apply} className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-card/60 p-4 lg:flex-row lg:items-center">
    <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order number or UTM campaign" className="pl-9" /></div>
    <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full lg:w-48"><SelectValue placeholder="Order status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="fulfilled">Fulfilled</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem><SelectItem value="refunded">Refunded</SelectItem><SelectItem value="partially_refunded">Partially refunded</SelectItem></SelectContent></Select>
    <Select value={payment} onValueChange={setPayment}><SelectTrigger className="w-full lg:w-44"><SelectValue placeholder="Payment type" /></SelectTrigger><SelectContent><SelectItem value="all">All payments</SelectItem><SelectItem value="cod">COD</SelectItem><SelectItem value="prepaid">Prepaid / other</SelectItem></SelectContent></Select>
    <Button type="submit">Apply filters</Button>
    {hasFilters && <Button type="button" variant="ghost" onClick={() => router.push("/orders")}><X className="size-4" /> Clear</Button>}
  </form>;
}
