import {
  CONCEPT_CATALOG_V1,
  CONCEPT_COPY_LIMITS,
  conceptById,
  isConceptContextV1,
  isConceptId,
} from "../concepts/catalog-core.mjs";
import { isOwnerPlayId } from "../owner-play/owner-play-state-core.mjs";
import {
  decodeConceptProfileShareAxis,
  isProfileShareRelationship,
} from "./profile-share-card-core.mjs";

export const CONCEPT_DIRECTION_THRESHOLD = 0.25;
export const CONCEPT_REPEATED_THRESHOLD = 0.5;

const STAGE_RANK = Object.freeze({ trace: 0, outline: 1, clear: 2 });
const KIND_RANK = Object.freeze({
  difference: 0,
  contextual: 1,
  repeated: 2,
  emerging: 3,
});

function invalid() {
  throw new Error("Invalid concept profile");
}

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, freeze(item)]),
      ),
    );
  }
  return value;
}

export function conceptCardKey(packSlug, packVersion, cardId) {
  if (
    ![packSlug, packVersion, cardId].every(
      (value) => typeof value === "string" && value,
    )
  ) {
    invalid();
  }
  return `${packSlug}\0${packVersion}\0${cardId}`;
}

function compareSourcePair(left, right) {
  return (
    right.summary.completedAt.localeCompare(left.summary.completedAt) ||
    left.summary.id.localeCompare(right.summary.id)
  );
}

export function selectConceptProfileSourcePairs({
  plays,
  profiles,
  manifests,
}) {
  if (
    !Array.isArray(plays) ||
    !Array.isArray(profiles) ||
    !Array.isArray(manifests)
  ) {
    invalid();
  }
  const profileByPlay = new Map(
    profiles.map((profile) => [profile.playId, profile]),
  );
  const manifestByVersion = new Map(
    manifests
      .filter((manifest) => manifest.conceptVersion === 1)
      .map((manifest) => [`${manifest.slug}\0${manifest.version}`, manifest]),
  );
  const candidates = [];
  for (const summary of plays) {
    if (
      summary.status !== "completed" ||
      typeof summary.completedAt !== "string" ||
      !summary.completedAt
    ) {
      continue;
    }
    const profile = profileByPlay.get(summary.id);
    const manifest = manifestByVersion.get(
      `${summary.packSlug}\0${summary.packVersion}`,
    );
    if (!profile || !manifest) continue;
    if (
      profile.playId !== summary.id ||
      profile.packSlug !== summary.packSlug ||
      profile.packVersion !== summary.packVersion ||
      profile.packTitle !== summary.packTitle ||
      manifest.title !== summary.packTitle
    ) {
      invalid();
    }
    candidates.push({ summary, profile, manifest });
  }
  candidates.sort(compareSourcePair);
  const seen = new Set();
  return freeze(
    candidates.filter(({ summary }) => {
      if (seen.has(summary.packSlug)) return false;
      seen.add(summary.packSlug);
      return true;
    }),
  );
}

function directionScoreForChoice(choice, directionForOptionA) {
  return choice === directionForOptionA ? 1 : -1;
}

function directionScoreForCounts(counts, directionForOptionA) {
  const a = directionForOptionA === "a" ? counts.a : counts.b;
  const b = directionForOptionA === "a" ? counts.b : counts.a;
  return (a - b) / (a + b);
}

function directionForScore(score) {
  if (score >= CONCEPT_DIRECTION_THRESHOLD) return "a";
  if (score <= -CONCEPT_DIRECTION_THRESHOLD) return "b";
  return "unsettled";
}

function stageForEvidence(cardCount, packCount, contextCount) {
  if (cardCount >= 6 && packCount >= 3 && contextCount >= 3) return "clear";
  if (cardCount >= 3 && packCount >= 2 && contextCount >= 2) return "outline";
  return "trace";
}

function positionForDirectionScore(score) {
  return Math.max(-1, Math.min(1, -score));
}

function evidenceSummary(records) {
  const cards = new Set();
  const contexts = new Set();
  const packs = new Map();
  for (const record of records) {
    cards.add(record.cardKey);
    contexts.add(record.context);
    const existing = packs.get(record.packSlug) ?? {
      packSlug: record.packSlug,
      packTitle: record.packTitle,
      contexts: new Set(),
    };
    existing.contexts.add(record.context);
    packs.set(record.packSlug, existing);
  }
  const packItems = [...packs.values()]
    .sort((left, right) => left.packSlug.localeCompare(right.packSlug))
    .map((pack) => ({
      packSlug: pack.packSlug,
      packTitle: pack.packTitle,
      contexts: [...pack.contexts].sort((left, right) =>
        left.localeCompare(right),
      ),
    }));
  return freeze({
    cardCount: cards.size,
    packCount: packs.size,
    contextCount: contexts.size,
    packs: packItems,
  });
}

function repeatedAcrossContexts(records, predicate) {
  const matching = records.filter(predicate);
  return (
    new Set(matching.map(({ cardKey }) => cardKey)).size >= 2 &&
    new Set(matching.map(({ packSlug }) => packSlug)).size >= 2 &&
    new Set(matching.map(({ context }) => context)).size >= 2
  );
}

