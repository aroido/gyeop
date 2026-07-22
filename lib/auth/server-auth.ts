import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function requiredPublicEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required public Supabase configuration: ${name}`);
  }
  return value;
}

export async function createFreshServerAuthClient(options?: {
  requireCookieWrites?: boolean;
}) {
  const cookieStore = await cookies();

  return createServerClient(
    requiredPublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(values) {
          try {
            for (const { name, value, options } of values) {
              cookieStore.set(name, value, options);
            }
          } catch (error) {
            if (options?.requireCookieWrites) throw error;
            // Server Components cannot persist refreshed cookies. Route Handlers can.
          }
        },
      },
    },
  );
}
