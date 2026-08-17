"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export type SyncRun = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  total_items: number | null;
  processed_items: number;
  error_message: string | null;
};

export function SyncStoreButton({ storeId, initialRun = null }: { storeId: string; initialRun?: SyncRun | null }) {
  const router = useRouter();
  const [run, setRun] = useState<SyncRun | null>(initialRun);
  const active = run?.status === "queued" || run?.status === "running";

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/stores/${storeId}/sync`, { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json() as { run: SyncRun | null };
      setRun(body.run);
      if (body.run?.status === "completed") {
        toast.success(`${body.run.processed_items} Shopify orders imported.`);
        router.refresh();
      } else if (body.run?.status === "failed") {
        toast.error(body.run.error_message ?? "Shopify import failed.");
        router.refresh();
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [active, router, storeId]);

  async function startImport() {
    const response = await fetch(`/api/stores/${storeId}/sync`, { method: "POST" });
    const body = await response.json() as { run?: SyncRun; error?: string; alreadyRunning?: boolean };
    if (!response.ok || !body.run) {
      toast.error(body.error ?? "Could not start the Shopify import.");
      return;
    }
    setRun(body.run);
    toast.info(body.alreadyRunning ? "This store import is already running." : "Import started. You can leave this page while it runs.");
  }

  const progress = run?.total_items ? Math.round((run.processed_items / run.total_items) * 100) : 0;
  return <div className="space-y-2">
    <Button variant="outline" disabled={active} onClick={startImport}>
      <RefreshCw className={`size-4 ${active ? "animate-spin" : ""}`} />
      {active ? "Import running" : "Import 30 days"}
    </Button>
    {active && <div className="max-w-sm space-y-1.5 rounded-lg border border-primary/15 bg-primary/[0.04] p-3">
      <div className="flex items-center justify-between text-xs"><span>Background worker is importing orders</span><span className="text-muted-foreground">{run?.total_items ? `${run.processed_items}/${run.total_items}` : "Preparing…"}</span></div>
      <Progress value={progress} className="h-1.5" />
      <p className="text-[11px] text-muted-foreground">You can safely leave this page. A CRM notification will appear when it finishes.</p>
    </div>}
    {run?.status === "completed" && <p className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 className="size-3.5" /> Last import completed: {run.processed_items} orders</p>}
    {run?.status === "failed" && <p className="flex items-start gap-1.5 text-xs text-destructive"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {run.error_message ?? "Import failed. Please retry."}</p>}
  </div>;
}

export function ReconcileStoreButton({ storeId, initialRun = null }: { storeId: string; initialRun?: SyncRun | null }) {
  const router = useRouter();
  const [run, setRun] = useState<SyncRun | null>(initialRun);
  const active = run?.status === "queued" || run?.status === "running";

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/stores/${storeId}/reconcile`, { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json() as { run: SyncRun | null };
      setRun(body.run);
      if (body.run?.status === "completed") {
        toast.success(`${body.run.processed_items} recent Shopify orders checked.`);
        router.refresh();
      } else if (body.run?.status === "failed") {
        toast.error(body.run.error_message ?? "Shopify reconciliation failed.");
        router.refresh();
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [active, router, storeId]);

  async function startReconciliation() {
    const response = await fetch(`/api/stores/${storeId}/reconcile`, { method: "POST" });
    const body = await response.json() as { run?: SyncRun; error?: string; alreadyRunning?: boolean };
    if (!response.ok || !body.run) {
      toast.error(body.error ?? "Could not start Shopify reconciliation.");
      return;
    }
    setRun(body.run);
    toast.info(body.alreadyRunning ? "Reconciliation is already running." : "Recent Shopify changes are being checked in the background.");
  }

  return <div className="space-y-2">
    <Button variant="outline" disabled={active} onClick={startReconciliation}>
      <RefreshCw className={`size-4 ${active ? "animate-spin" : ""}`} />
      {active ? "Checking updates" : "Reconcile recent changes"}
    </Button>
    {active && <p className="text-xs text-muted-foreground">Checking the last 7 days and retrying missed webhooks. You can leave this page.</p>}
    {run?.status === "failed" && <p className="flex items-start gap-1.5 text-xs text-destructive"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {run.error_message ?? "Reconciliation failed. Please retry."}</p>}
  </div>;
}

export function RetryMetaButton() {
  const router = useRouter(); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  return <div className="flex items-center gap-2"><Button variant="outline" disabled={pending} onClick={async () => {
    setPending(true); const response = await fetch("/api/meta/process", { method: "POST" }); const body = await response.json();
    setMessage(response.ok ? `${body.processed} processed` : body.error); setPending(false); router.refresh();
  }}><RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} /> {pending ? "Retrying…" : "Retry failures"}</Button>{message && <span className="text-xs text-muted-foreground">{message}</span>}</div>;
}
