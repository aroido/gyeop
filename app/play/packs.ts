export type PackCard = {
  id: string;
  signature?: boolean;
  question: string;
  visitorQuestion: string;
  a: string;
  b: string;
};

export type Pack = {
  slug: string;
  title: string;
  storageKey: string;
  relationship: string;
  mood: string;
  sensitivity: string;
  shareRecommendation: string;
  cards: readonly PackCard[];
};

export const packs = {
  "old-friend": {
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
  },
  "first-impression": {
    slug: "first-impression",
    title: "첫인상팩",
    storageKey: "gyeop:first-impression-play:v1",
    relationship: "새로 알게 된 사이",
    mood: "가벼운 첫 만남",
    sensitivity: "낮은 민감도",
    shareRecommendation: "공개 공유 추천",
    cards: [
      {
        id: "first-move",
        signature: true,
        question: "처음 만난 자리에서 나는?",
        visitorQuestion: "처음 만난 자리에서 이 사람은?",
        a: "먼저 말을 건다",
        b: "상대가 말을 걸면 자연스럽게 이어 간다",
      },
      {
        id: "first-topic",
        question: "처음 대화를 시작할 때 나는?",
        visitorQuestion: "처음 대화를 시작할 때 이 사람은?",
        a: "공통점을 먼저 찾는다",
        b: "지금 상황에서 소재를 찾는다",
      },
      {
        id: "group-entry",
        question: "낯선 사람들이 모인 자리에 가면 나는?",
        visitorQuestion: "낯선 사람들이 모인 자리에 가면 이 사람은?",
        a: "여러 사람에게 두루 인사한다",
        b: "한두 사람과 먼저 친해진다",
      },
      {
        id: "silence",
        question: "대화가 잠시 끊기면 나는?",
        visitorQuestion: "대화가 잠시 끊기면 이 사람은?",
        a: "새 화제를 꺼낸다",
        b: "잠깐의 침묵도 편하게 둔다",
      },
      {
        id: "interest",
        question: "상대 이야기에 관심을 보일 때 나는 주로?",
        visitorQuestion: "상대 이야기에 관심을 보일 때 이 사람은 주로?",
        a: "표정과 맞장구로 보여 준다",
        b: "이어지는 질문으로 보여 준다",
      },
      {
        id: "humor",
        question: "처음 만난 자리에서 웃음이 생길 때 나는 주로?",
        visitorQuestion: "처음 만난 자리에서 웃음이 생길 때 이 사람은 주로?",
        a: "먼저 농담을 꺼낸다",
        b: "상대 농담에 크게 반응한다",
      },
      {
        id: "warm-up",
        question: "새로운 사람과 가까워질 때 나는?",
        visitorQuestion: "새로운 사람과 가까워질 때 이 사람은?",
        a: "짧은 시간에도 금방 편해진다",
        b: "몇 번 만나며 천천히 편해진다",
      },
      {
        id: "meet-again",
        question: "처음 만난 사람을 다시 만나면 나는 먼저?",
        visitorQuestion: "처음 만난 사람을 다시 만나면 이 사람은 먼저?",
        a: "전에 나눈 이야기를 꺼낸다",
        b: "새로운 근황을 묻는다",
      },
      {
        id: "follow-up",
        question: "처음 만난 뒤 연락할 때 나는?",
        visitorQuestion: "처음 만난 뒤 연락할 때 이 사람은?",
        a: "먼저 짧게 안부를 보낸다",
        b: "다음에 만날 계기가 생기면 연락한다",
      },
      {
        id: "outfit",
        question: "처음 만나는 날 옷을 고를 때 나는?",
        visitorQuestion: "처음 만나는 날 옷을 고를 때 이 사람은?",
        a: "눈에 띄는 포인트를 더한다",
        b: "익숙하고 편한 옷을 고른다",
      },
    ],
  },
  coworker: {
    slug: "coworker",
    title: "직장동료팩",
    storageKey: "gyeop:coworker-play:v1",
    relationship: "직장 동료",
    mood: "담백한 관찰",
    sensitivity: "낮은 민감도",
    shareRecommendation: "공개 공유 추천",
    cards: [
      {
        id: "unclear-task",
        signature: true,
        question: "업무가 애매하게 주어지면 나는?",
        visitorQuestion: "업무가 애매하게 주어지면 이 사람은?",
        a: "먼저 기준을 질문한다",
        b: "가능한 안을 만들어 확인한다",
      },
      {
        id: "meeting",
        question: "회의에서 의견이 생기면 나는?",
        visitorQuestion: "회의에서 의견이 생기면 이 사람은?",
        a: "떠오른 때 바로 말한다",
        b: "정리한 뒤 차례에 말한다",
      },
      {
        id: "focus",
        question: "집중이 필요할 때 나는?",
        visitorQuestion: "집중이 필요할 때 이 사람은?",
        a: "주변을 정돈하고 몰입한다",
        b: "장소나 일을 바꿔 리듬을 만든다",
      },
      {
        id: "deadline",
        question: "마감이 있는 일을 할 때 나는?",
        visitorQuestion: "마감이 있는 일을 할 때 이 사람은?",
        a: "여유 있게 나눠 진행한다",
        b: "집중할 시간을 잡아 한 번에 진행한다",
      },
      {
        id: "feedback",
        question: "피드백을 받으면 나는?",
        visitorQuestion: "피드백을 받으면 이 사람은?",
        a: "바로 질문하며 이해한다",
        b: "혼자 정리한 뒤 반영한다",
      },
      {
        id: "new-colleague",
        question: "새 동료와 가까워질 때 나는 먼저?",
        visitorQuestion: "새 동료와 가까워질 때 이 사람은 먼저?",
        a: "말을 걸고 함께 다닌다",
        b: "업무 중 필요한 순간을 돕는다",
      },
      {
        id: "break",
        question: "점심이나 쉬는 시간에 나는?",
        visitorQuestion: "점심이나 쉬는 시간에 이 사람은?",
        a: "동료와 함께 쉬며 충전한다",
        b: "혼자만의 시간으로 충전한다",
      },
      {
        id: "plan-change",
        question: "계획이 갑자기 바뀌면 나는 먼저?",
        visitorQuestion: "계획이 갑자기 바뀌면 이 사람은 먼저?",
        a: "새 우선순위를 정한다",
        b: "영향받는 사람과 일을 확인한다",
      },
      {
        id: "ask-help",
        question: "동료의 도움이 필요할 때 나는?",
        visitorQuestion: "동료의 도움이 필요할 때 이 사람은?",
        a: "상황을 설명하고 바로 요청한다",
        b: "내가 해본 뒤 막힌 부분을 묻는다",
      },
      {
        id: "share-work",
        question: "일을 마친 뒤 나는?",
        visitorQuestion: "일을 마친 뒤 이 사람은?",
        a: "바로 공유하고 의견을 받는다",
        b: "한 번 더 점검한 뒤 공유한다",
      },
    ],
  },
  "honest-self": {
    slug: "honest-self",
    title: "솔직한 나팩",
    storageKey: "gyeop:honest-self-play:v1",
    relationship: "가까운 사이",
    mood: "차분한 솔직함",
    sensitivity: "중간 민감도",
    shareRecommendation: "1:1 공유 추천",
    cards: [
      {
        id: "busy-mind",
        signature: true,
        question: "마음이 복잡한 날 나는?",
        visitorQuestion: "마음이 복잡한 날 이 사람은?",
        a: "누군가에게 말하며 정리한다",
        b: "혼자 시간을 보내며 정리한다",
      },
      {
        id: "compliment",
        question: "칭찬을 들으면 나는?",
        visitorQuestion: "칭찬을 들으면 이 사람은?",
        a: "기분 좋은 티가 바로 난다",
        b: "쑥스러워도 조용히 받아들인다",
      },
      {
        id: "big-choice",
        question: "중요한 선택 앞에서 나는?",
        visitorQuestion: "중요한 선택 앞에서 이 사람은?",
        a: "주변 의견을 들어 본다",
        b: "내 기준부터 정리한다",
      },
      {
        id: "letdown",
        question: "기대했던 일이 어긋난 직후 나는?",
        visitorQuestion: "기대했던 일이 어긋난 직후 이 사람은?",
        a: "아쉬움을 말로 표현한다",
        b: "다음 방법부터 찾는다",
      },
      {
        id: "misunderstood",
        question: "오해받았다고 느끼면 나는?",
        visitorQuestion: "오해받았다고 느끼면 이 사람은?",
        a: "그 자리에서 바로 풀려고 한다",
        b: "감정이 가라앉은 뒤 이야기한다",
      },
      {
        id: "free-day",
        question: "아무 약속 없는 하루가 생기면 나는?",
        visitorQuestion: "아무 약속 없는 하루가 생기면 이 사람은?",
        a: "하고 싶던 일을 찾아 움직인다",
        b: "쉬면서 그날 기분을 따른다",
      },
      {
        id: "need-help",
        question: "도움이 필요할 때 나는?",
        visitorQuestion: "도움이 필요할 때 이 사람은?",
        a: "구체적으로 부탁한다",
        b: "혼자 해본 뒤 부탁한다",
      },
      {
        id: "new-start",
        question: "새로운 일을 시작할 때 나는?",
        visitorQuestion: "새로운 일을 시작할 때 이 사람은?",
        a: "일단 해보며 감을 잡는다",
        b: "충분히 알아본 뒤 시작한다",
      },
      {
        id: "attention",
        question: "사람들이 나를 주목하면 나는?",
        visitorQuestion: "사람들이 이 사람을 주목하면?",
        a: "그 분위기를 즐기는 편이다",
        b: "조금 뒤로 물러나는 편이다",
      },
      {
        id: "affection",
        question: "좋아하는 사람에게 마음을 표현할 때 나는 주로?",
        visitorQuestion:
          "좋아하는 사람에게 이 사람은 마음을 주로 어떻게 표현할까?",
        a: "말로 직접 전한다",
        b: "행동으로 자연스럽게 보여 준다",
      },
    ],
  },
} satisfies Record<string, Pack>;

export function getPack(slug: string): Pack | undefined {
  if (!Object.prototype.hasOwnProperty.call(packs, slug)) return undefined;
  return packs[slug as keyof typeof packs];
}
