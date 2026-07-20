import { decodeOwnerProfile } from "./owner-profile-core.mjs";
import type { OwnerProfile } from "./owner-profile";
import { isOwnerPlayId } from "../owner-play/owner-play-state-core.mjs";

export class OwnerProfileHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("Owner profile request failed");
    this.name = "OwnerProfileHttpError";
    this.status = status;
  }
}

function privateNoStore(response: Response) {
  if (response.headers.get("cache-control") !== "private, no-store") {
    throw new OwnerProfileHttpError(response.status);
  }
}

export async function loadOwnerProfile(playId: string): Promise<OwnerProfile> {
  if (!isOwnerPlayId(playId)) throw new OwnerProfileHttpError(400);
  const response = await fetch(
    `/api/me/profile?playId=${encodeURIComponent(playId)}`,
    {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  privateNoStore(response);
  if (response.status !== 200) throw new OwnerProfileHttpError(response.status);
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new OwnerProfileHttpError(response.status);
  }
  return decodeOwnerProfile(value) as OwnerProfile;
}

async function recordOwnerProfileEvent(
  playId: string,
  event: "profile_viewed" | "profile_reshare_clicked",
): Promise<void> {
  if (!isOwnerPlayId(playId)) throw new OwnerProfileHttpError(400);
  const response = await fetch("/api/me/profile/events", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event, playId }),
    keepalive: true,
  });
  privateNoStore(response);
  if (response.status !== 204) throw new OwnerProfileHttpError(response.status);
}

export function recordOwnerProfileViewed(playId: string): Promise<void> {
  return recordOwnerProfileEvent(playId, "profile_viewed");
}

export function recordOwnerProfileReshareClicked(
  playId: string,
): Promise<void> {
  return recordOwnerProfileEvent(playId, "profile_reshare_clicked");
}
