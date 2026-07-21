import "server-only";

import { createFreshServerAuthClient } from "../auth/server-auth.ts";
import {
  createOwnerClaimContext,
  serializeOwnerClaimCookie,
} from "../auth/owner-claim-context-core.mjs";
import {
  claimAnonymousOwner,
  getAuthenticatedOwnerPlay,
  getOwnerPlay,
  listAuthenticatedOwnerPlays,
} from "../db/internal-rpc.ts";
import type { ParsedOwnerCookie } from "../owner-play/owner-play-session.ts";
import { parseRateLimitSecret } from "../security/network-key.mjs";
import { validateAppUrl } from "./http-boundary-core.mjs";
import { ownerAuthRequiredResponse } from "./auth-errors.ts";
import { ownerNotFoundResponse, privateNoStore } from "./owner-play.ts";

type OwnerCookie = Extract<ParsedOwnerCookie, { outcome: "valid" }>;

async function requireCompletedOwnerClaim(input: {
  cookie: OwnerCookie | null;
  ownerId: string | null;
  playId: string | null;
  signal: AbortSignal;
}) {
  if (input.playId !== null) {
    if (!input.cookie || input.ownerId === null) {
      throw new Error("INVALID_REQUEST");
    }
    const play = await getOwnerPlay({
      playId: input.playId,
      managementSecretHash: input.cookie.managementSecretHash,
      signal: input.signal,
    });
    if (play.outcome !== "authorized" || play.play.status !== "completed") {
      throw new Error("INVALID_REQUEST");
    }
  }
}

function trustedSupabaseAuthorizeUrl(value: string) {
  const configuredValue = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredValue) throw new Error("INTERNAL_ERROR");
  let configured: URL;
  let candidate: URL;
  try {
    configured = new URL(configuredValue);
    candidate = new URL(value);
  } catch {
    throw new Error("INTERNAL_ERROR");
  }
  const basePath = configured.pathname.replace(/\/$/, "");
  if (
    candidate.origin !== configured.origin ||
    candidate.pathname !== `${basePath}/auth/v1/authorize`
  ) {
    throw new Error("INTERNAL_ERROR");
  }
  return candidate.toString();
}

export async function startOwnerGoogleOAuthResponse(input: {
  cookie: OwnerCookie | null;
  ownerId: string | null;
  playId: string | null;
  returnTo: string;
  signal: AbortSignal;
}) {
  await requireCompletedOwnerClaim(input);

  const auth = await createFreshServerAuthClient();
  const appUrl = validateAppUrl(process.env.APP_URL, process.env.NODE_ENV);
  const result = await auth.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: new URL("/auth/callback", appUrl).toString(),
      skipBrowserRedirect: true,
    },
  });
  if (result.error || !result.data.url) throw new Error("INTERNAL_ERROR");

  const context = createOwnerClaimContext({
    ownerId: input.ownerId,
    playId: input.playId,
    returnTo: input.returnTo,
    key: parseRateLimitSecret(process.env.RATE_LIMIT_SECRET),
  });
  const response = privateNoStore(
    new Response(null, {
      status: 303,
      headers: { Location: trustedSupabaseAuthorizeUrl(result.data.url) },
    }),
  );
  response.headers.append("Set-Cookie", serializeOwnerClaimCookie(context));
  return response;
}

export async function sendOwnerTestMagicLinkResponse(input: {
  cookie: OwnerCookie | null;
  email: string;
  ownerId: string | null;
  playId: string | null;
  returnTo: string;
  signal: AbortSignal;
}) {
  await requireCompletedOwnerClaim(input);

  const auth = await createFreshServerAuthClient();
  const appUrl = validateAppUrl(process.env.APP_URL, process.env.NODE_ENV);
  const { error } = await auth.auth.signInWithOtp({
    email: input.email,
    options: {
      emailRedirectTo: new URL("/auth/callback", appUrl).toString(),
      shouldCreateUser: true,
    },
  });
  if (error) throw new Error("INTERNAL_ERROR");

  const context = createOwnerClaimContext({
    ownerId: input.ownerId,
    playId: input.playId,
    returnTo: input.returnTo,
    key: parseRateLimitSecret(process.env.RATE_LIMIT_SECRET),
  });
  const response = privateNoStore(
    Response.json(
      { message: "입력한 이메일로 로그인 링크를 보냈어요." },
      { status: 202 },
    ),
  );
  response.headers.append("Set-Cookie", serializeOwnerClaimCookie(context));
  return response;
}

export async function completeOwnerAuthentication(input: {
  code: string;
  context: Readonly<{
    ownerId: string | null;
    playId: string | null;
    returnTo: string;
  }>;
  cookie: OwnerCookie | null;
}) {
  const auth = await createFreshServerAuthClient();
  const exchange = await auth.auth.exchangeCodeForSession(input.code);
  if (exchange.error) return Object.freeze({ outcome: "callback_failed" });

  if (input.context.ownerId !== null && input.context.playId !== null) {
    if (!input.cookie || input.cookie.playId !== input.context.ownerId) {
      return Object.freeze({ outcome: "claim_failed" });
    }
    const claim = await claimAnonymousOwner({
      anonymousOwnerId: input.context.ownerId,
      managementSecretHash: input.cookie.managementSecretHash,
    });
    if (claim.outcome !== "claimed") {
      return Object.freeze({ outcome: "claim_failed" });
    }
  }

  return Object.freeze({
    outcome: "signed_in",
    returnTo: input.context.returnTo,
  });
}

export async function loadAuthenticatedOwnerPlays() {
  return listAuthenticatedOwnerPlays();
}

export async function listAuthenticatedOwnerPlaysResponse() {
  try {
    const plays = await listAuthenticatedOwnerPlays();
    return privateNoStore(Response.json({ plays }));
  } catch {
    return ownerAuthRequiredResponse();
  }
}

export async function readAuthenticatedOwnerPlayResponse(input: {
  playId: string;
}) {
  try {
    const result = await getAuthenticatedOwnerPlay(input);
    if (result.outcome !== "authorized") return ownerNotFoundResponse();
    return privateNoStore(Response.json(result.play));
  } catch {
    return ownerAuthRequiredResponse();
  }
}
