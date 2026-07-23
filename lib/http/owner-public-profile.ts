import "server-only";

import {
  getAuthenticatedOwnerPublicProfile,
  setAuthenticatedOwnerNickname,
} from "../db/internal-rpc.ts";
import { normalizeOwnerNickname } from "../auth/owner-public-profile-core.mjs";
import {
  authenticatedOwnerFailureResponse,
  isOwnerAuthenticationUnavailable,
} from "./auth-errors.ts";
import { privateNoStore } from "./owner-play.ts";

export async function loadOwnerPublicProfileGate() {
  if (
    process.env.NODE_ENV !== "production" &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  ) {
    return null;
  }
  try {
    return await getAuthenticatedOwnerPublicProfile();
  } catch (error) {
    if (isOwnerAuthenticationUnavailable(error)) return null;
    throw error;
  }
}

export async function saveOwnerPublicProfileResponse(input: {
  nickname: string;
}) {
  const nickname = normalizeOwnerNickname(input.nickname);
  if (nickname === null) {
    return privateNoStore(
      Response.json(
        {
          code: "INVALID_NICKNAME",
          message: "닉네임은 한글, 영문, 숫자로 2~12자까지 입력해 주세요.",
        },
        { status: 400 },
      ),
    );
  }
  try {
    const result = await setAuthenticatedOwnerNickname({ nickname });
    return privateNoStore(Response.json({ nickname: result.nickname }));
  } catch (error) {
    return authenticatedOwnerFailureResponse(error);
  }
}
