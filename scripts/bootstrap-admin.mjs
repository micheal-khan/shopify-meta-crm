import { createClient } from "@supabase/supabase-js";

const [email, password, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(" ") || "CRM Admin";
if (!email || !email.includes("@") || !password || password.length < 12) {
  console.error("Usage: npm run bootstrap-admin -- admin@example.com 'strong-password' 'Full Name'");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Supabase admin environment is missing.");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { count, error: countError } = await supabase.from("profiles").select("id", { count: "exact", head: true });
if (countError) throw countError;
if ((count ?? 0) > 0) throw new Error("Bootstrap is locked because a CRM profile already exists. Use Settings to invite users.");
const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
if (error || !data.user) throw error ?? new Error("User creation failed.");
const { error: profileError } = await supabase.from("profiles").update({ role: "admin", full_name: fullName }).eq("id", data.user.id);
if (profileError) throw profileError;
console.log(`Initial administrator created for ${email}. Bootstrap is now permanently locked.`);
