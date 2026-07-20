import { z } from "zod";

import { strictJsonObject } from "./strict-json-schema.ts";

const canonicalUuidV4 = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );

export const magicLinkSchema = strictJsonObject({
  email: z.string().trim().email().max(254),
  playId: canonicalUuidV4.nullable(),
  returnTo: z.string().min(3).max(80),
});
