import {
  decodePrivateOneToOneComparison,
  decodePrivateOneToOneList,
} from "./private-one-to-one-core.mjs";
import { isOwnerPlayId } from "../owner-play/owner-play-state-core.mjs";
import { isVisitorResponseId } from "../visitor-response/visitor-context-core.mjs";
import type {
  PrivateOneToOneComparison,
  PrivateOneToOneResponseRow,
} from "./private-one-to-one.ts";

export class PrivateOneToOneHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Private one-to-one request failed (${status})`);
    this.name = "PrivateOneToOneHttpError";
    this.status = status;
  }
}

const pendingLists = new Map<
  string,
  Promise<readonly PrivateOneToOneResponseRow[]>
>();
const pendingComparisons = new Map<
  string,
  Promise<PrivateOneToOneComparison>
>();

async function readJson(response: Response) {
  if (response.headers.get("cache-control") !== "private, no-store") {
    throw new PrivateOneToOneHttpError(response.status);
  }
  if (!response.ok) throw new PrivateOneToOneHttpError(response.status);
  try {
    return await response.json();
  } catch {
    throw new PrivateOneToOneHttpError(500);
  }
}

export function listPrivateOneToOneResponses(
  playId: string,
): Promise<readonly PrivateOneToOneResponseRow[]> {
  if (!isOwnerPlayId(playId)) {
    return Promise.reject(new PrivateOneToOneHttpError(400));
  }
  const existing = pendingLists.get(playId);
  if (existing) return existing;
  const request = fetch(
    `/api/me/plays/${encodeURIComponent(playId)}/responses?kind=one_to_one`,
    { method: "GET", cache: "no-store", credentials: "same-origin" },
  )
    .then(readJson)
    .then((value) => decodePrivateOneToOneList(value).responses)
    .finally(() => pendingLists.delete(playId));
  pendingLists.set(playId, request);
  return request;
}

export function getPrivateOneToOneComparison(
  playId: string,
  responseId: string,
): Promise<PrivateOneToOneComparison> {
  if (!isOwnerPlayId(playId) || !isVisitorResponseId(responseId)) {
    return Promise.reject(new PrivateOneToOneHttpError(400));
  }
  const key = `${playId}:${responseId}`;
  const existing = pendingComparisons.get(key);
  if (existing) return existing;
  const request = fetch(
    `/api/me/responses/${encodeURIComponent(responseId)}?playId=${encodeURIComponent(playId)}`,
    {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    },
  )
    .then(readJson)
    .then((value) => decodePrivateOneToOneComparison(value))
    .finally(() => pendingComparisons.delete(key));
  pendingComparisons.set(key, request);
  return request;
}
