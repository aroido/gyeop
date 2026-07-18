const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PUBLIC_ID = /^[A-Za-z0-9_-]{21}[AQgw]$/;
const LOWER_KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const LINK_KEYS = [
  "consumedAt",
  "expiresAt",
  "id",
  "kind",
  "publicId",
  "status",
];

function invalid() {
  throw new Error("Invalid share link response");
}

function hasExactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.keys(value).sort().join("\0") === [...keys].sort().join("\0")
  );
}

function isTimestamp(value) {
  if (typeof value !== "string") return false;
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, fraction = "", zone] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const [yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue] =
    parts;
  const localEpoch = Date.UTC(
    yearValue,
    monthValue - 1,
    dayValue,
    hourValue,
    minuteValue,
    secondValue,
    Number(fraction.padEnd(3, "0").slice(0, 3)),
  );
  const local = new Date(localEpoch);
  if (
    yearValue < 1000 ||
    local.getUTCFullYear() !== yearValue ||
    local.getUTCMonth() !== monthValue - 1 ||
    local.getUTCDate() !== dayValue ||
    local.getUTCHours() !== hourValue ||
    local.getUTCMinutes() !== minuteValue ||
    local.getUTCSeconds() !== secondValue
  )
    return false;
  let offset = 0;
  if (zone !== "Z") {
    const sign = zone[0] === "+" ? 1 : -1;
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return false;
    offset = sign * (offsetHour * 60 + offsetMinute) * 60_000;
  }
  return new Date(value).valueOf() === localEpoch - offset;
}

export function isShareLinkId(value) {
  return typeof value === "string" && UUID_V4.test(value);
}

export function isSharePublicId(value) {
  return typeof value === "string" && PUBLIC_ID.test(value);
}

export function decodeShareLink(value) {
  if (!hasExactKeys(value, LINK_KEYS)) invalid();
  if (!isShareLinkId(value.id) || !isSharePublicId(value.publicId)) invalid();
  if (value.kind !== "public" && value.kind !== "one_to_one") invalid();
  if (!["active", "disabled", "expired"].includes(value.status)) {
    invalid();
  }
  if (value.expiresAt !== null && !isTimestamp(value.expiresAt)) invalid();
  if (value.consumedAt !== null) invalid();
  return Object.freeze({
    id: value.id,
    publicId: value.publicId,
    kind: value.kind,
    status: value.status,
    expiresAt: value.expiresAt,
    consumedAt: null,
  });
}

export function decodeShareLinkList(value) {
  if (!Array.isArray(value)) invalid();
  const ids = new Set();
  const publicIds = new Set();
  const links = value.map((item) => {
    const link = decodeShareLink(item);
    if (ids.has(link.id) || publicIds.has(link.publicId)) invalid();
    ids.add(link.id);
    publicIds.add(link.publicId);
    return link;
  });
  return Object.freeze(links);
}

function managementEnvelope(value, outcome, field) {
  if (
    !hasExactKeys(value, [
      field,
      "managementExpiresAt",
      "managementTtlSeconds",
      "outcome",
    ]) ||
    value.outcome !== outcome ||
    value.managementTtlSeconds !== 604800 ||
    !isTimestamp(value.managementExpiresAt)
  ) {
    invalid();
  }
  return Object.freeze({
    outcome,
    [field]:
      field === "links"
        ? decodeShareLinkList(value[field])
        : decodeShareLink(value[field]),
    managementExpiresAt: value.managementExpiresAt,
    managementTtlSeconds: value.managementTtlSeconds,
  });
}

export function decodeCreateShareLinkOutcome(value) {
  if (value?.outcome === "created")
    return managementEnvelope(value, "created", "link");
  if (
    hasExactKeys(value, ["outcome"]) &&
    ["collision", "expired", "not_found", "not_completed"].includes(
      value.outcome,
    )
  ) {
    return Object.freeze({ outcome: value.outcome });
  }
  invalid();
}

