export type OwnerProfileCounts = Readonly<{ a: number; b: number }>;

export type OwnerProfileRelationshipCard =
  | Readonly<{
      cardId: string;
      sampleCount: number;
      status: "collecting";
    }>
  | Readonly<{
      cardId: string;
      sampleCount: number;
      status: "available";
      counts: OwnerProfileCounts;
    }>;

export type OwnerProfileRelationshipLayer =
  | Readonly<{
      relationshipCode: string;
      sightCount: 1 | 2;
      status: "collecting";
      cards: readonly [];
    }>
  | Readonly<{
      relationshipCode: string;
      sightCount: number;
      status: "available";
      cards: readonly OwnerProfileRelationshipCard[];
    }>;

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
  packSlug: string;
  packVersion: string;
  packTitle: string;
  sightCount: number;
  sightStatus: "empty" | "has_sight";
  cards: readonly OwnerProfileCard[];
  relationshipLayers: readonly OwnerProfileRelationshipLayer[];
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
