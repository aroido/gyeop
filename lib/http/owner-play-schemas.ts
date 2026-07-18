import { z } from "zod";

import { strictJsonObject } from "./strict-json-schema.ts";

const lowerKebab = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const canonicalUuidV4 = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );

export const createOwnerPlaySchema = strictJsonObject({
  packSlug: lowerKebab,
});

export const saveOwnerAnswerSchema = strictJsonObject({
  choice: z.enum(["a", "b"]),
  currentPosition: z.number().int().min(1).max(10),
});

export const emptyOwnerMutationSchema = strictJsonObject({});

export const createShareLinkSchema = strictJsonObject({
  kind: z.enum(["public", "one_to_one"]),
});

export const recordShareActionSchema = strictJsonObject({
  event: z.enum(["share_handoff_succeeded", "share_link_copied"]),
  linkId: canonicalUuidV4,
});

export const inviteMetadataSchema = strictJsonObject({
  secret: z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/),
});
