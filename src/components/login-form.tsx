"use client";

import { useActionState } from "react";
import { login } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return <form action={action} className="space-y-5">
    <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
    <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="current-password" minLength={8} required /></div>
    {state?.error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}
    <Button className="w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
    <p className="text-center text-xs"><Link className="text-primary hover:underline" href="/forgot-password">Forgot your password?</Link></p>
  </form>;
}