function summarizeSource(records, concept, sightCount = 0) {
  if (records.length === 0) {
    return freeze({
      status: "locked",
      sightCount: Math.max(0, Math.min(2, sightCount)),
    });
  }
  const evidence = evidenceSummary(records);
  const packScores = new Map();
  for (const record of records) {
    const scores = packScores.get(record.packSlug) ?? [];
    scores.push(record.score);
    packScores.set(record.packSlug, scores);
  }
  const means = [...packScores.values()].map(
    (scores) => scores.reduce((sum, score) => sum + score, 0) / scores.length,
  );
  const directionScore =
    means.reduce((sum, score) => sum + score, 0) / means.length;
  const stage = stageForEvidence(
    evidence.cardCount,
    evidence.packCount,
    evidence.contextCount,
  );
  const contextual =
    STAGE_RANK[stage] >= STAGE_RANK.outline &&
    repeatedAcrossContexts(
      records,
      ({ score }) => score >= CONCEPT_DIRECTION_THRESHOLD,
    ) &&
    repeatedAcrossContexts(
      records,
      ({ score }) => score <= -CONCEPT_DIRECTION_THRESHOLD,
    );
  const direction = contextual
    ? "contextual"
    : directionForScore(directionScore);
  const directionText =
    direction === "a"
      ? concept.directionA
      : direction === "b"
        ? concept.directionB
        : direction === "contextual"
          ? "상황에 따라 양쪽 모습"
          : "아직 한쪽으로 모이지 않음";
  return freeze({
    status: "available",
    stage,
    direction,
    directionText,
    evidence,
    directionScore,
  });
}

function sourcePlay(records) {
  return records
    .map(({ pair }) => pair)
    .filter(
      (pair, index, pairs) =>
        pairs.findIndex(({ summary }) => summary.id === pair.summary.id) ===
        index,
    )
    .sort(compareSourcePair)[0];
}

function addRecord(target, conceptId, record) {
  const records = target.get(conceptId) ?? [];
  records.push(record);
  target.set(conceptId, records);
}

function collectSources(pairs) {
  const self = new Map();
  const privateOthers = new Map();
  const shareSafeOthers = new Map();
  const privateSight = new Map();
  const safeSight = new Map();

  for (const pair of pairs) {
    const ownerCards = new Map(
      pair.profile.cards.map((card) => [card.cardId, card]),
    );
    const manifestCards = new Map(
      pair.manifest.cards.map((card) => [card.id, card]),
    );
    if (ownerCards.size !== 10 || manifestCards.size !== 10) invalid();

    for (const card of pair.manifest.cards) {
      if (!isConceptContextV1(card.conceptContext)) invalid();
      const ownerCard = ownerCards.get(card.id);
      if (!ownerCard || ownerCard.position !== card.position) invalid();
      for (const signal of card.conceptSignals) {
        if (!isConceptId(signal.conceptId)) invalid();
        const base = {
          pair,
          cardKey: conceptCardKey(
            pair.manifest.slug,
            pair.manifest.version,
            card.id,
          ),
          cardId: card.id,
          packSlug: pair.manifest.slug,
          packTitle: pair.manifest.title,
          context: card.conceptContext,
        };
        addRecord(self, signal.conceptId, {
          ...base,
          score: directionScoreForChoice(
            ownerCard.selfChoice,
            signal.directionForOptionA,
          ),
        });
      }
    }

    for (const relationship of pair.profile.relationshipLayers) {
      const isSafe = isProfileShareRelationship(relationship.relationshipCode);
      if (relationship.status === "collecting") {
        for (const card of pair.manifest.cards) {
          for (const signal of card.conceptSignals) {
            privateSight.set(
              signal.conceptId,
              Math.max(
                privateSight.get(signal.conceptId) ?? 0,
                relationship.sightCount,
              ),
            );
            if (isSafe) {
              safeSight.set(
                signal.conceptId,
                Math.max(
                  safeSight.get(signal.conceptId) ?? 0,
                  relationship.sightCount,
                ),
              );
            }
          }
        }
      }
    }

    for (const manifestCard of pair.manifest.cards) {
      const aggregate = { private: { a: 0, b: 0 }, safe: { a: 0, b: 0 } };
      for (const relationship of pair.profile.relationshipLayers) {
        if (relationship.status !== "available") continue;
        const relationshipCard = relationship.cards.find(
          ({ cardId }) => cardId === manifestCard.id,
        );
        if (!relationshipCard || relationshipCard.status !== "available")
          continue;
        aggregate.private.a += relationshipCard.counts.a;
        aggregate.private.b += relationshipCard.counts.b;
        if (isProfileShareRelationship(relationship.relationshipCode)) {
          aggregate.safe.a += relationshipCard.counts.a;
          aggregate.safe.b += relationshipCard.counts.b;
        }
      }
      for (const signal of manifestCard.conceptSignals) {
        const base = {
          pair,
          cardKey: conceptCardKey(
            pair.manifest.slug,
            pair.manifest.version,
            manifestCard.id,
          ),
          cardId: manifestCard.id,
          packSlug: pair.manifest.slug,
          packTitle: pair.manifest.title,
          context: manifestCard.conceptContext,
        };
        if (aggregate.private.a + aggregate.private.b > 0) {
          addRecord(privateOthers, signal.conceptId, {
            ...base,
            score: directionScoreForCounts(
              aggregate.private,
              signal.directionForOptionA,
            ),
          });
        }
        if (aggregate.safe.a + aggregate.safe.b > 0) {
          addRecord(shareSafeOthers, signal.conceptId, {
            ...base,
            score: directionScoreForCounts(
              aggregate.safe,
              signal.directionForOptionA,
            ),
          });
        }
      }
    }
  }
  return { self, privateOthers, shareSafeOthers, privateSight, safeSight };
}

function availableAtLeast(source, stage) {
  return (
    source.status === "available" &&
    STAGE_RANK[source.stage] >= STAGE_RANK[stage]
  );
}

function directionAB(source) {
  return source.direction === "a" || source.direction === "b";
}

function lowerStage(left, right) {
  return STAGE_RANK[left] <= STAGE_RANK[right] ? left : right;
}

