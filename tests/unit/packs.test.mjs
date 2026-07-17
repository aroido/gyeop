import assert from "node:assert/strict";
import test from "node:test";

import { packs } from "../../app/play/packs.ts";

test("official prototype packs have valid isolated card data", () => {
  const entries = Object.entries(packs);
  assert.equal(entries.length, 4);
  assert.equal(
    new Set(entries.map(([, pack]) => pack.storageKey)).size,
    entries.length,
  );

  for (const [slug, pack] of entries) {
    assert.equal(pack.slug, slug);
    assert.equal(pack.cards.length, 10);
    assert.equal(
      pack.cards.filter((card) => card.signature).length,
      1,
      `${slug} must have one Signature card`,
    );
    assert.equal(
      new Set(pack.cards.map((card) => card.id)).size,
      pack.cards.length,
      `${slug} card ids must be unique`,
    );

    for (const card of pack.cards) {
      for (const value of [
        card.id,
        card.question,
        card.visitorQuestion,
        card.a,
        card.b,
      ]) {
        assert.ok(value.trim(), `${slug} cards must not contain blank fields`);
      }
      assert.notEqual(card.a, card.b);
    }
  }
});

test("old-friend validation contract stays frozen", () => {
  assert.deepEqual(packs["old-friend"], {
    slug: "old-friend",
    title: "오래된 친구팩",
    storageKey: "gyeop:old-friend-play:v1",
    relationship: "오래된 친구",
    mood: "따뜻한 회상",
    sensitivity: "낮은 민감도",
    shareRecommendation: "공개 공유 추천",
    cards: [
      {
        id: "conflict",
        signature: true,
        question: "서운한 일이 생기면 나는?",
        visitorQuestion: "서운한 일이 생기면 이 사람은?",
        a: "바로 이야기한다",
        b: "생각을 정리한 뒤 말한다",
      },
      {
        id: "reunion",
        question: "오랜만에 친구를 만나면 나는?",
        visitorQuestion: "오랜만에 친구를 만나면 이 사람은?",
        a: "어제 본 듯 바로 편해진다",
        b: "근황부터 천천히 맞춰 간다",
      },
      {
        id: "plans",
        question: "약속을 잡을 때 나는?",
        visitorQuestion: "약속을 잡을 때 이 사람은?",
        a: "미리 날짜를 정한다",
        b: "그때그때 편한 날을 본다",
      },
      {
        id: "comfort",
        question: "친구가 고민을 털어놓으면 나는?",
        visitorQuestion: "친구가 고민을 털어놓으면 이 사람은?",
        a: "먼저 끝까지 들어준다",
        b: "해결 방법부터 같이 찾는다",
      },
      {
        id: "gathering",
        question: "여러 친구가 모인 자리에서 나는?",
        visitorQuestion: "여러 친구가 모인 자리에서 이 사람은?",
        a: "먼저 분위기를 띄운다",
        b: "익숙한 사람 곁에서 시작한다",
      },
      {
        id: "reconnect",
        question: "연락이 뜸해졌을 때 나는?",
        visitorQuestion: "연락이 뜸해졌을 때 이 사람은?",
        a: "짧게 안부부터 보낸다",
        b: "만날 약속부터 잡는다",
      },
      {
        id: "memory",
        question: "옛날 이야기가 나오면 나는?",
        visitorQuestion: "옛날 이야기가 나오면 이 사람은?",
        a: "구체적인 장면부터 떠올린다",
        b: "그때 느낀 감정부터 떠올린다",
      },
      {
        id: "travel",
        question: "친구와 여행 일정을 정할 때 나는?",
        visitorQuestion: "친구와 여행 일정을 정할 때 이 사람은?",
        a: "미리 계획을 세운다",
        b: "현장에서 그때그때 정한다",
      },
      {
        id: "celebration",
        question: "친구의 좋은 소식을 들은 직후 나는?",
        visitorQuestion: "친구의 좋은 소식을 들은 직후 이 사람은?",
        a: "바로 연락해 축하한다",
        b: "다음에 만날 때 직접 축하한다",
      },
      {
        id: "hard-day",
        question: "힘든 날에 나는?",
        visitorQuestion: "힘든 날에 이 사람은?",
        a: "먼저 연락해 털어놓는다",
        b: "혼자 정리한 뒤 연락한다",
      },
    ],
  });
});
