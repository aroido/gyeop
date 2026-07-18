import { z } from "zod";

import { strictJsonObject } from "./strict-json-schema.ts";

const lowerKebab = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const createOwnerPlaySchema = strictJsonObject({
  packSlug: lowerKebab,
});

export const saveOwnerAnswerSchema = strictJsonObject({
  choice: z.enum(["a", "b"]),
  currentPosition: z.number().int().min(1).max(10),
});

export const emptyOwnerMutationSchema = strictJsonObject({});