function profileEvidence(basis, self, privateOthers) {
  const own = { source: "self", evidence: self.evidence };
  const other = {
    source: "privateOthers",
    evidence: privateOthers.evidence,
  };
  return basis === "self" ? [own] : basis === "others" ? [other] : [own, other];
}

function hookPresentation(concept, self, privateOthers) {
  if (
    availableAtLeast(self, "outline") &&
    availableAtLeast(privateOthers, "outline") &&
    directionAB(self) &&
    directionAB(privateOthers) &&
    self.direction !== privateOthers.direction
  ) {
    return {
      kind: "difference",
      basis: "both",
      stage: lowerStage(self.stage, privateOthers.stage),
      observation: `나는 “${self.directionText}” 쪽인데, 주변 시선은 “${privateOthers.directionText}” 쪽이에요.`,
      question: "너는 내가 어떤 장면에서 그렇게 보였어?",
    };
  }
  if (
    self.direction === "contextual" ||
    (privateOthers.status === "available" &&
      privateOthers.direction === "contextual")
  ) {
    const selfContextual = self.direction === "contextual";
    const othersContextual =
      privateOthers.status === "available" &&
      privateOthers.direction === "contextual";
    const basis =
      selfContextual && othersContextual
        ? "both"
        : selfContextual
          ? "self"
          : "others";
    return {
      kind: "contextual",
      basis,
      stage:
        basis === "self"
          ? self.stage
          : basis === "others"
            ? privateOthers.stage
            : lowerStage(self.stage, privateOthers.stage),
      observation:
        basis === "both"
          ? `나와 주변 모두 ${concept.label}이 상황에 따라 양쪽으로 또렷해요.`
          : basis === "self"
            ? `내 선택에서는 ${concept.label}이 상황에 따라 양쪽으로 또렷해요.`
            : `주변 시선에서는 ${concept.label}이 상황에 따라 양쪽으로 또렷해요.`,
      question: "너는 언제 반대쪽 모습이 나와?",
    };
  }
  if (
    availableAtLeast(self, "outline") &&
    directionAB(self) &&
    Math.abs(self.directionScore) >= CONCEPT_REPEATED_THRESHOLD &&
    self.evidence.packCount >= 2 &&
    self.evidence.contextCount >= 2
  ) {
    return {
      kind: "repeated",
      basis: "self",
      stage: self.stage,
      observation: `여러 장면에서 “${self.directionText}” 쪽이 반복됐어요.`,
      question: "너도 이런 장면에서는 같은 쪽이야?",
    };
  }
  return {
    kind: "emerging",
    basis: "self",
    stage: self.stage,
    observation: directionAB(self)
      ? `최근 장면에서 “${self.directionText}” 쪽의 흔적이 보이기 시작했어요.`
      : "최근 장면에서 서로 다른 모습이 함께 보이기 시작했어요.",
    question: "너는 이런 상황에서 어느 쪽을 고를 것 같아?",
  };
}

function shareProjection(source, concept) {
  if (
    !availableAtLeast(source, "outline") ||
    source.direction === "unsettled"
  ) {
    return { status: "unavailable" };
  }
  const contextual = source.direction === "contextual";
  return {
    status: "available",
    source: "shareSafeOthers",
    stage: source.stage,
    direction: source.direction,
    directionText: source.directionText,
    observation: contextual
      ? `주변 시선에서는 ${concept.label}이 상황에 따라 양쪽으로 또렷해요.`
      : `주변 시선에서는 여러 장면에서 “${source.directionText}” 쪽이 반복됐어요.`,
    question: contextual
      ? "너는 언제 반대쪽 모습이 나와?"
      : "너는 내가 어떤 장면에서 그렇게 보였어?",
    evidence: source.evidence,
  };
}

function candidateForConcept(concept, sources) {
  const selfRecords = sources.self.get(concept.id) ?? [];
  if (selfRecords.length === 0) return null;
  const privateRecords = sources.privateOthers.get(concept.id) ?? [];
  const safeRecords = sources.shareSafeOthers.get(concept.id) ?? [];
  const self = summarizeSource(selfRecords, concept);
  const privateOthers = summarizeSource(
    privateRecords,
    concept,
    sources.privateSight.get(concept.id) ?? 0,
  );
  const shareSafeOthers = summarizeSource(
    safeRecords,
    concept,
    sources.safeSight.get(concept.id) ?? 0,
  );

  const presentation = hookPresentation(concept, self, privateOthers);
  const shareEvidence = shareProjection(shareSafeOthers, concept);
  const profileSource = sourcePlay(
    presentation.basis === "others"
      ? privateRecords
      : presentation.basis === "both"
        ? [...selfRecords, ...privateRecords]
        : selfRecords,
  );
  const shareSource =
    shareEvidence.status === "available" ? sourcePlay(safeRecords) : null;
  if (!profileSource || (shareEvidence.status === "available" && !shareSource))
    invalid();
  const area = CONCEPT_CATALOG_V1.areas.find(({ id }) => id === concept.areaId);
  return {
    conceptId: concept.id,
    conceptLabel: concept.label,
    areaId: concept.areaId,
    areaLabel: area.label,
    directionA: concept.directionA,
    directionB: concept.directionB,
    ...presentation,
    self,
    privateOthers,
    shareSafeOthers,
    profileEvidence: profileEvidence(presentation.basis, self, privateOthers),
    shareEvidence,
    shareEligible: shareEvidence.status === "available" && directionAB(self),
    profileSourcePlayId: profileSource.summary.id,
    profileSourcePackSlug: profileSource.summary.packSlug,
    profileSourcePackTitle: profileSource.summary.packTitle,
    shareSourcePlayId: shareSource?.summary.id ?? null,
    shareSourcePackSlug: shareSource?.summary.packSlug ?? null,
    shareSourcePackTitle: shareSource?.summary.packTitle ?? null,
    catalogIndex: CONCEPT_CATALOG_V1.concepts.indexOf(concept),
  };
}