export function decodeDisableShareLinkOutcome(value) {
  if (value?.outcome === "disabled")
    return managementEnvelope(value, "disabled", "link");
  if (
    hasExactKeys(value, ["outcome"]) &&
    ["expired", "not_found", "not_completed", "link_not_found"].includes(
      value.outcome,
    )
  ) {
    return Object.freeze({ outcome: value.outcome });
  }
  invalid();
}

export function decodeRotateShareLinkOutcome(value) {
  if (value?.outcome === "rotated")
    return managementEnvelope(value, "rotated", "link");
  if (
    hasExactKeys(value, ["outcome"]) &&
    [
      "collision",
      "expired",
      "not_found",
      "not_completed",
      "link_not_found",
      "link_not_active",
    ].includes(value.outcome)
  ) {
    return Object.freeze({ outcome: value.outcome });
  }
  invalid();
}

export function decodeListShareLinksOutcome(value) {
  if (value?.outcome === "listed")
    return managementEnvelope(value, "listed", "links");
  if (
    hasExactKeys(value, ["outcome"]) &&
    ["expired", "not_found", "not_completed"].includes(value.outcome)
  ) {
    return Object.freeze({ outcome: value.outcome });
  }
  invalid();
}

export function decodeRecordShareActionOutcome(value) {
  if (
    hasExactKeys(value, [
      "managementExpiresAt",
      "managementTtlSeconds",
      "outcome",
    ]) &&
    value.outcome === "recorded" &&
    value.managementTtlSeconds === 604800 &&
    isTimestamp(value.managementExpiresAt)
  ) {
    return Object.freeze({
      outcome: "recorded",
      managementExpiresAt: value.managementExpiresAt,
      managementTtlSeconds: value.managementTtlSeconds,
    });
  }
  if (
    hasExactKeys(value, ["outcome"]) &&
    [
      "expired",
      "not_found",
      "not_completed",
      "link_not_found",
      "link_not_active",
    ].includes(value.outcome)
  ) {
    return Object.freeze({ outcome: value.outcome });
  }
  invalid();
}

export function decodeInviteMetadataOutcome(value) {
  if (
    hasExactKeys(value, ["outcome"]) &&
    ["invalid", "unavailable"].includes(value.outcome)
  ) {
    return Object.freeze({ outcome: value.outcome });
  }
  if (
    !hasExactKeys(value, ["metadata", "outcome"]) ||
    value.outcome !== "active"
  )
    invalid();
  const metadata = value.metadata;
  if (!hasExactKeys(metadata, ["kind", "packSlug", "packTitle", "packVersion"]))
    invalid();
  if (
    typeof metadata.packSlug !== "string" ||
    metadata.packSlug.length > 64 ||
    !LOWER_KEBAB.test(metadata.packSlug) ||
    typeof metadata.packVersion !== "string" ||
    metadata.packVersion.length > 80 ||
    !LOWER_KEBAB.test(metadata.packVersion) ||
    typeof metadata.packTitle !== "string" ||
    metadata.packTitle.length < 1 ||
    metadata.packTitle.length > 120 ||
    (metadata.kind !== "public" && metadata.kind !== "one_to_one")
  )
    invalid();
  return Object.freeze({
    outcome: "active",
    metadata: Object.freeze({ ...metadata }),
  });
}

export function decodeShareLinkHttpList(value) {
  if (!hasExactKeys(value, ["links"])) invalid();
  return Object.freeze({ links: decodeShareLinkList(value.links) });
}

export function decodeShareLinkHttpCreated(value) {
  if (
    !hasExactKeys(value, ["inviteUrl", "link"]) ||
    typeof value.inviteUrl !== "string"
  )
    invalid();
  return Object.freeze({
    link: decodeShareLink(value.link),
    inviteUrl: value.inviteUrl,
  });
}

export function decodeShareLinkHttpUpdated(value) {
  if (!hasExactKeys(value, ["link"])) invalid();
  return Object.freeze({ link: decodeShareLink(value.link) });
}

export function decodeInviteMetadataHttp(value) {
  const outcome = decodeInviteMetadataOutcome({
    outcome: "active",
    metadata: value,
  });
  return outcome.metadata;
}
export function parseShareEntrySource(value) {
  return value === "profile_reshare" ? "profile_reshare" : null;
}
