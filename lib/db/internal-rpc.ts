import "server-only";

import { Buffer } from "node:buffer";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { decodeRateLimitRow } from "./rate-limit-result.mjs";
import type { Database } from "./database.types.ts";
import { decodeOwnerPlayOutcome } from "../owner-play/owner-play-session-core.mjs";
import type { OwnerPlayState } from "../owner-play/owner-play-session.ts";
import { decodePublishedPack } from "../packs/published-pack-core.mjs";
import type { PublishedPack } from "../packs/published-pack.ts";
import {
  decodeCreateShareLinkOutcome,
  decodeDisableShareLinkOutcome,
  decodeInviteMetadataOutcome,
  decodeListShareLinksOutcome,
  decodeRecordShareActionOutcome,
  decodeRotateShareLinkOutcome,
} from "../share-links/share-link-state-core.mjs";
import {
  decodeGetVisitorResponseOutcome,
  decodeRecordVisitorResponseEventOutcome,
  decodeSaveResponseAnswerOutcome,
  decodeStartResponseOutcome,
  decodeSubmitResponseOutcome,
} from "../visitor-response/visitor-session-core.mjs";

let internalClient: SupabaseClient<Database> | undefined;

type ShareLinkState = Readonly<{
  id: string;
  publicId: string;
  kind: "public" | "one_to_one";
  status: "active" | "disabled" | "expired";
  expiresAt: string | null;
  consumedAt: null;
}>;
type ShareManagementState = Readonly<{
  managementExpiresAt: string;
  managementTtlSeconds: 604800;
}>;
type OwnerShareFailure = Readonly<{
  outcome: "expired" | "not_found" | "not_completed";
}>;
type CreateShareLinkResult =
  | (ShareManagementState &
      Readonly<{ outcome: "created"; link: ShareLinkState }>)
  | OwnerShareFailure
  | Readonly<{ outcome: "collision" }>;
type DisableShareLinkResult =
  | (ShareManagementState &
      Readonly<{ outcome: "disabled"; link: ShareLinkState }>)
  | OwnerShareFailure
  | Readonly<{ outcome: "link_not_found" }>;
type RotateShareLinkResult =
  | (ShareManagementState &
      Readonly<{ outcome: "rotated"; link: ShareLinkState }>)
  | OwnerShareFailure
  | Readonly<{
      outcome: "collision" | "link_not_found" | "link_not_active";
    }>;
type ListShareLinksResult =
  | (ShareManagementState &
      Readonly<{ outcome: "listed"; links: readonly ShareLinkState[] }>)
  | OwnerShareFailure;
type InviteMetadataResult =
  | Readonly<{
      outcome: "active";
      metadata: Readonly<{
        packSlug: string;
        packVersion: string;
        packTitle: string;
        kind: "public" | "one_to_one";
      }>;
    }>
  | Readonly<{ outcome: "invalid" | "unavailable" }>;
type RecordShareActionResult =
  | (ShareManagementState & Readonly<{ outcome: "recorded" }>)
  | OwnerShareFailure
  | Readonly<{ outcome: "link_not_found" | "link_not_active" }>;
type VisitorAssignmentBase = Readonly<{
  cardId: string;
  stage: "required";
  position: 1 | 2 | 3;
  visitorPrompt: string;
  optionA: string;
  optionB: string;
  isSignature: boolean;
  visitorChoice: "a" | "b" | null;
}>;
type VisitorResponseBase = Readonly<{
  id: string;
  relationshipCode: string;
  knownSinceCode: string;
  sessionExpiresAt: string;
  sessionTtlSeconds: number;
}>;
export type VisitorResponseState =
  | (VisitorResponseBase &
      Readonly<{
        status: "draft";
        assignments: readonly VisitorAssignmentBase[];
      }>)
  | (VisitorResponseBase &
      Readonly<{
        status: "submitted";
        allMatched: boolean;
        assignments: readonly Readonly<
          VisitorAssignmentBase & {
            packPosition: number;
            visitorChoice: "a" | "b";
            ownerChoice: "a" | "b";
            matches: boolean;
            isHighlight: boolean;
          }
        >[];
      }>);