function rankCandidate(left, right) {
  const leftEvidence = left.profileEvidence.map(({ evidence }) => evidence);
  const rightEvidence = right.profileEvidence.map(({ evidence }) => evidence);
  return (
    KIND_RANK[left.kind] - KIND_RANK[right.kind] ||
    STAGE_RANK[right.stage] - STAGE_RANK[left.stage] ||
    Math.max(...rightEvidence.map(({ packCount }) => packCount)) -
      Math.max(...leftEvidence.map(({ packCount }) => packCount)) ||
    Math.max(...rightEvidence.map(({ contextCount }) => contextCount)) -
      Math.max(...leftEvidence.map(({ contextCount }) => contextCount)) ||
    left.catalogIndex - right.catalogIndex
  );
}

function publicCandidate(candidate) {
  const value = { ...candidate };
  delete value.catalogIndex;
  const cleanSource = (source) => {
    const clean = { ...source };
    delete clean.directionScore;
    if (source.status === "available") {
      clean.position = positionForDirectionScore(source.directionScore);
    }
    return clean;
  };
  return {
    ...value,
    self: cleanSource(value.self),
    privateOthers: cleanSource(value.privateOthers),
    shareSafeOthers: cleanSource(value.shareSafeOthers),
  };
}

function shareAxis(candidate) {
  const selfPosition =
    "position" in candidate.self
      ? candidate.self.position
      : positionForDirectionScore(candidate.self.directionScore);
  const othersPosition =
    "position" in candidate.shareSafeOthers
      ? candidate.shareSafeOthers.position
      : positionForDirectionScore(candidate.shareSafeOthers.directionScore);
  const others =
    candidate.shareSafeOthers.direction === "contextual"
      ? {
          source: "shareSafeOthers",
          direction: "contextual",
          stage: candidate.shareSafeOthers.stage,
          range: "split",
        }
      : {
          source: "shareSafeOthers",
          direction: candidate.shareSafeOthers.direction,
          stage: candidate.shareSafeOthers.stage,
          position: othersPosition,
          range:
            candidate.shareSafeOthers.stage === "outline" ? "medium" : "narrow",
        };
  return decodeConceptProfileShareAxis({
    areaLabel: candidate.areaLabel,
    conceptLabel: candidate.conceptLabel,
    directionA: candidate.directionA,
    directionB: candidate.directionB,
    selfPosition,
    others,
    cardCount: candidate.shareEvidence.evidence.cardCount,
  });
}

function areaSummaries(sources) {
  return CONCEPT_CATALOG_V1.areas.map((area) => {
    const records = CONCEPT_CATALOG_V1.concepts
      .filter(({ areaId }) => areaId === area.id)
      .flatMap(({ id }) => sources.self.get(id) ?? []);
    const evidence = evidenceSummary(records);
    return {
      areaId: area.id,
      areaLabel: area.label,
      cardCount: evidence.cardCount,
      packCount: evidence.packCount,
      contextCount: evidence.contextCount,
      stage: stageForEvidence(
        evidence.cardCount,
        evidence.packCount,
        evidence.contextCount,
      ),
    };
  });
}

function distinctAreaCount(candidates) {
  return new Set(candidates.map(({ areaId }) => areaId)).size;
}

export function buildConceptShareBundle(candidates, representativeConceptId) {
  if (!Array.isArray(candidates)) invalid();
  const ids = new Set();
  for (const candidate of candidates) {
    if (
      !candidate ||
      !isConceptId(candidate.conceptId) ||
      ids.has(candidate.conceptId) ||
      conceptById(candidate.conceptId).areaId !== candidate.areaId
    ) {
      invalid();
    }
    ids.add(candidate.conceptId);
  }
  const representative = candidates.find(
    ({ conceptId }) => conceptId === representativeConceptId,
  );
  if (!representative || candidates.length < 3) return null;

  const selected = [representative];
  const usedAreas = new Set([representative.areaId]);
  for (const candidate of candidates) {
    if (selected.length === 3) break;
    if (candidate !== representative && !usedAreas.has(candidate.areaId)) {
      selected.push(candidate);
      usedAreas.add(candidate.areaId);
    }
  }
  for (const candidate of candidates) {
    if (selected.length === 3) break;
    if (!selected.includes(candidate)) selected.push(candidate);
  }
  return freeze(selected);
}

function selectProfileCandidates(candidates) {
  const selected = [];
  const usedAreas = new Set();
  for (const kind of ["difference", "contextual", "repeated", "emerging"]) {
    if (selected.length === 3) break;
    const candidate = candidates.find(
      (item) => item.kind === kind && !usedAreas.has(item.areaId),
    );
    if (!candidate) continue;
    selected.push(candidate);
    usedAreas.add(candidate.areaId);
  }
  for (const candidate of candidates) {
    if (selected.length === 3) break;
    if (!selected.includes(candidate) && !usedAreas.has(candidate.areaId)) {
      selected.push(candidate);
      usedAreas.add(candidate.areaId);
    }
  }
  for (const candidate of candidates) {
    if (selected.length === 3) break;
    if (!selected.includes(candidate)) selected.push(candidate);
  }

  const shareable = candidates.filter(({ shareEligible }) => shareEligible);
  if (
    shareable.length > 0 &&
    !selected.some(({ shareEligible }) => shareEligible)
  ) {
    const diversity = distinctAreaCount(selected);
    for (const replacement of shareable) {
      const removables = selected
        .filter(({ shareEligible }) => !shareEligible)
        .sort(
          (left, right) =>
            Number(right.kind === replacement.kind) -
              Number(left.kind === replacement.kind) ||
            rankCandidate(right, left),
        );
      const removable = removables.find(
        (candidate) =>
          distinctAreaCount(
            selected.map((item) => (item === candidate ? replacement : item)),
          ) === diversity,
      );
      if (!removable) continue;
      selected.splice(selected.indexOf(removable), 1, replacement);
      break;
    }
  }
  return selected.sort(rankCandidate);
}

