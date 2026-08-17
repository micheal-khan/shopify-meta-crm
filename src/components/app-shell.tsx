import Link from "next/link";
import {
  Bell, Bot, ChartNoAxesCombined, ChevronDown, CircleUserRound, LayoutDashboard,
  PackageSearch, RadioTower, Settings, Store, UsersRound,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import { getAccessibleStoreIds, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const navigation = [
  ["Overview", "/", LayoutDashboard],
  ["Orders", "/orders", PackageSearch],
  ["Stores", "/stores", Store],
  ["Meta events", "/meta-events", RadioTower],
  ["Reports", "/reports", ChartNoAxesCombined],
  ["AI analyst", "/analyst", Bot],
  ["Notifications", "/notifications", Bell],
] as const;

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const admin = createAdminClient();
  const storeIds = await getAccessibleStoreIds(user);
  const [{ data: stores }, { count: unread }] = admin ? await Promise.all([
    storeIds.length ? admin.from("stores").select("id,name,shop_domain").in("id", storeIds).order("created_at").limit(1) : Promise.resolve({ data: [] }),
    admin.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).or(`user_id.eq.${user.id},user_id.is.null`),
  ]) : [{ data: [] }, { count: 0 }];
  const activeStore = stores?.[0];
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="hidden border-r border-white/[0.07] bg-sidebar/80 lg:flex lg:flex-col">
        <div className="flex h-20 items-center gap-3 px-6">
          <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_30px_-8px] shadow-primary">
            <RadioTower className="size-5" />
          </div>
          <div>
            <div className="font-semibold tracking-tight">SignalDesk</div>
            <div className="text-[11px] text-muted-foreground">Shopify → Meta</div>
          </div>
        </div>
        <div className="px-4 pb-5">
          <Button variant="outline" className="h-auto w-full justify-between border-white/10 bg-white/[0.03] px-3 py-2.5">
            <span className="min-w-0 text-left">
              <span className="block truncate text-sm">{activeStore?.name ?? "No store connected"}</span>
              <span className="block truncate text-[11px] font-normal text-muted-foreground">{activeStore?.shop_domain ?? "Add your first Shopify store"}</span>
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </Button>
        </div>
        <nav className="space-y-1 px-3">
          {navigation.map(([label, href, Icon], index) => (
            <Link key={href} href={href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${index === 0 ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"}`}>
              <Icon className="size-[18px]" />
              {label}
              {label === "Notifications" && Boolean(unread) && <Badge className="ml-auto h-5 bg-destructive/15 px-1.5 text-destructive">{unread}</Badge>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-3">
          <Separator className="mb-3" />
          <Link href="/settings" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-white/[0.04] hover:text-foreground">
            <Settings className="size-[18px]" /> Settings
          </Link>
          <div className="mt-2 flex items-center gap-3 rounded-xl bg-white/[0.025] p-3">
            <CircleUserRound className="size-8 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.fullName ?? user.email}</div>
              <div className="text-[11px] capitalize text-muted-foreground">{user.role}</div>
            </div>
            <form action={signOut}><button aria-label="Sign out" title="Sign out" className="text-muted-foreground hover:text-foreground"><UsersRound className="size-4" /></button></form>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/[0.07] bg-background/80 px-4 backdrop-blur-xl sm:px-7 lg:h-20">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><RadioTower className="size-4" /></div>
            <span className="font-semibold">SignalDesk</span>
          </div>
          <div className="hidden lg:block">
            <p className="text-xs text-muted-foreground">Workspace</p>
            <p className="text-sm font-medium">Internal commerce operations</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden border-primary/20 bg-primary/5 text-primary sm:inline-flex"><span className="mr-1.5 size-1.5 rounded-full bg-primary" /> Test mode</Badge>
            <Button size="icon" variant="ghost" aria-label="Notifications"><Bell className="size-4" /></Button>
            {user.role === "admin" && <Button size="sm" className="hidden sm:inline-flex" asChild><Link href="/stores">Add store</Link></Button>}
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 sm:py-8">{children}</main>
        <nav className="fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-2xl border border-white/10 bg-card/90 p-2 shadow-2xl backdrop-blur-xl lg:hidden">
          {navigation.slice(0, 5).map(([label, href, Icon]) => <Link key={href} href={href} aria-label={label} className="rounded-xl p-2.5 text-muted-foreground hover:bg-white/5 hover:text-primary"><Icon className="size-5" /></Link>)}
        </nav>
      </div>
    </div>
  );
}
