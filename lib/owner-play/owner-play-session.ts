export type OwnerAnswer = Readonly<{
  cardId: string;
  choice: "a" | "b";
}>;

export type OwnerPlayState = Readonly<{
  id: string;
  packSlug: string;
  packVersion: string;
  status: "draft" | "completed";
  currentPosition: number;
  answers: readonly OwnerAnswer[];
  managementExpiresAt: string;
  managementTtlSeconds: number;
}>;

export type OwnerCredential = Readonly<{
  playId: string;
  value: string;
  managementSecretHash: Uint8Array;
}>;

export type ParsedOwnerCookie =
  | Readonly<{ outcome: "absent" | "malformed" }>
  | Readonly<{
      outcome: "valid";
      playId: string;
      value: string;
      managementSecretHash: Uint8Array;
    }>;