export function buildConceptProfile({ pairs }) {
  if (!Array.isArray(pairs)) invalid();
  if (pairs.length === 0)
    return freeze({
      modelVersion: 1,
      hooks: [],
      shareOptions: [],
      areaSummaries: [],
    });
  const sources = collectSources(pairs);
  const candidates = CONCEPT_CATALOG_V1.concepts
    .map((concept) => candidateForConcept(concept, sources))
    .filter(Boolean)
    .sort(rankCandidate);
  if (candidates.length < 3) invalid();

  const selected = selectProfileCandidates(candidates);
  const shareable = candidates
    .filter(({ shareEligible }) => shareEligible)
    .slice(0, 32);
  const shareOptions =
    shareable.length < 3
      ? []
      : shareable.map((candidate) => ({
          conceptId: candidate.conceptId,
          sourcePlayId: candidate.shareSourcePlayId,
          bundle: buildConceptShareBundle(shareable, candidate.conceptId).map(
            shareAxis,
          ),
        }));
  return decodeConceptProfile(
    {
      modelVersion: 1,
      hooks: selected.map(publicCandidate),
      shareOptions,
      areaSummaries: areaSummaries(sources),
    },
    shareOptions,
  );
}

const HOOK_KEYS = Object.freeze([
  "areaId",
  "areaLabel",
  "basis",
  "conceptId",
  "conceptLabel",
  "directionA",
  "directionB",
  "kind",
  "observation",
  "privateOthers",
  "profileEvidence",
  "profileSourcePackSlug",
  "profileSourcePackTitle",
  "profileSourcePlayId",
  "question",
  "self",
  "shareEligible",
  "shareEvidence",
  "shareSafeOthers",
  "shareSourcePackSlug",
  "shareSourcePackTitle",
  "shareSourcePlayId",
  "stage",
]);
const SOURCE_AVAILABLE_KEYS = Object.freeze([
  "direction",
  "directionText",
  "evidence",
  "position",
  "stage",
  "status",
]);
const AREA_SUMMARY_KEYS = Object.freeze([
  "areaId",
  "areaLabel",
  "cardCount",
  "contextCount",
  "packCount",
  "stage",
]);
const EVIDENCE_KEYS = Object.freeze([
  "cardCount",
  "contextCount",
  "packCount",
  "packs",
]);
const PACK_EVIDENCE_KEYS = Object.freeze(["contexts", "packSlug", "packTitle"]);
const SHARE_EVIDENCE_KEYS = Object.freeze([
  "direction",
  "directionText",
  "evidence",
  "observation",
  "question",
  "source",
  "stage",
  "status",
]);
const SHARE_OPTION_KEYS = Object.freeze([
  "bundle",
  "conceptId",
  "sourcePlayId",
]);
const LOWER_KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.keys(value).sort().join("\0") === [...keys].sort().join("\0")
  );
}

function boundedText(value, maximum, pattern) {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length >= 1 &&
    value.length <= maximum &&
    (!pattern || pattern.test(value))
  );
}

function deepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => deepEqual(item, right[index]))
    );
  }
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && deepEqual(left[key], right[key]),
    )
  );
}

function conceptForShareAxis(axis) {
  decodeConceptProfileShareAxis(axis);
  const matches = CONCEPT_CATALOG_V1.concepts.filter((concept) => {
    const area = CONCEPT_CATALOG_V1.areas.find(
      ({ id }) => id === concept.areaId,
    );
    return (
      area?.label === axis.areaLabel &&
      concept.label === axis.conceptLabel &&
      concept.directionA === axis.directionA &&
      concept.directionB === axis.directionB
    );
  });
  if (matches.length !== 1) invalid();
  return matches[0];
}

function positiveSafeInteger(value, maximum) {
  return Number.isSafeInteger(value) && value >= 1 && value <= maximum;
}

function nonnegativeSafeInteger(value, maximum) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function registerPackTitle(packTitles, slug, title) {
  const existing = packTitles.get(slug);
  if (existing !== undefined && existing !== title) invalid();
  packTitles.set(slug, title);
}

function validateEvidence(value, packTitles) {
  if (
    !exactKeys(value, EVIDENCE_KEYS) ||
    !positiveSafeInteger(value.cardCount, 240) ||
    !positiveSafeInteger(value.packCount, 24) ||
    !positiveSafeInteger(value.contextCount, 215) ||
    value.cardCount < value.contextCount ||
    value.packCount > value.cardCount ||
    !Array.isArray(value.packs) ||
    value.packCount !== value.packs.length
  ) {
    invalid();
  }
  const slugs = new Set();
  const contextUnion = new Set();
  let previousSlug = null;
  for (const pack of value.packs) {
    if (
      !exactKeys(pack, PACK_EVIDENCE_KEYS) ||
      !boundedText(pack.packSlug, 64, LOWER_KEBAB) ||
      !boundedText(pack.packTitle, CONCEPT_COPY_LIMITS.packTitle) ||
      !Array.isArray(pack.contexts) ||
      pack.contexts.length === 0 ||
      slugs.has(pack.packSlug) ||
      (previousSlug !== null && previousSlug.localeCompare(pack.packSlug) >= 0)
    ) {
      invalid();
    }
    slugs.add(pack.packSlug);
    previousSlug = pack.packSlug;
    registerPackTitle(packTitles, pack.packSlug, pack.packTitle);
    let previousContext = null;
    const packContexts = new Set();
    for (const context of pack.contexts) {
      if (
        !isConceptContextV1(context) ||
        packContexts.has(context) ||
        (previousContext !== null &&
          previousContext.localeCompare(context) >= 0)
      ) {
        invalid();
      }
      packContexts.add(context);
      contextUnion.add(context);
      previousContext = context;
    }
  }
  if (contextUnion.size !== value.contextCount) invalid();
  return value;
}

