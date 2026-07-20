const RESPONSE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SECRET = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const PREFIX = "gyeop:visitor-management:v1:";

export type ManagementRecord = Readonly<{
  version: 1;
  responseId: string;
  status: "pending" | "completed";
  secret: string;
}>;

function invalid(): never {
  throw new Error("Visitor management secret is unavailable");
}

function key(responseId: string) {
  if (!RESPONSE_ID.test(responseId)) invalid();
  return `${PREFIX}${responseId}`;
}

function exactRecord(value: unknown, responseId: string): ManagementRecord {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    Object.keys(value).sort().join("\0") !==
      "responseId\0secret\0status\0version"
  ) {
    invalid();
  }
  const record = value as Partial<ManagementRecord>;
  if (
    record.version !== 1 ||
    record.responseId !== responseId ||
    (record.status !== "pending" && record.status !== "completed") ||
    typeof record.secret !== "string" ||
    !SECRET.test(record.secret)
  ) {
    invalid();
  }
  return Object.freeze({
    version: 1,
    responseId,
    status: record.status,
    secret: record.secret,
  });
}

function encode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function createManagementSecret(
  source: Pick<Crypto, "getRandomValues"> = globalThis.crypto,
) {
  const bytes = new Uint8Array(32);
  source.getRandomValues(bytes);
  const secret = encode(bytes);
  if (!SECRET.test(secret)) invalid();
  return secret;
}

export function readManagementRecord(
  responseId: string,
  storage: Pick<Storage, "getItem"> = globalThis.localStorage,
): ManagementRecord | null {
  const raw = storage.getItem(key(responseId));
  if (raw === null) return null;
  try {
    return exactRecord(JSON.parse(raw), responseId);
  } catch {
    invalid();
  }
}

function writeRecord(
  record: ManagementRecord,
  storage: Pick<Storage, "getItem" | "setItem">,
) {
  storage.setItem(key(record.responseId), JSON.stringify(record));
  const restored = readManagementRecord(record.responseId, storage);
  if (
    !restored ||
    restored.status !== record.status ||
    restored.secret !== record.secret
  ) {
    invalid();
  }
  return restored;
}

export function ensurePendingManagementRecord(
  responseId: string,
  storage: Pick<
    Storage,
    "getItem" | "setItem" | "removeItem"
  > = globalThis.localStorage,
  source: Pick<Crypto, "getRandomValues"> = globalThis.crypto,
) {
  let existing: ManagementRecord | null;
  try {
    existing = readManagementRecord(responseId, storage);
  } catch {
    storage.removeItem(key(responseId));
    existing = null;
  }
  if (existing) return existing;
  return writeRecord(
    Object.freeze({
      version: 1,
      responseId,
      status: "pending",
      secret: createManagementSecret(source),
    }),
    storage,
  );
}

export function removeManagementRecord(
  responseId: string,
  storage: Pick<Storage, "removeItem"> = globalThis.localStorage,
) {
  storage.removeItem(key(responseId));
}

export function completeManagementRecord(
  responseId: string,
  storage: Pick<Storage, "getItem" | "setItem"> = globalThis.localStorage,
) {
  const existing = readManagementRecord(responseId, storage);
  if (!existing) invalid();
  if (existing.status === "completed") return existing;
  return writeRecord(
    Object.freeze({ ...existing, status: "completed" }),
    storage,
  );
}

export function buildManagementUrl(origin: string, secret: string) {
  if (
    typeof origin !== "string" ||
    !/^https?:\/\/[^/?#]+$/.test(origin) ||
    !SECRET.test(secret)
  ) {
    invalid();
  }
  return `${origin}/responses/manage#token=${secret}`;
}

export function parseManagementFragment(fragment: string) {
  if (typeof fragment !== "string") invalid();
  const match = fragment.match(
    /^#token=([A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])$/,
  );
  if (!match) invalid();
  return match[1];
}

export function removeManagementRecordMatchingSecret(
  secret: string,
  storage: Pick<
    Storage,
    "length" | "key" | "getItem" | "removeItem"
  > = globalThis.localStorage,
) {
  if (!SECRET.test(secret)) invalid();
  const candidates: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const storageKey = storage.key(index);
    if (storageKey?.startsWith(PREFIX)) candidates.push(storageKey);
  }
  let removed = false;
  for (const storageKey of candidates) {
    const responseId = storageKey.slice(PREFIX.length);
    if (!RESPONSE_ID.test(responseId)) continue;
    const raw = storage.getItem(storageKey);
    if (raw === null) continue;
    try {
      const record = exactRecord(JSON.parse(raw), responseId);
      if (record.secret === secret) {
        storage.removeItem(storageKey);
        removed = true;
      }
    } catch {
      // Malformed records are not proof of ownership and are left untouched.
    }
  }
  return removed;
}
