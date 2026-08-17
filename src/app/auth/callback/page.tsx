"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter(); const [error, setError] = useState("");
  useEffect(() => { void (async () => {
    const supabase = createClient(); const code = new URLSearchParams(window.location.search).get("code");
    if (code) { const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code); if (exchangeError) return setError(exchangeError.message); }
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setError("The invitation link is invalid or expired.");
    router.replace("/set-password"); router.refresh();
  })(); }, [router]);
  return <main className="grid min-h-screen place-items-center p-6"><p className={error ? "text-destructive" : "text-muted-foreground"}>{error || "Confirming your invitation…"}</p></main>;
}
