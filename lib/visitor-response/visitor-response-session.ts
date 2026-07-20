export type ParsedVisitorResponseCookie =
  | Readonly<{ outcome: "absent" | "malformed" }>
  | Readonly<{
      outcome: "valid";
      responseId: string;
      sessionTokenHash: Buffer;
      value: string;
    }>;
