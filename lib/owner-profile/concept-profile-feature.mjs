export function parseConceptProfileEnabled(value) {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("GYEOP_CONCEPT_PROFILE_ENABLED must be true or false");
}

export function conceptProfileEnabled(env = process.env) {
  return parseConceptProfileEnabled(env.GYEOP_CONCEPT_PROFILE_ENABLED);
}