export type StartResponseResult =
  | Readonly<{
      outcome: "created" | "resumed";
      response: VisitorResponseState;
    }>
  | Readonly<{ outcome: "rate_limited"; retryAfterSeconds: number }>
  | Readonly<{
      outcome: "collision" | "no_session" | "session_invalid" | "unavailable";
    }>;

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
  if (value.byteLength !== 32) throw new Error("Hash must be 32 bytes");
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

export async function createShareLink(input: {
  playId: string;
  managementSecretHash: Uint8Array;
  linkId: string;
  publicId: string;
  secretHash: Uint8Array;
  kind: "public" | "one_to_one";
  signal?: AbortSignal;
}): Promise<CreateShareLinkResult> {
  let query = getInternalClient().rpc("create_share_link", {
    p_play_id: input.playId,
    p_management_secret_hash: bytea(input.managementSecretHash),
    p_link_id: input.linkId,
    p_public_id: input.publicId,
    p_secret_hash: bytea(input.secretHash),
    p_kind: input.kind,
    p_expires_at: nullableRpcString(null),
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error("Internal share link RPC failed");
  return decodeCreateShareLinkOutcome(data) as CreateShareLinkResult;
}

export async function disableShareLink(input: {
  playId: string;
  managementSecretHash: Uint8Array;
  linkId: string;
  signal?: AbortSignal;
}): Promise<DisableShareLinkResult> {
  let query = getInternalClient().rpc("disable_share_link", {
    p_play_id: input.playId,
    p_management_secret_hash: bytea(input.managementSecretHash),
    p_link_id: input.linkId,
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error("Internal share link RPC failed");
  return decodeDisableShareLinkOutcome(data) as DisableShareLinkResult;
}

export async function rotateShareLink(input: {
  playId: string;
  managementSecretHash: Uint8Array;
  linkId: string;
  linkIdNew: string;
  publicId: string;
  secretHash: Uint8Array;
  signal?: AbortSignal;
}): Promise<RotateShareLinkResult> {
  let query = getInternalClient().rpc("rotate_share_link", {
    p_play_id: input.playId,
    p_management_secret_hash: bytea(input.managementSecretHash),
    p_link_id: input.linkId,
    p_new_link_id: input.linkIdNew,
    p_new_public_id: input.publicId,
    p_new_secret_hash: bytea(input.secretHash),
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error("Internal share link RPC failed");
  return decodeRotateShareLinkOutcome(data) as RotateShareLinkResult;
}

export async function listOwnerShareLinks(input: {
  playId: string;
  managementSecretHash: Uint8Array;
  signal?: AbortSignal;
}): Promise<ListShareLinksResult> {
  let query = getInternalClient().rpc("list_owner_share_links", {
    p_play_id: input.playId,
    p_management_secret_hash: bytea(input.managementSecretHash),
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error("Internal share link RPC failed");
  return decodeListShareLinksOutcome(data) as ListShareLinksResult;
}

export async function recordOwnerShareAction(input: {
  playId: string;
  managementSecretHash: Uint8Array;
  linkId: string;
  event: "share_handoff_succeeded" | "share_link_copied";
  signal?: AbortSignal;
}): Promise<RecordShareActionResult> {
  let query = getInternalClient().rpc("record_owner_share_action", {
    p_play_id: input.playId,
    p_management_secret_hash: bytea(input.managementSecretHash),
    p_link_id: input.linkId,
    p_event_name: input.event,
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error("Internal share action RPC failed");
  return decodeRecordShareActionOutcome(data) as RecordShareActionResult;
}

export async function getInviteMetadata(input: {
  publicId: string;
  secretHash: Uint8Array;
  signal?: AbortSignal;
}): Promise<InviteMetadataResult> {
  let query = getInternalClient().rpc("get_invite_metadata", {
    p_public_id: input.publicId,
    p_secret_hash: bytea(input.secretHash),
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error("Internal invite metadata RPC failed");
  return decodeInviteMetadataOutcome(data) as InviteMetadataResult;
}

export async function startResponse(input: {
  publicId: string;
  secretHash: Uint8Array;
  intent: "resume" | "start";
  existing?: Readonly<{
    responseId: string;
    sessionTokenHash: Uint8Array;
  }>;
  created?: Readonly<{
    responseId: string;
    sessionTokenHash: Uint8Array;
    relationshipCode: string;
    knownSinceCode: string;
  }>;
  rateLimitKey: Uint8Array;
  signal?: AbortSignal;
}): Promise<StartResponseResult> {
  if (
    (input.intent === "resume" && input.created !== undefined) ||
    (input.intent === "start" && input.created === undefined)
  ) {
    throw new Error("Invalid response start branch");
  }
  let query = getInternalClient().rpc("start_required_response", {
    p_public_id: input.publicId,
    p_secret_hash: bytea(input.secretHash),
    p_intent: input.intent,
    p_existing_response_id: nullableRpcString(
      input.existing?.responseId ?? null,
    ),
    p_existing_session_hash: nullableRpcString(
      input.existing ? bytea(input.existing.sessionTokenHash) : null,
    ),
    p_new_response_id: nullableRpcString(input.created?.responseId ?? null),
    p_new_session_hash: nullableRpcString(
      input.created ? bytea(input.created.sessionTokenHash) : null,
    ),
    p_relationship_code: nullableRpcString(
      input.created?.relationshipCode ?? null,
    ),
    p_known_since_code: nullableRpcString(
      input.created?.knownSinceCode ?? null,
    ),
    p_rate_limit_key: bytea(input.rateLimitKey),
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error("Internal visitor response RPC failed");
  return decodeStartResponseOutcome(data) as StartResponseResult;
}

export type GetVisitorResponseResult =
  | Readonly<{ outcome: "authorized"; response: VisitorResponseState }>
  | Readonly<{ outcome: "session_invalid" }>;

export async function getVisitorResponse(input: {
  responseId: string;
  sessionTokenHash: Uint8Array;
  signal?: AbortSignal;
}): Promise<GetVisitorResponseResult> {
  let query = getInternalClient().rpc("get_visitor_response", {
    p_response_id: input.responseId,
    p_session_hash: bytea(input.sessionTokenHash),
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error("Internal visitor response RPC failed");
  return decodeGetVisitorResponseOutcome(data) as GetVisitorResponseResult;
}

export type SaveResponseAnswerResult =
  | Readonly<{ outcome: "saved"; response: VisitorResponseState }>
  | Readonly<{ outcome: "invalid_card" }>
  | Readonly<{ outcome: "session_invalid" }>
  | Readonly<{ outcome: "submitted" }>;

export async function saveResponseAnswer(input: {
  responseId: string;
  sessionTokenHash: Uint8Array;
  cardId: string;
  choice: "a" | "b";
  signal?: AbortSignal;
}): Promise<SaveResponseAnswerResult> {
  let query = getInternalClient().rpc("save_response_answer", {
    p_response_id: input.responseId,
    p_session_hash: bytea(input.sessionTokenHash),
    p_card_id: input.cardId,
    p_choice: input.choice,
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error("Internal visitor response RPC failed");
  return decodeSaveResponseAnswerOutcome(data) as SaveResponseAnswerResult;
}

export type SubmitResponseResult =
  | Readonly<{ outcome: "submitted"; response: VisitorResponseState }>
  | Readonly<{ outcome: "conflict" }>
  | Readonly<{ outcome: "incomplete" }>
  | Readonly<{ outcome: "session_invalid" }>;

export async function submitResponse(input: {
  responseId: string;
  sessionTokenHash: Uint8Array;
  managementHash: Uint8Array;
  signal?: AbortSignal;
}): Promise<SubmitResponseResult> {
  let query = getInternalClient().rpc("submit_response", {
    p_response_id: input.responseId,
    p_session_hash: bytea(input.sessionTokenHash),
    p_management_hash: bytea(input.managementHash),
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error("Internal visitor response RPC failed");
  return decodeSubmitResponseOutcome(data) as SubmitResponseResult;
}

export async function recordVisitorResponseEvent(input: {
  responseId: string;
  sessionTokenHash: Uint8Array;
  event: "comparison_viewed" | "same_pack_start_clicked";
  signal?: AbortSignal;
}) {
  let query = getInternalClient().rpc("record_visitor_response_event", {
    p_response_id: input.responseId,
    p_session_hash: bytea(input.sessionTokenHash),
    p_event_name: input.event,
  });
  if (input.signal) query = query.abortSignal(input.signal);
  const { data, error } = await query;
  if (error) throw new Error("Internal visitor response RPC failed");
  return decodeRecordVisitorResponseEventOutcome(data) as Readonly<{
    outcome: "recorded" | "session_invalid";
  }>;
}
