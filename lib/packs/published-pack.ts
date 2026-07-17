export type PublishedPackCard = Readonly<{
  id: string;
  position: number;
  ownerPrompt: string;
  visitorPrompt: string;
  optionA: string;
  optionB: string;
  isSignature: boolean;
}>;

export type PublishedPack = Readonly<{
  slug: string;
  title: string;
  version: string;
  targetRelationship: string;
  sensitivity: string;
  cards: readonly PublishedPackCard[];
}>;
