"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, Bot, ChartNoAxesCombined, Check, ChevronDown, LayoutDashboard,
  PackageSearch, RadioTower, Settings, Store,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const navigation = [
  ["Overview", "/", LayoutDashboard],
  ["Orders", "/orders", PackageSearch],
  ["Stores", "/stores", Store],
  ["Meta events", "/meta-events", RadioTower],
  ["Reports", "/reports", ChartNoAxesCombined],
  ["AI analyst", "/analyst", Bot],
  ["Notifications", "/notifications", Bell],
] as const;

type StoreOption = { id: string; name: string; shop_domain: string };

function routeIsActive(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function StoreSwitcher({ stores, activeStoreId }: { stores: StoreOption[]; activeStoreId: string | null }) {
  const router = useRouter();
  const activeStore = stores.find((store) => store.id === activeStoreId) ?? stores[0];

  async function selectStore(store: StoreOption) {
    if (store.id === activeStoreId) return;
    const response = await fetch("/api/stores/select", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId: store.id }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      toast.error(body?.error ?? "Could not switch stores.");
      return;
    }
    toast.success(`Switched to ${store.name}`);
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-auto w-full justify-between border-white/10 bg-white/[0.03] px-3 py-2.5">
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm">{activeStore?.name ?? "No store connected"}</span>
            <span className="block truncate text-[11px] font-normal text-muted-foreground">{activeStore?.shop_domain ?? "Add your first Shopify store"}</span>
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" className="min-w-[218px]">
        <DropdownMenuLabel>Switch store</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {stores.map((store) => (
          <DropdownMenuItem key={store.id} onSelect={() => selectStore(store)} className="items-start px-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{store.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{store.shop_domain}</span>
            </span>
            {store.id === activeStoreId && <Check className="mt-0.5 size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        {!stores.length && <DropdownMenuItem disabled>No connected stores</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DesktopNavigation({ unread }: { unread: number }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1 px-3">
      {navigation.map(([label, href, Icon]) => {
        const active = routeIsActive(pathname, href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
            active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
          )}>
            <Icon className="size-[18px]" />
            {label}
            {label === "Notifications" && unread > 0 && <Badge className="ml-auto h-5 bg-destructive/15 px-1.5 text-destructive">{unread}</Badge>}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNavigation() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-2xl border border-white/10 bg-card/90 p-2 shadow-2xl backdrop-blur-xl lg:hidden">
      {navigation.slice(0, 5).map(([label, href, Icon]) => {
        const active = routeIsActive(pathname, href);
        return <Link key={href} href={href} aria-label={label} aria-current={active ? "page" : undefined} className={cn("rounded-xl p-2.5", active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-primary")}><Icon className="size-5" /></Link>;
      })}
    </nav>
  );
}

export function SettingsNavigation() {
  const pathname = usePathname();
  const active = routeIsActive(pathname, "/settings");
  return <Link href="/settings" aria-current={active ? "page" : undefined} className={cn(
    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
    active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
  )}><Settings className="size-[18px]" /> Settings</Link>;
}
