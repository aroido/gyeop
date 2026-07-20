import { isOwnerPlayId } from "@/lib/owner-play/owner-play-state-core.mjs";
import { parseOwnerReturnTo } from "@/lib/auth/owner-claim-context-core.mjs";

import SignInForm from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[];
    playId?: string | string[];
    returnTo?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const playId = typeof query.playId === "string" ? query.playId : null;
  const requestedReturnTo =
    typeof query.returnTo === "string" ? query.returnTo : "/me";
  let returnTo = "/me";
  try {
    returnTo = parseOwnerReturnTo(requestedReturnTo);
  } catch {
    // Invalid external return targets fall back to the private owner page.
  }
  const claimPlayId =
    playId && isOwnerPlayId(playId) && returnTo === `/me/plays/${playId}`
      ? playId
      : null;
  return (
    <SignInForm
      playId={claimPlayId}
      returnTo={claimPlayId ? returnTo : "/me"}
      callbackFailed={query.error === "callback" || query.error === "claim"}
      localEmailPreview={process.env.NODE_ENV !== "production"}
    />
  );
}