function expectedDirectionText(concept, direction) {
  if (direction === "a") return concept.directionA;
  if (direction === "b") return concept.directionB;
  if (direction === "contextual") return "상황에 따라 양쪽 모습";
  if (direction === "unsettled") return "아직 한쪽으로 모이지 않음";
  invalid();
}

function validateSource(value, concept, packTitles, { self = false } = {}) {
  if (value?.status === "locked") {
    if (
      self ||
      !exactKeys(value, ["sightCount", "status"]) ||
      !Number.isSafeInteger(value.sightCount) ||
      value.sightCount < 0 ||
      value.sightCount > 2
    ) {
      invalid();
    }
    return value;
  }
  if (
    !exactKeys(value, SOURCE_AVAILABLE_KEYS) ||
    value.status !== "available" ||
    !["trace", "outline", "clear"].includes(value.stage) ||
    !["a", "b", "contextual", "unsettled"].includes(value.direction) ||
    value.directionText !== expectedDirectionText(concept, value.direction) ||
    !Number.isFinite(value.position) ||
    value.position < -1 ||
    value.position > 1 ||
    (value.direction === "a" &&
      value.position > -CONCEPT_DIRECTION_THRESHOLD) ||
    (value.direction === "b" && value.position < CONCEPT_DIRECTION_THRESHOLD) ||
    (value.direction === "unsettled" &&
      Math.abs(value.position) >= CONCEPT_DIRECTION_THRESHOLD)
  ) {
    invalid();
  }
  validateEvidence(value.evidence, packTitles);
  if (
    value.stage !==
    stageForEvidence(
      value.evidence.cardCount,
      value.evidence.packCount,
      value.evidence.contextCount,
    )
  ) {
    invalid();
  }
  return value;
}

function expectedShareCopy(concept, source) {
  return source.direction === "contextual"
    ? {
        observation: `주변 시선에서는 ${concept.label}이 상황에 따라 양쪽으로 또렷해요.`,
        question: "너는 언제 반대쪽 모습이 나와?",
      }
    : {
        observation: `주변 시선에서는 여러 장면에서 “${source.directionText}” 쪽이 반복됐어요.`,
        question: "너는 내가 어떤 장면에서 그렇게 보였어?",
      };
}

function validateAvailableShareEvidence(
  value,
  concept,
  packTitles,
  source = null,
) {
  if (
    !exactKeys(value, SHARE_EVIDENCE_KEYS) ||
    value.status !== "available" ||
    value.source !== "shareSafeOthers" ||
    !["outline", "clear"].includes(value.stage) ||
    !["a", "b", "contextual"].includes(value.direction) ||
    value.directionText !== expectedDirectionText(concept, value.direction) ||
    !boundedText(value.observation, CONCEPT_COPY_LIMITS.observation) ||
    !boundedText(value.question, CONCEPT_COPY_LIMITS.question)
  ) {
    invalid();
  }
  validateEvidence(value.evidence, packTitles);
  const copy = expectedShareCopy(concept, value);
  if (
    value.observation !== copy.observation ||
    value.question !== copy.question
  ) {
    invalid();
  }
  if (
    source !== null &&
    (source.status !== "available" ||
      source.stage !== value.stage ||
      source.direction !== value.direction ||
      source.directionText !== value.directionText ||
      !deepEqual(source.evidence, value.evidence))
  ) {
    invalid();
  }
  return value;
}

function sourceContainsPack(evidenceEntries, slug, title) {
  return evidenceEntries.some(({ evidence }) =>
    evidence.packs.some(
      (pack) => pack.packSlug === slug && pack.packTitle === title,
    ),
  );
}

function validateProfileEvidence(hook, packTitles) {
  const expectedSources =
    hook.basis === "self"
      ? ["self"]
      : hook.basis === "others"
        ? ["privateOthers"]
        : ["self", "privateOthers"];
  if (
    !Array.isArray(hook.profileEvidence) ||
    hook.profileEvidence.length !== expectedSources.length
  ) {
    invalid();
  }
  hook.profileEvidence.forEach((entry, index) => {
    if (
      !exactKeys(entry, ["evidence", "source"]) ||
      entry.source !== expectedSources[index]
    ) {
      invalid();
    }
    const source = entry.source === "self" ? hook.self : hook.privateOthers;
    if (
      source.status !== "available" ||
      !deepEqual(entry.evidence, source.evidence)
    ) {
      invalid();
    }
    validateEvidence(entry.evidence, packTitles);
  });
}

