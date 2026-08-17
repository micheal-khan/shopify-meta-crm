"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SyncStoreButton({ storeId }: { storeId: string }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  return <div className="flex items-center gap-2"><Button variant="outline" disabled={pending} onClick={async () => {
    setPending(true); setMessage(""); const response = await fetch(`/api/stores/${storeId}/sync`, { method: "POST" }); const body = await response.json();
    setMessage(response.ok ? `${body.imported} imported` : body.error); setPending(false); router.refresh();
  }}><RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} /> {pending ? "Importing…" : "Import 30 days"}</Button>{message && <span className="text-xs text-muted-foreground">{message}</span>}</div>;
}

export function RetryMetaButton() {
  const router = useRouter(); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  return <div className="flex items-center gap-2"><Button variant="outline" disabled={pending} onClick={async () => {
    setPending(true); const response = await fetch("/api/meta/process", { method: "POST" }); const body = await response.json();
    setMessage(response.ok ? `${body.processed} processed` : body.error); setPending(false); router.refresh();
  }}><RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} /> {pending ? "Retrying…" : "Retry failures"}</Button>{message && <span className="text-xs text-muted-foreground">{message}</span>}</div>;
}
