const AREA_IDS = Object.freeze([
  "rel",
  "exp",
  "act",
  "dec",
  "coop",
  "reg",
  "att",
  "pref",
]);

const CONCEPT_ID = /^(?:rel|exp|act|dec|coop|reg|att|pref)\.[a-z]+$/;

export const CONCEPT_COPY_LIMITS = Object.freeze({
  conceptId: 64,
  context: 40,
  areaLabel: 24,
  conceptLabel: 24,
  directionText: 40,
  observation: 160,
  question: 80,
  evidenceText: 80,
  packTitle: 80,
});

export const CONCEPT_CONTEXT_V1_ALLOWLIST = Object.freeze(
  new Set([
    "간식·맛",
    "간식·변경",
    "간식·선물",
    "간식·선택",
    "간식·시도",
    "간식·조합",
    "간식·종료",
    "간식·준비",
    "간식·추천",
    "간식·취향",
    "감정·공유",
    "감정·숨김",
    "감정·회복",
    "걱정·생각",
    "걱정·준비",
    "검색·정보",
    "경험·기록",
    "계획",
    "계획·변경",
    "공간·돌봄",
    "공간·만족",
    "공간·빛",
    "공간·선택",
    "공간·소리",
    "공간·정리",
    "공간·집중",
    "공간·환경",
    "관계·거리",
    "관심·표현",
    "귀가·공간",
    "귀가·전환",
    "기억",
    "낯선모임",
    "낯선사람",
    "놀이·협업",
    "단체채팅·반응",
    "단체채팅·정보",
    "단체채팅·진입",
    "대화·전환",
    "대화·종료",
    "대화·진입",
    "도움·반응",
    "돌발·반응",
    "돌발·생각",
    "동료·관계",
    "마감·선택",
    "마감·시작",
    "메시지·검토",
    "메시지·기다림",
    "메시지·반응",
    "메시지·설명",
    "메시지·시간",
    "메시지·애매함",
    "메시지·정보",
    "메시지·표현",
    "모임·관계",
    "모임·애매함",
    "모임·역할",
    "모임·진입",
    "모임·피로",
    "모임·회복",
    "문제·도움",
    "민망함·전환",
    "반복·변경",
    "밤·일상",
    "보상·전환",
    "사진·공유",
    "사진·기억",
    "사진·선택",
    "사진·협업",
    "산책·준비",
    "새표현·관계",
    "새표현·시도",
    "선물·정보",
    "선택",
    "선택·시간",
    "선택·시도",
    "선택·피로",
    "선택·회고",
    "성취",
    "성취·공유",
    "소비·검토",
    "소비·기억",
    "소비·만족",
    "소비·보상",
    "소비·선택",
    "수집·만족",
    "식사·기록",
    "식사·선택",
    "식사·준비",
    "식사·협업",
    "실망·전환",
    "실수",
    "아이디어",
    "아침·일상",
    "아침·자극",
    "애정·표현",
    "약속",
    "약속·기억",
    "약속·변경",
    "약속·비용",
    "약속·애매함",
    "약속·연락",
    "약속·전환",
    "약속·종료",
    "약속·표현",
    "약속·회복",
    "업무·공유",
    "업무·도움",
    "업무·마감",
    "업무·변경",
    "업무·순서",
    "업무·애매함",
    "업무·집중",
    "업무·피드백",
    "업무·회복",
    "여가·회복",
    "여행·기록",
    "여행·도착",
    "여행·변경",
    "여행·식사",
    "여행·아침",
    "여행·전환",
    "여행·준비",
    "여행·탐색",
    "여행·협업",
    "여행·회복",
    "연락",
    "연락·진입",
    "오해·반응",
    "오해·표현",
    "완료·전환",
    "웃음·반응",
    "웃음·표현",
    "웃음·회복",
    "위로·도움",
    "유머·공유",
    "유머·기억",
    "유머·반응",
    "유머·이야기",
    "유머·취향",
    "유행·시도",
    "의견조율",
    "이동",
    "일상·변경",
    "일상·시작",
    "자기표현·선택",
    "장난·표현",
    "장소·시도",
    "재회·거리",
    "재회·대화",
    "저장·공유",
    "정리·일상",
    "조언·애매함",
    "주간·준비",
    "주말·계획",
    "주말·시작",
    "주말·식사",
    "주말·일상",
    "주말·전환",
    "주말·준비",
    "주말·탐색",
    "주말·활동",
    "주말·회복",
    "주목·표현",
    "중요한선택",
    "즉흥약속",
    "집중·변경",
    "집중·취향",
    "첫대화",
    "첫만남",
    "첫만남·반응",
    "첫만남·연락",
    "첫인상·준비",
    "초대·준비",
    "초안·애매함",
    "추천·비교",
    "추천·설명",
    "추천·탐색",
    "추천·표현",
    "축하·반응",
    "취미·일상",
    "취향·기억",
    "친구·갈등",
    "친구·기억",
    "친구·도움",
    "친구·모임",
    "친구·사진",
    "친구·약속",
    "친구·여행",
    "친구·연락",
    "친구·웃음",
    "친구·위로",
    "친구·이야기",
    "친구·축하",
    "친구·회복",
    "친밀한관계",
    "칭찬·기억",
    "칭찬·반응",
    "칭찬·표현",
    "카페·취향",
    "콘텐츠·공유",
    "콘텐츠·반응",
    "콘텐츠·연락",
    "콘텐츠·정보",
    "탐색·변경",
    "퇴근·전환",
    "풍경·기억",
    "피드백",
    "할일·정보",
    "협업·역할",
    "협업·조율",
    "혼자·생각",
    "회복·감정",
    "회의·표현",
  ]),
);

