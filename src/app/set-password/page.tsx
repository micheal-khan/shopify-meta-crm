import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SetPasswordForm } from "@/components/set-password-form";
import { requireUser } from "@/lib/auth";

export default async function SetPasswordPage() { await requireUser(); return <main className="grid min-h-screen place-items-center p-6"><Card className="w-full max-w-md"><CardHeader><CardTitle>Choose your password</CardTitle><CardDescription>Finish setting up your private SignalDesk account.</CardDescription></CardHeader><CardContent><SetPasswordForm /></CardContent></Card></main>; }
