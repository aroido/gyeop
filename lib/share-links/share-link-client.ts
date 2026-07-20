import {
  decodeInviteMetadataHttp,
  decodeShareLinkHttpCreated,
  decodeShareLinkHttpList,
  decodeShareLinkHttpUpdated,
  isShareLinkId,
  isSharePublicId,
} from "./share-link-state-core.mjs";

export type ShareLink = Readonly<{
  id: string;
  publicId: string;
  kind: "public" | "one_to_one";
  status: "active" | "disabled" | "expired";
  expiresAt: string | null;
  consumedAt: null;
}>;

export type InviteMetadata = Readonly<{
  packSlug: string;
  packVersion: string;
  packTitle: string;
  kind: "public" | "one_to_one";
}>;

export class ShareLinkHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super("Share link request failed");
    this.name = "ShareLinkHttpError";
    this.status = status;
    this.code = code;
  }
}

function request(method: "POST" | "PATCH", body: unknown) {
  return {
    method,
    cache: "no-store" as const,
    credentials: "same-origin" as const,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function json(response: Response) {
  if (response.headers.get("cache-control") !== "private, no-store") {
    throw new ShareLinkHttpError(response.status, "INVALID_RESPONSE");
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ShareLinkHttpError(response.status, "INVALID_RESPONSE");
  }
  if (!response.ok) {
    const record = value as { code?: unknown; message?: unknown };
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join("\0") === "code\0message" &&
      typeof record.code === "string" &&
      typeof record.message === "string"
    ) {
      throw new ShareLinkHttpError(response.status, record.code);
    }
    throw new ShareLinkHttpError(response.status, "INVALID_RESPONSE");
  }
  return value;
}

function playPath(playId: string) {
  if (!isShareLinkId(playId))
    throw new ShareLinkHttpError(400, "INVALID_INPUT");
  return encodeURIComponent(playId);
}

function linkPath(linkId: string) {
  if (!isShareLinkId(linkId))
    throw new ShareLinkHttpError(400, "INVALID_INPUT");
  return encodeURIComponent(linkId);
}

export async function listShareLinks(
  playId: string,
): Promise<readonly ShareLink[]> {
  const response = await fetch(`/api/me/plays/${playPath(playId)}/links`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });
  return decodeShareLinkHttpList(await json(response))
    .links as readonly ShareLink[];
}

const createFlights = new Map<
  string,
  Promise<{ link: ShareLink; inviteUrl: string }>
>();

export function createShareLink(playId: string, kind: "public" | "one_to_one") {
  const key = `${playId}\0${kind}`;
  const existing = createFlights.get(key);
  if (existing) return existing;
  const flight = fetch(
    `/api/plays/${playPath(playId)}/links`,
    request("POST", { kind }),
  ).then(
    async (response) =>
      decodeShareLinkHttpCreated(await json(response)) as {
        link: ShareLink;
        inviteUrl: string;
      },
  );
  createFlights.set(key, flight);
  const clear = () => {
    if (createFlights.get(key) === flight) createFlights.delete(key);
  };
  void flight.then(clear, clear);
  return flight;
}

export async function disableShareLink(
  playId: string,
  linkId: string,
): Promise<ShareLink> {
  const response = await fetch(
    `/api/links/${linkPath(linkId)}`,
    request("PATCH", { playId }),
  );
  return decodeShareLinkHttpUpdated(await json(response)).link as ShareLink;
}

const rotateFlights = new Map<
  string,
  Promise<{ link: ShareLink; inviteUrl: string }>
>();

export function rotateShareLink(playId: string, linkId: string) {
  const existing = rotateFlights.get(linkId);
  if (existing) return existing;
  const flight = fetch(
    `/api/links/${linkPath(linkId)}/rotate`,
    request("POST", { playId }),
  ).then(
    async (response) =>
      decodeShareLinkHttpCreated(await json(response)) as {
        link: ShareLink;
        inviteUrl: string;
      },
  );
  rotateFlights.set(linkId, flight);
  const clear = () => {
    if (rotateFlights.get(linkId) === flight) rotateFlights.delete(linkId);
  };
  void flight.then(clear, clear);
  return flight;
}

export async function readInviteMetadata(
  publicId: string,
  secret: string,
): Promise<InviteMetadata> {
  if (!isSharePublicId(publicId))
    throw new ShareLinkHttpError(404, "INVITE_UNAVAILABLE");
  const response = await fetch(
    `/api/invites/${encodeURIComponent(publicId)}/metadata`,
    request("POST", { secret }),
  );
  return decodeInviteMetadataHttp(await json(response)) as InviteMetadata;
}

export type ShareActionEvent = "share_handoff_succeeded" | "share_link_copied";
export type ShareEntrySource = "profile_reshare" | null;

export async function recordShareAction(
  playId: string,
  linkId: string,
  event: ShareActionEvent,
  entrySource: ShareEntrySource,
): Promise<void> {
  if (
    !isShareLinkId(linkId) ||
    (event !== "share_handoff_succeeded" && event !== "share_link_copied") ||
    (entrySource !== null && entrySource !== "profile_reshare")
  ) {
    throw new ShareLinkHttpError(400, "INVALID_INPUT");
  }
  const response = await fetch(
    `/api/me/plays/${playPath(playId)}/share-events`,
    request("POST", { event, linkId, entrySource }),
  );
  if (
    response.status !== 204 ||
    response.headers.get("cache-control") !== "private, no-store"
  ) {
    throw new ShareLinkHttpError(response.status, "INVALID_RESPONSE");
  }
}