function expectedHookPresentationForDecode(hook, concept) {
  const difference =
    availableAtLeast(hook.self, "outline") &&
    availableAtLeast(hook.privateOthers, "outline") &&
    directionAB(hook.self) &&
    directionAB(hook.privateOthers) &&
    hook.self.direction !== hook.privateOthers.direction;
  if (difference) {
    return {
      kind: "difference",
      basis: "both",
      stage: lowerStage(hook.self.stage, hook.privateOthers.stage),
      observation: `나는 “${hook.self.directionText}” 쪽인데, 주변 시선은 “${hook.privateOthers.directionText}” 쪽이에요.`,
      question: "너는 내가 어떤 장면에서 그렇게 보였어?",
    };
  }
  const selfContextual = hook.self.direction === "contextual";
  const othersContextual =
    hook.privateOthers.status === "available" &&
    hook.privateOthers.direction === "contextual";
  if (selfContextual || othersContextual) {
    const basis =
      selfContextual && othersContextual
        ? "both"
        : selfContextual
          ? "self"
          : "others";
    return {
      kind: "contextual",
      basis,
      stage:
        basis === "self"
          ? hook.self.stage
          : basis === "others"
            ? hook.privateOthers.stage
            : lowerStage(hook.self.stage, hook.privateOthers.stage),
      observation:
        basis === "both"
          ? `나와 주변 모두 ${concept.label}이 상황에 따라 양쪽으로 또렷해요.`
          : basis === "self"
            ? `내 선택에서는 ${concept.label}이 상황에 따라 양쪽으로 또렷해요.`
            : `주변 시선에서는 ${concept.label}이 상황에 따라 양쪽으로 또렷해요.`,
      question: "너는 언제 반대쪽 모습이 나와?",
    };
  }
  if (hook.kind === "repeated") {
    if (
      !availableAtLeast(hook.self, "outline") ||
      !directionAB(hook.self) ||
      hook.self.evidence.packCount < 2 ||
      hook.self.evidence.contextCount < 2
    ) {
      invalid();
    }
    return {
      kind: "repeated",
      basis: "self",
      stage: hook.self.stage,
      observation: `여러 장면에서 “${hook.self.directionText}” 쪽이 반복됐어요.`,
      question: "너도 이런 장면에서는 같은 쪽이야?",
    };
  }
  if (hook.kind !== "emerging") invalid();
  return {
    kind: "emerging",
    basis: "self",
    stage: hook.self.stage,
    observation: directionAB(hook.self)
      ? `최근 장면에서 “${hook.self.directionText}” 쪽의 흔적이 보이기 시작했어요.`
      : "최근 장면에서 서로 다른 모습이 함께 보이기 시작했어요.",
    question: "너는 이런 상황에서 어느 쪽을 고를 것 같아?",
  };
}

function publicHookRank(left, right) {
  const leftEvidence = left.profileEvidence.map(({ evidence }) => evidence);
  const rightEvidence = right.profileEvidence.map(({ evidence }) => evidence);
  return (
    KIND_RANK[left.kind] - KIND_RANK[right.kind] ||
    STAGE_RANK[right.stage] - STAGE_RANK[left.stage] ||
    Math.max(...rightEvidence.map(({ packCount }) => packCount)) -
      Math.max(...leftEvidence.map(({ packCount }) => packCount)) ||
    Math.max(...rightEvidence.map(({ contextCount }) => contextCount)) -
      Math.max(...leftEvidence.map(({ contextCount }) => contextCount)) ||
    CONCEPT_CATALOG_V1.concepts.findIndex(({ id }) => id === left.conceptId) -
      CONCEPT_CATALOG_V1.concepts.findIndex(({ id }) => id === right.conceptId)
  );
}

