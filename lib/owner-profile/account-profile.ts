export type AccountOwnerPlay = Readonly<{
  id: string;
  packTitle: string;
  status: "draft" | "completed";
  answeredCount: number;
}>;

export type AccountOwnerSelfLayer = Readonly<{
  kind: "self";
  playId: string;
  packTitle: string;
  cardId: string;
  position: number;
  prompt: string;
  optionA: string;
  optionB: string;
  selfChoice: "a" | "b";
}>;

export type AccountOwnerAvailableLayer = Readonly<{
  kind: "available";
  playId: string;
  packTitle: string;
  cardId: string;
  position: number;
  prompt: string;
  optionA: string;
  optionB: string;
  selfChoice: "a" | "b";
  relationshipCode: string;
  sampleCount: number;
  counts: Readonly<{ a: number; b: number }>;
}>;

export type AccountOwnerCollectingLayer = Readonly<{
  kind: "collecting";
  playId: string;
  packTitle: string;
  relationshipCode: string;
  sightCount: 1 | 2;
  status: "collecting";
}>;

export type AccountOwnerProfile = Readonly<{
  nickname: string;
  plays: readonly AccountOwnerPlay[];
  completedPlayCount: number;
  sightCount: number;
  relationshipCount: number;
  selfLayers: readonly AccountOwnerSelfLayer[];
  availableLayers: readonly AccountOwnerAvailableLayer[];
  collectingLayers: readonly AccountOwnerCollectingLayer[];
  ctaPlayId: string | null;
}>;
