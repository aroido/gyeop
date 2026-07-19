export type PrivateOneToOneResponseRow = Readonly<{
  id: string;
  shareLinkId: string;
  status: "submitted" | "withdrawn";
  relationshipCode: string | null;
  knownSinceCode: string | null;
  submittedAt: string;
  withdrawnAt: string | null;
}>;

export type PrivateOneToOneAssignment = Readonly<{
  cardId: string;
  stage: "required" | "optional";
  position: number;
  packPosition: number;
  visitorPrompt: string;
  optionA: string;
  optionB: string;
  isSignature: boolean;
  visitorChoice: "a" | "b";
  ownerChoice: "a" | "b";
  matches: boolean;
  isHighlight: boolean;
}>;

export type PrivateOneToOneComparison = Readonly<{
  id: string;
  packTitle: string;
  relationshipCode: string;
  knownSinceCode: string;
  submittedAt: string;
  allMatched: boolean;
  assignments: readonly PrivateOneToOneAssignment[];
}>;
