import { decodeConceptProfile } from "./concept-profile-core.mjs";
import type { ConceptProfile } from "./concept-profile";
import { isOwnerPlayId } from "../owner-play/owner-play-state-core.mjs";

export class ConceptProfileHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("Concept profile request failed");
    this.name = "ConceptProfileHttpError";
    this.status = status;
  }
}

function requirePrivateNoStore(response: Response) {
  if (response.headers.get("cache-control") !== "private, no-store") {
    throw new ConceptProfileHttpError(response.status);
  }
}

export async function loadConceptProfile(): Promise<ConceptProfile> {
  const response = await fetch("/api/me/concept-profile", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });
  requirePrivateNoStore(response);
  if (response.status !== 200) {
    throw new ConceptProfileHttpError(response.status);
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ConceptProfileHttpError(response.status);
  }
  return decodeConceptProfile(value) as ConceptProfile;
}

async function recordConceptProfileEvent(
  playId: string,
  event: "concept_profile_viewed" | "concept_detail_opened",
  conceptId?: string,
): Promise<void> {
  if (!isOwnerPlayId(playId)) throw new ConceptProfileHttpError(400);
  const body =
    event === "concept_detail_opened"
      ? { event, playId, conceptId }
      : { event, playId };
  const response = await fetch("/api/me/profile/events", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
  requirePrivateNoStore(response);
  if (response.status !== 204) {
    throw new ConceptProfileHttpError(response.status);
  }
}

export function recordConceptProfileViewed(playId: string): Promise<void> {
  return recordConceptProfileEvent(playId, "concept_profile_viewed");
}

export function recordConceptDetailOpened(
  playId: string,
  conceptId: string,
): Promise<void> {
  if (!conceptId) throw new ConceptProfileHttpError(400);
  return recordConceptProfileEvent(playId, "concept_detail_opened", conceptId);
}
