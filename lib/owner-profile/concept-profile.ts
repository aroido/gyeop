export type ConceptStage = "trace" | "outline" | "clear";
export type ConceptHookKind =
  "difference" | "contextual" | "repeated" | "emerging";
export type ConceptHookBasis = "self" | "others" | "both";
export type ConceptDirection = "a" | "b" | "contextual" | "unsettled";

export type ConceptEvidenceSummary = Readonly<{
  cardCount: number;
  packCount: number;
  contextCount: number;
  packs: readonly Readonly<{
    packSlug: string;
    packTitle: string;
    contexts: readonly string[];
  }>[];
}>;

export type ConceptSourceSummary =
  | Readonly<{ status: "locked"; sightCount: 0 | 1 | 2 }>
  | Readonly<{
      status: "available";
      stage: ConceptStage;
      direction: ConceptDirection;
      directionText: string;
      position: number;
      evidence: ConceptEvidenceSummary;
    }>;

export type ConceptShareEvidence =
  | Readonly<{ status: "unavailable" }>
  | Readonly<{
      status: "available";
      source: "shareSafeOthers";
      stage: "outline" | "clear";
      direction: "a" | "b" | "contextual";
      directionText: string;
      observation: string;
      question: string;
      evidence: ConceptEvidenceSummary;
    }>;

export type ConceptHook = Readonly<{
  conceptId: string;
  conceptLabel: string;
  areaId: string;
  areaLabel: string;
  directionA: string;
  directionB: string;
  kind: ConceptHookKind;
  basis: ConceptHookBasis;
  stage: ConceptStage;
  observation: string;
  question: string;
  self: Exclude<ConceptSourceSummary, { status: "locked" }>;
  privateOthers: ConceptSourceSummary;
  shareSafeOthers: ConceptSourceSummary;
  profileEvidence: readonly Readonly<{
    source: "self" | "privateOthers";
    evidence: ConceptEvidenceSummary;
  }>[];
  shareEvidence: ConceptShareEvidence;
  shareEligible: boolean;
  profileSourcePlayId: string;
  profileSourcePackSlug: string;
  profileSourcePackTitle: string;
  shareSourcePlayId: string | null;
  shareSourcePackSlug: string | null;
  shareSourcePackTitle: string | null;
}>;

export type ConceptShareOption = Readonly<{
  conceptId: string;
  sourcePlayId: string;
  bundle: readonly ConceptProfileShareAxis[];
}>;

export type ConceptProfileShareAxis = Readonly<{
  areaLabel: string;
  conceptLabel: string;
  directionA: string;
  directionB: string;
  selfPosition: number;
  others:
    | Readonly<{
        status: "locked";
        sightCount: 0 | 1 | 2;
      }>
    | Readonly<{
        status: "available";
        source: "shareSafeOthers";
        direction: "a" | "b";
        stage: ConceptStage;
        position: number;
        range: "wide" | "medium" | "narrow";
      }>
    | Readonly<{
        status: "available";
        source: "shareSafeOthers";
        direction: "contextual";
        stage: "outline" | "clear";
        range: "split";
      }>
    | Readonly<{
        status: "available";
        source: "shareSafeOthers";
        direction: "unsettled";
        stage: ConceptStage;
        range: "neutral";
      }>;
  cardCount: number;
}>;

export type ConceptAreaSummary = Readonly<{
  areaId: string;
  areaLabel: string;
  cardCount: number;
  packCount: number;
  contextCount: number;
  stage: ConceptStage;
}>;

export type ConceptProfile = Readonly<{
  modelVersion: 1;
  hooks: readonly ConceptHook[];
  shareOptions: readonly ConceptShareOption[];
  areaSummaries: readonly ConceptAreaSummary[];
}>;