export function decodeConceptProfile(value, expectedShareOptions = null) {
  if (
    !exactKeys(value, [
      "areaSummaries",
      "hooks",
      "modelVersion",
      "shareOptions",
    ]) ||
    value.modelVersion !== 1 ||
    !Array.isArray(value.hooks) ||
    !Array.isArray(value.shareOptions) ||
    !Array.isArray(value.areaSummaries) ||
    (value.hooks.length === 0 &&
      (value.shareOptions.length !== 0 || value.areaSummaries.length !== 0)) ||
    (value.hooks.length !== 0 &&
      (value.hooks.length !== 3 || value.areaSummaries.length !== 8)) ||
    value.shareOptions.length > 32 ||
    (value.shareOptions.length > 0 && value.shareOptions.length < 3)
  ) {
    invalid();
  }
  if (
    expectedShareOptions !== null &&
    (!Array.isArray(expectedShareOptions) ||
      !deepEqual(value.shareOptions, expectedShareOptions))
  ) {
    invalid();
  }
  const packTitles = new Map();
  const hookIds = new Set();
  for (const [index, hook] of value.hooks.entries()) {
    if (
      !exactKeys(hook, HOOK_KEYS) ||
      !isConceptId(hook.conceptId) ||
      hookIds.has(hook.conceptId)
    ) {
      invalid();
    }
    const concept = conceptById(hook.conceptId);
    const area = CONCEPT_CATALOG_V1.areas.find(
      ({ id }) => id === concept.areaId,
    );
    if (
      hook.conceptLabel !== concept.label ||
      hook.areaId !== concept.areaId ||
      hook.areaLabel !== area.label ||
      hook.directionA !== concept.directionA ||
      hook.directionB !== concept.directionB ||
      !["difference", "contextual", "repeated", "emerging"].includes(
        hook.kind,
      ) ||
      !["self", "others", "both"].includes(hook.basis) ||
      !["trace", "outline", "clear"].includes(hook.stage) ||
      !boundedText(hook.observation, CONCEPT_COPY_LIMITS.observation) ||
      !boundedText(hook.question, CONCEPT_COPY_LIMITS.question) ||
      !isOwnerPlayId(hook.profileSourcePlayId) ||
      !boundedText(hook.profileSourcePackSlug, 64, LOWER_KEBAB) ||
      !boundedText(hook.profileSourcePackTitle, CONCEPT_COPY_LIMITS.packTitle)
    ) {
      invalid();
    }
    validateSource(hook.self, concept, packTitles, { self: true });
    validateSource(hook.privateOthers, concept, packTitles);
    validateSource(hook.shareSafeOthers, concept, packTitles);
    validateProfileEvidence(hook, packTitles);
    const presentation = expectedHookPresentationForDecode(hook, concept);
    if (
      hook.kind !== presentation.kind ||
      hook.basis !== presentation.basis ||
      hook.stage !== presentation.stage ||
      hook.observation !== presentation.observation ||
      hook.question !== presentation.question ||
      !sourceContainsPack(
        hook.profileEvidence,
        hook.profileSourcePackSlug,
        hook.profileSourcePackTitle,
      )
    ) {
      invalid();
    }

    const shareAvailable = hook.shareEvidence?.status === "available";
    const shareSourceEligible =
      availableAtLeast(hook.shareSafeOthers, "outline") &&
      hook.shareSafeOthers.direction !== "unsettled" &&
      directionAB(hook.self);
    if (
      hook.shareEligible !== shareSourceEligible ||
      shareAvailable !==
        (availableAtLeast(hook.shareSafeOthers, "outline") &&
          hook.shareSafeOthers.direction !== "unsettled") ||
      (!shareAvailable && !exactKeys(hook.shareEvidence, ["status"])) ||
      (!shareAvailable && hook.shareEvidence.status !== "unavailable")
    ) {
      invalid();
    }
    if (shareAvailable) {
      validateAvailableShareEvidence(
        hook.shareEvidence,
        concept,
        packTitles,
        hook.shareSafeOthers,
      );
      if (
        !isOwnerPlayId(hook.shareSourcePlayId) ||
        !boundedText(hook.shareSourcePackSlug, 64, LOWER_KEBAB) ||
        !boundedText(
          hook.shareSourcePackTitle,
          CONCEPT_COPY_LIMITS.packTitle,
        ) ||
        !sourceContainsPack(
          [{ evidence: hook.shareEvidence.evidence }],
          hook.shareSourcePackSlug,
          hook.shareSourcePackTitle,
        )
      ) {
        invalid();
      }
    } else if (
      hook.shareSourcePlayId !== null ||
      hook.shareSourcePackSlug !== null ||
      hook.shareSourcePackTitle !== null
    ) {
      invalid();
    }
    if (index > 0 && publicHookRank(value.hooks[index - 1], hook) > 0) {
      invalid();
    }
    hookIds.add(hook.conceptId);
  }
  value.areaSummaries.forEach((summary, index) => {
    const area = CONCEPT_CATALOG_V1.areas[index];
    if (
      !exactKeys(summary, AREA_SUMMARY_KEYS) ||
      summary.areaId !== area.id ||
      summary.areaLabel !== area.label ||
      !nonnegativeSafeInteger(summary.cardCount, 240) ||
      !nonnegativeSafeInteger(summary.packCount, 24) ||
      !nonnegativeSafeInteger(summary.contextCount, 215) ||
      summary.contextCount > summary.cardCount ||
      summary.packCount > summary.cardCount ||
      summary.stage !==
        stageForEvidence(
          summary.cardCount,
          summary.packCount,
          summary.contextCount,
        )
    ) {
      invalid();
    }
  });
  const optionIds = new Set();
  const hookByConcept = new Map(
    value.hooks.map((hook, index) => [hook.conceptId, { hook, index }]),
  );
  const optionConcepts = new Map();
  let previousHookRank = -1;
  for (const option of value.shareOptions) {
    if (
      !exactKeys(option, SHARE_OPTION_KEYS) ||
      !isConceptId(option.conceptId) ||
      optionIds.has(option.conceptId) ||
      !isOwnerPlayId(option.sourcePlayId) ||
      !Array.isArray(option.bundle) ||
      option.bundle.length !== 3
    ) {
      invalid();
    }
    const bundleConcepts = option.bundle.map(conceptForShareAxis);
    if (
      bundleConcepts[0].id !== option.conceptId ||
      new Set(bundleConcepts.map(({ id }) => id)).size !== 3
    ) {
      invalid();
    }
    const selected = hookByConcept.get(option.conceptId);
    if (selected) {
      if (
        !selected.hook.shareEligible ||
        !deepEqual(option.bundle[0], shareAxis(selected.hook)) ||
        option.sourcePlayId !== selected.hook.shareSourcePlayId ||
        selected.index <= previousHookRank
      ) {
        invalid();
      }
      previousHookRank = selected.index;
    }
    optionConcepts.set(option.conceptId, bundleConcepts);
    optionIds.add(option.conceptId);
  }
  const eligibleUniverse = value.shareOptions.map((option) => {
    const concept = conceptById(option.conceptId);
    return { conceptId: concept.id, areaId: concept.areaId };
  });
  for (const option of value.shareOptions) {
    const expected = buildConceptShareBundle(
      eligibleUniverse,
      option.conceptId,
    );
    if (
      !expected ||
      !deepEqual(
        optionConcepts.get(option.conceptId).map(({ id }) => id),
        expected.map(({ conceptId }) => conceptId),
      )
    ) {
      invalid();
    }
  }
  for (const hook of value.hooks) {
    if (
      value.shareOptions.length > 0 &&
      hook.shareEligible &&
      !optionIds.has(hook.conceptId)
    ) {
      invalid();
    }
  }
  if (
    value.shareOptions.length === 0 &&
    value.hooks.filter(({ shareEligible }) => shareEligible).length === 3
  ) {
    invalid();
  }
  return freeze(value);
}
