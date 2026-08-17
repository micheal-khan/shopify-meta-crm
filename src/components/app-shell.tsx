import Link from "next/link";
import { Bell, CircleUserRound, RadioTower, UsersRound } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { getAccessibleStoreIds, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSelectedStoreId } from "@/lib/store-selection";
import { DesktopNavigation, MobileNavigation, SettingsNavigation, StoreSwitcher } from "@/components/app-navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const admin = createAdminClient();
  const storeIds = await getAccessibleStoreIds(user);
  const [{ data: stores }, { count: unread }] = admin ? await Promise.all([
    storeIds.length ? admin.from("stores").select("id,name,shop_domain").in("id", storeIds).order("created_at") : Promise.resolve({ data: [] }),
    admin.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).or(`user_id.eq.${user.id},user_id.is.null`),
  ]) : [{ data: [] }, { count: 0 }];
  const storeOptions = (stores ?? []).map((store) => ({ id: String(store.id), name: String(store.name), shop_domain: String(store.shop_domain) }));
  const activeStoreId = await getSelectedStoreId(storeOptions.map((store) => store.id));
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
          <StoreSwitcher stores={storeOptions} activeStoreId={activeStoreId} />
        </div>
        <DesktopNavigation unread={unread ?? 0} />
        <div className="mt-auto p-3">
          <Separator className="mb-3" />
          <SettingsNavigation />
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
            <Button size="icon" variant="ghost" aria-label="Notifications" className="relative" asChild><Link href="/notifications"><Bell className="size-4" />{Boolean(unread) && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />}</Link></Button>
            {user.role === "admin" && <Button size="sm" className="hidden sm:inline-flex" asChild><Link href="/stores">Add store</Link></Button>}
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 sm:py-8">{children}</main>
        <MobileNavigation />
      </div>
    </div>
  );
}
