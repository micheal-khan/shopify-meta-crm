import { LockKeyhole } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AnalystChat } from "@/components/analyst-chat";
import { PageHeading } from "@/components/page-heading";
import { Card, CardContent } from "@/components/ui/card";

export default function AnalystPage() {
  return <AppShell><div className="space-y-7 pb-20 lg:pb-0"><PageHeading eyebrow="OpenAI" title="AI analyst" description="Ask questions about aggregate store, order and attribution performance—without exposing customer PII." />
    <Card className="mx-auto max-w-4xl border-white/[0.07] bg-card/60 shadow-none"><CardContent className="p-0"><div className="border-b border-white/[0.07] p-5"><div className="flex items-center gap-2 text-sm text-emerald-300"><LockKeyhole className="size-4" /> Privacy guard active</div><p className="mt-1 text-xs text-muted-foreground">Only anonymized totals, trends and campaign labels can be sent to the model.</p></div><AnalystChat enabled={Boolean(process.env.OPENAI_API_KEY)} /></CardContent></Card>
  </div></AppShell>;
}
