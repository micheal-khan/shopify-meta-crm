"use client";

import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function MarkNotificationsRead({ id, all = false }: { id?: string; all?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return <Button size={all ? "default" : "xs"} variant="outline" disabled={pending} onClick={async () => {
    setPending(true);
    const response = await fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, all }) });
    const result = await response.json() as { error?: string };
    setPending(false);
    if (!response.ok) return toast.error(result.error ?? "Could not update notifications.");
    toast.success(all ? "Notifications marked as read." : "Notification marked as read.");
    router.refresh();
  }}><CheckCheck className="size-3.5" /> {pending ? "Updating…" : all ? "Mark all read" : "Mark read"}</Button>;
}
