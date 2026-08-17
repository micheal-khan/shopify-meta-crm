import { AppShell } from "@/components/app-shell";
import { InviteForm } from "@/components/invite-form";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { getWorkspaceData } from "@/lib/data";

export default async function SettingsPage() {
  const data = await getWorkspaceData();
  return <AppShell><div className="space-y-7 pb-20 lg:pb-0"><PageHeading eyebrow="Administration" title="Settings" description="Team access and fail-closed production safety." /><div className="grid gap-5 xl:grid-cols-2"><Card className="border-white/[0.07] bg-card/60 shadow-none"><CardHeader><CardTitle>Team access</CardTitle><CardDescription>Admin-controlled invitations; public sign-up is not exposed.</CardDescription></CardHeader><CardContent className="space-y-5">{data.user.role === "admin" && <InviteForm />}<div className="space-y-2">{data.profiles.map((profile) => <div key={String(profile.id)} className="flex items-center justify-between rounded-lg border border-white/[0.07] p-4"><div><p className="text-sm font-medium">{profile.full_name ?? "Invited user"}</p><p className="text-xs text-muted-foreground">{profile.email}</p></div><Badge className="capitalize">{profile.role}</Badge></div>)}</div></CardContent></Card><Card className="border-destructive/15 bg-card/60 shadow-none"><CardHeader><CardTitle>Meta production safety</CardTitle><CardDescription>Two independent gates prevent accidental live Purchase events.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="flex items-center justify-between rounded-lg border border-white/[0.07] p-4"><div><p className="text-sm font-medium">Global production sender</p><p className="text-xs text-muted-foreground">Environment-controlled; currently locked</p></div><Switch disabled /></div><div className="rounded-lg border border-primary/15 bg-primary/[0.04] p-4 text-sm text-muted-foreground">Unlock only after Meta Test Events shows correct payloads, Releasit server Purchase is disabled, and browser/server event IDs are proven identical.</div></CardContent></Card></div></div></AppShell>;
}
