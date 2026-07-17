import "server-only";

import { Buffer } from "node:buffer";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { decodeRateLimitRow } from "./rate-limit-result.mjs";
import type { Database } from "./database.types.ts";
import { decodePublishedPack } from "../packs/published-pack-core.mjs";
import type { PublishedPack } from "../packs/published-pack.ts";

let internalClient: SupabaseClient<Database> | undefined;

function requiredServerEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required server configuration: ${name}`);
  }
  return value;
}

function getInternalClient() {
  internalClient ??= createClient<Database>(
    requiredServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredServerEnv("SUPABASE_SECRET_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  return internalClient;
}

export type ConsumeRateLimitInput = Readonly<{
  keyHash: Uint8Array;
  action: string;
  windowSeconds: number;
  limit: number;
  signal?: AbortSignal;
}>;

export type ConsumeRateLimitResult = Readonly<{
  allowed: boolean;
  currentCount: number;
  limitCount: number;
  retryAfterSeconds: number;
  windowStart: string;
  expiresAt: string;
}>;

export async function consumeRateLimit(
  input: ConsumeRateLimitInput,
): Promise<ConsumeRateLimitResult> {
  if (input.keyHash.byteLength !== 32) {
    throw new Error("Rate limit key must be 32 bytes");
  }

  let query = getInternalClient().rpc("consume_rate_limit", {
    p_key_hash: `\\x${Buffer.from(input.keyHash).toString("hex")}`,
    p_action: input.action,
    p_window_seconds: input.windowSeconds,
    p_limit: input.limit,
  });
  if (input.signal) {
    query = query.abortSignal(input.signal);
  }

  const { data, error } = await query;
  const row = Array.isArray(data) ? data[0] : undefined;
  if (error || !row) {
    throw new Error("Internal rate limit RPC failed");
  }

  return decodeRateLimitRow(row);
}

export async function getPublishedPack(input: {
  slug: string;
  signal?: AbortSignal;
}): Promise<PublishedPack | null> {
  let query = getInternalClient().rpc("get_published_pack", {
    p_slug: input.slug,
  });
  if (input.signal) query = query.abortSignal(input.signal);

  const { data, error } = await query;
  if (error) throw new Error("Internal pack catalog RPC failed");
  if (data === null) return null;
  try {
    return decodePublishedPack(data) as PublishedPack;
  } catch {
    throw new Error("Internal pack catalog RPC failed");
  }
}
