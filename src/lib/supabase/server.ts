import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";

export async function createClient() {
  const env = getPublicEnv();
  if (!env.success) return null;
  const cookieStore = await cookies();
  return createServerClient(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot always write cookies; src/proxy.ts refreshes sessions.
        }
      },
    },
  });
}
