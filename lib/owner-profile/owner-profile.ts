export type OwnerProfileCounts = Readonly<{ a: number; b: number }>;

export type OwnerProfileCard = Readonly<{
  cardId: string;
  position: number;
  ownerPrompt: string;
  optionA: string;
  optionB: string;
  selfChoice: "a" | "b";
  sampleCount: number;
  counts: OwnerProfileCounts | null;
}>;

export type OwnerProfile = Readonly<{
  playId: string;
  packSlug: "old-friend";
  packVersion: string;
  packTitle: string;
  sightCount: number;
  sightStatus: "empty" | "has_sight";
  cards: readonly OwnerProfileCard[];
}>;

export type OwnerProfileResult =
  | Readonly<{
      outcome: "authorized";
      managementExpiresAt: string;
      managementTtlSeconds: 604800;
      profile: OwnerProfile;
    }>
  | Readonly<{
      outcome: "not_completed";
      managementExpiresAt: string;
      managementTtlSeconds: 604800;
    }>
  | Readonly<{ outcome: "expired" | "not_found" }>;

export type OwnerProfileEventResult = Readonly<{
  outcome:
    "recorded" | "expired" | "not_found" | "not_completed" | "not_eligible";
}>;
