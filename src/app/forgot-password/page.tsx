import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  return <main className="grid min-h-screen place-items-center p-6"><Card className="w-full max-w-md"><CardHeader><CardTitle>Reset your password</CardTitle><CardDescription>We only send reset links to existing CRM accounts.</CardDescription></CardHeader><CardContent className="space-y-4"><ForgotPasswordForm /><p className="text-center text-xs"><Link className="text-primary hover:underline" href="/login">Back to sign in</Link></p></CardContent></Card></main>;
}