function exact(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.keys(value).sort().join("\0") === [...keys].sort().join("\0")
  );
}

function text(value, maximum, pattern) {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length >= 1 &&
    value.length <= maximum &&
    (!pattern || pattern.test(value))
  );
}

function invalid() {
  throw new Error("Invalid concept catalog");
}

export function isConceptId(value) {
  return (
    text(value, CONCEPT_COPY_LIMITS.conceptId, CONCEPT_ID) &&
    CONCEPT_IDS.has(value)
  );
}

export function isConceptContextV1(value) {
  return (
    text(value, CONCEPT_COPY_LIMITS.context) &&
    CONCEPT_CONTEXT_V1_ALLOWLIST.has(value)
  );
}

export function decodeConceptCatalog(value) {
  if (
    !exact(value, ["areas", "concepts", "version"]) ||
    value.version !== 1 ||
    !Array.isArray(value.areas) ||
    value.areas.length !== AREA_IDS.length ||
    !Array.isArray(value.concepts) ||
    value.concepts.length !== 32
  ) {
    invalid();
  }

  const areaIds = new Set();
  const areas = value.areas.map((area, index) => {
    if (
      !exact(area, ["id", "label"]) ||
      area.id !== AREA_IDS[index] ||
      areaIds.has(area.id) ||
      !text(area.label, CONCEPT_COPY_LIMITS.areaLabel)
    ) {
      invalid();
    }
    areaIds.add(area.id);
    return Object.freeze({ id: area.id, label: area.label });
  });

  const conceptIds = new Set();
  const concepts = value.concepts.map((concept) => {
    if (
      !exact(concept, ["areaId", "directionA", "directionB", "id", "label"]) ||
      !text(concept.id, CONCEPT_COPY_LIMITS.conceptId, CONCEPT_ID) ||
      concept.id.split(".")[0] !== concept.areaId ||
      !areaIds.has(concept.areaId) ||
      conceptIds.has(concept.id) ||
      !text(concept.label, CONCEPT_COPY_LIMITS.conceptLabel) ||
      !text(concept.directionA, CONCEPT_COPY_LIMITS.directionText) ||
      !text(concept.directionB, CONCEPT_COPY_LIMITS.directionText) ||
      concept.directionA === concept.directionB
    ) {
      invalid();
    }
    conceptIds.add(concept.id);
    return Object.freeze({ ...concept });
  });

  return Object.freeze({
    version: 1,
    areas: Object.freeze(areas),
    concepts: Object.freeze(concepts),
  });
}

import catalogValue from "../../content/concepts-v1.json" with { type: "json" };

export const CONCEPT_CATALOG_V1 = decodeConceptCatalog(catalogValue);
export const CONCEPT_IDS = Object.freeze(
  new Set(CONCEPT_CATALOG_V1.concepts.map(({ id }) => id)),
);

export function conceptById(value) {
  if (!isConceptId(value)) invalid();
  return CONCEPT_CATALOG_V1.concepts.find(({ id }) => id === value);
}
