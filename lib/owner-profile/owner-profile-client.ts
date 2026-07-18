import { decodeOwnerProfile } from "./owner-profile-core.mjs";
import type { OwnerProfile } from "./owner-profile";

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

export async function loadOwnerProfile(): Promise<OwnerProfile> {
  const response = await fetch("/api/me/profile", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });
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

export async function recordOwnerProfileViewed(): Promise<void> {
  const response = await fetch("/api/me/profile/events", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "profile_viewed" }),
    keepalive: true,
  });
  privateNoStore(response);
  if (response.status !== 204) throw new OwnerProfileHttpError(response.status);
}
