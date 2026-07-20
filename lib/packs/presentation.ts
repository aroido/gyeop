export type ShareKind = "public" | "one_to_one";
export function defaultShareKind(sensitivity: string): ShareKind {
  return sensitivity === "low" ? "public" : "one_to_one";
}
