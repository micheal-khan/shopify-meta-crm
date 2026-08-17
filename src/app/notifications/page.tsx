import Link from "next/link";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MarkNotificationsRead } from "@/components/notification-actions";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getWorkspaceData } from "@/lib/data";

const icons = { success: CircleCheck, error: CircleX, warning: TriangleAlert, info: Info };
const colors = { success: "text-emerald-400", error: "text-red-400", warning: "text-amber-300", info: "text-sky-400" };
export default async function NotificationsPage() {
  const data = await getWorkspaceData();
  const unread = data.notifications.filter((note) => !note.read_at).length;
  return <AppShell><div className="space-y-7 pb-20 lg:pb-0"><PageHeading eyebrow="Inbox" title="Notifications" description="Operational alerts, import results and Shopify synchronization warnings." actions={unread ? <MarkNotificationsRead all /> : undefined} /><Card className="border-white/[0.07] bg-card/60 shadow-none"><CardContent className="divide-y divide-white/[0.06] p-0">{data.notifications.map((note) => { const level = note.level as keyof typeof icons; const Icon = icons[level] ?? Info; const isUnread = !note.read_at; return <div key={String(note.id)} className={`flex gap-4 p-5 ${isUnread ? "bg-primary/[0.035]" : "opacity-75"}`}><div className="relative"><Icon className={`mt-0.5 size-5 shrink-0 ${colors[level] ?? colors.info}`} />{isUnread && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-primary" />}</div><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-1 sm:flex-row sm:gap-4"><p className="text-sm font-medium">{note.title}</p><span className="shrink-0 text-xs text-muted-foreground">{new Date(String(note.created_at)).toLocaleString("en-IN")}</span></div><p className="mt-1 text-sm text-muted-foreground">{note.message}</p><div className="mt-3 flex gap-2">{note.link && <Button size="xs" variant="ghost" asChild><Link href={String(note.link)}>Open</Link></Button>}{isUnread && <MarkNotificationsRead id={String(note.id)} />}</div></div></div>; })}{!data.notifications.length && <p className="p-6 text-sm text-muted-foreground">No notifications yet.</p>}</CardContent></Card></div></AppShell>;
}
