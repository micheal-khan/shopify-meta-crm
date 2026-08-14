import { redirect } from "next/navigation";
import { RadioTower, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return <main className="grid min-h-screen place-items-center bg-background p-5">
    <div className="w-full max-w-md space-y-6">
      <div className="flex items-center justify-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground"><RadioTower className="size-5" /></span><div><h1 className="font-semibold">SignalDesk</h1><p className="text-xs text-muted-foreground">Shopify → Meta operations</p></div></div>
      <Card className="border-white/[0.08] bg-card/80"><CardHeader><CardTitle>Welcome back</CardTitle><CardDescription>Use the account invited by your CRM administrator.</CardDescription></CardHeader><CardContent><LoginForm /></CardContent></Card>
      <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" /> Private workspace. There is no public sign-up.</p>
    </div>
  </main>;
}
