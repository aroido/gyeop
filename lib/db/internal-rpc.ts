import "server-only";

import { Buffer } from "node:buffer";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { decodeRateLimitRow } from "./rate-limit-result.mjs";
import type { Database } from "./database.types.ts";
import { decodeOwnerPlayOutcome } from "../owner-play/owner-play-session-core.mjs";
import type { OwnerPlayState } from "../owner-play/owner-play-session.ts";
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

function bytea(value: Uint8Array) {
  if (value.byteLength !== 32) throw new Error("Owner hash must be 32 bytes");
  return `\\x${Buffer.from(value).toString("hex")}`;
}

function nullableRpcString(value: string | null): string {
  return value!;
}

export type CreateOrResumeOwnerPlayInput = Readonly<{
  packSlug: string;
  existing?: Readonly<{
    playId: string;
    managementSecretHash: Uint8Array;
  }>;
  created?: Readonly<{
    playId: string;
    managementSecretHash: Uint8Array;
  }>;
  networkKey: Uint8Array;
  signal?: AbortSignal;
}>;

export type CreateOrResumeOwnerPlayResult =
  | Readonly<{ outcome: "created" | "resumed"; play: OwnerPlayState }>
  | Readonly<{ outcome: "rate_limited"; retryAfterSeconds: number }>
  | Readonly<{
      outcome: "pack_not_found" | "expired" | "not_found" | "wrong_pack";
    }>;

export async function createOrResumeOwnerPlay(
  input: CreateOrResumeOwnerPlayInput,
): Promise<CreateOrResumeOwnerPlayResult> {
  if ((input.existing === undefined) === (input.created === undefined)) {
    throw new Error("Exactly one owner play branch is required");
  }
  let query = getInternalClient().rpc("create_or_resume_play", {
    p_pack_slug: input.packSlug,
    p_existing_play_id: nullableRpcString(input.existing?.playId ?? null),
    p_existing_secret_hash: nullableRpcString(
      input.existing ? bytea(input.existing.managementSecretHash) : null,
    ),
    p_new_play_id: nullableRpcString(input.created?.playId ?? null),
    p_new_secret_hash: nullableRpcString(
      input.created ? bytea(input.created.managementSecretHash) : null,
    ),
    p_network_key: bytea(input.networkKey),
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error("Internal owner play RPC failed");
  return decodeOwnerPlayOutcome(data, [
    "created",
    "resumed",
    "rate_limited",
    "pack_not_found",
    "expired",
    "not_found",
    "wrong_pack",
  ]) as CreateOrResumeOwnerPlayResult;
}

export type GetOwnerPlayResult =
  | Readonly<{ outcome: "authorized"; play: OwnerPlayState }>
  | Readonly<{ outcome: "expired" | "not_found" }>;

export async function getOwnerPlay(input: {
  playId: string;
  managementSecretHash: Uint8Array;
  signal?: AbortSignal;
}): Promise<GetOwnerPlayResult> {
  let query = getInternalClient().rpc("get_owner_play", {
    p_play_id: input.playId,
    p_management_secret_hash: bytea(input.managementSecretHash),
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error("Internal owner play RPC failed");
  return decodeOwnerPlayOutcome(data, [
    "authorized",
    "expired",
    "not_found",
  ]) as GetOwnerPlayResult;
}

export type SaveOwnerAnswerResult =
  | Readonly<{
      outcome: "saved" | "completed";
      play: OwnerPlayState;
    }>
  | Readonly<{ outcome: "expired" | "not_found" | "invalid_card" }>;

export async function saveOwnerAnswer(input: {
  playId: string;
  managementSecretHash: Uint8Array;
  cardId: string;
  choice: "a" | "b";
  currentPosition: number;
  signal?: AbortSignal;
}): Promise<SaveOwnerAnswerResult> {
  let query = getInternalClient().rpc("save_owner_answer", {
    p_play_id: input.playId,
    p_management_secret_hash: bytea(input.managementSecretHash),
    p_card_id: input.cardId,
    p_choice: input.choice,
    p_current_position: input.currentPosition,
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error("Internal owner play RPC failed");
  return decodeOwnerPlayOutcome(data, [
    "saved",
    "completed",
    "expired",
    "not_found",
    "invalid_card",
  ]) as SaveOwnerAnswerResult;
}

export type CompleteOwnerPlayResult =
  | Readonly<{
      outcome: "completed" | "incomplete";
      play: OwnerPlayState;
    }>
  | Readonly<{ outcome: "expired" | "not_found" }>;

export async function completeOwnerPlay(input: {
  playId: string;
  managementSecretHash: Uint8Array;
  signal?: AbortSignal;
}): Promise<CompleteOwnerPlayResult> {
  let query = getInternalClient().rpc("complete_owner_play", {
    p_play_id: input.playId,
    p_management_secret_hash: bytea(input.managementSecretHash),
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error("Internal owner play RPC failed");
  return decodeOwnerPlayOutcome(data, [
    "completed",
    "incomplete",
    "expired",
    "not_found",
  ]) as CompleteOwnerPlayResult;
}

export async function revokeOwnerPlaySession(input: {
  playId: string;
  managementSecretHash: Uint8Array;
  signal?: AbortSignal;
}) {
  let query = getInternalClient().rpc("revoke_owner_play_session", {
    p_play_id: input.playId,
    p_management_secret_hash: bytea(input.managementSecretHash),
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error || typeof data !== "boolean") {
    throw new Error("Internal owner play RPC failed");
  }
  return data;
}
