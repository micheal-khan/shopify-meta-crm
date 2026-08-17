import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { Card, CardContent } from "@/components/ui/card";
import { getWorkspaceData } from "@/lib/data";

const icons = { success: CircleCheck, error: CircleX, warning: TriangleAlert, info: Info };
const colors = { success: "text-emerald-400", error: "text-red-400", warning: "text-amber-300", info: "text-sky-400" };
export default async function NotificationsPage() {
  const data = await getWorkspaceData();
  return <AppShell><div className="space-y-7 pb-20 lg:pb-0"><PageHeading eyebrow="Inbox" title="Notifications" description="Operational alerts, import results and delivery warnings." /><Card className="border-white/[0.07] bg-card/60 shadow-none"><CardContent className="divide-y divide-white/[0.06] p-0">{data.notifications.map((note) => { const level = note.level as keyof typeof icons; const Icon = icons[level] ?? Info; return <div key={String(note.id)} className="flex gap-4 p-5"><Icon className={`mt-0.5 size-5 shrink-0 ${colors[level] ?? colors.info}`} /><div className="flex-1"><div className="flex justify-between gap-4"><p className="text-sm font-medium">{note.title}</p><span className="shrink-0 text-xs text-muted-foreground">{new Date(String(note.created_at)).toLocaleString("en-IN")}</span></div><p className="mt-1 text-sm text-muted-foreground">{note.message}</p></div></div>; })}{!data.notifications.length && <p className="p-6 text-sm text-muted-foreground">No notifications yet.</p>}</CardContent></Card></div></AppShell>;
}
