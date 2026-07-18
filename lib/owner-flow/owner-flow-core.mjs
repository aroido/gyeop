import { decodeOwnerPlayState } from "../owner-play/owner-play-state-core.mjs";
import { decodePublishedPack } from "../packs/published-pack-core.mjs";

function invalid() {
  throw new Error("Invalid owner flow state");
}

function answerRecord(answers) {
  return Object.freeze(
    Object.fromEntries(answers.map(({ cardId, choice }) => [cardId, choice])),
  );
}

function overlayAnswers(base, queue) {
  const answers = { ...base };
  for (const operation of queue) answers[operation.cardId] = operation.choice;
  return Object.freeze(answers);
}

function firstUnanswered(cards, answers, startIndex = 0) {
  for (let offset = 0; offset < cards.length; offset += 1) {
    const index = (startIndex + offset) % cards.length;
    if (!answers[cards[index].id]) return index;
  }
  return -1;
}

function freezeState(state) {
  return Object.freeze({
    ...state,
    answers: Object.freeze({ ...state.answers }),
    queue: Object.freeze(
      state.queue.map((operation) => Object.freeze(operation)),
    ),
  });
}

export function decodeOwnerFlow(rawPlay, rawPack) {
  const play = decodeOwnerPlayState(rawPlay);
  const pack = decodePublishedPack(rawPack);
  if (play.packSlug !== pack.slug || play.packVersion !== pack.version)
    invalid();

  const cardIds = new Set(pack.cards.map((card) => card.id));
  if (play.answers.some((answer) => !cardIds.has(answer.cardId))) invalid();
  const answers = answerRecord(play.answers);
  const requestedIndex = play.currentPosition - 1;
  const nextIndex = firstUnanswered(pack.cards, answers, requestedIndex);

  return freezeState({
    phase: play.status,
    play,
    pack,
    answers,
    currentIndex:
      play.status === "completed"
        ? pack.cards.length - 1
        : nextIndex === -1
          ? requestedIndex
          : nextIndex,
    queue: [],
    nextSequence: 1,
    inFlightSequence: null,
    failedSequence: null,
    hasSaved: play.answers.length > 0,
    completion: "idle",
  });
}

export function ownerFlowReducer(state, action) {
  if (!state || typeof action !== "object" || action === null) return state;

  if (action.type === "choose") {
    if (state.phase !== "draft" || state.completion === "in-flight") {
      return state;
    }
    const card = state.pack.cards[state.currentIndex];
    if (
      !card ||
      action.cardId !== card.id ||
      (action.choice !== "a" && action.choice !== "b")
    ) {
      return state;
    }
    const answers = Object.freeze({
      ...state.answers,
      [card.id]: action.choice,
    });
    const nextIndex = firstUnanswered(
      state.pack.cards,
      answers,
      (state.currentIndex + 1) % state.pack.cards.length,
    );
    const currentIndex = nextIndex === -1 ? state.currentIndex : nextIndex;
    const operation = Object.freeze({
      sequence: state.nextSequence,
      cardId: card.id,
      choice: action.choice,
      currentPosition: nextIndex === -1 ? 10 : currentIndex + 1,
    });
    return freezeState({
      ...state,
      answers,
      currentIndex,
      queue: [...state.queue, operation],
      nextSequence: state.nextSequence + 1,
      completion: "idle",
    });
  }

  if (action.type === "previous") {
    if (state.phase !== "draft" || state.currentIndex === 0) return state;
    return freezeState({ ...state, currentIndex: state.currentIndex - 1 });
  }

  if (action.type === "save-started") {
    const head = state.queue[0];
    if (
      !head ||
      head.sequence !== action.sequence ||
      state.inFlightSequence !== null ||
      state.failedSequence !== null
    ) {
      return state;
    }
    return freezeState({ ...state, inFlightSequence: action.sequence });
  }

  if (action.type === "save-succeeded") {
    const head = state.queue[0];
    if (
      !head ||
      head.sequence !== action.sequence ||
      state.inFlightSequence !== action.sequence ||
      action.play.id !== state.play.id ||
      action.play.packSlug !== state.pack.slug ||
      action.play.packVersion !== state.pack.version
    ) {
      return state;
    }
    const queue = state.queue.slice(1);
    return freezeState({
      ...state,
      phase: action.play.status,
      play: action.play,
      answers: overlayAnswers(answerRecord(action.play.answers), queue),
      queue,
      inFlightSequence: null,
      failedSequence: null,
      hasSaved: true,
    });
  }

  if (action.type === "save-failed") {
    if (state.inFlightSequence !== action.sequence) return state;
    return freezeState({
      ...state,
      inFlightSequence: null,
      failedSequence: action.sequence,
    });
  }

  if (action.type === "retry-save") {
    if (state.failedSequence === null) return state;
    return freezeState({ ...state, failedSequence: null });
  }

  if (action.type === "completion-started") {
    if (!isOwnerFlowReadyToComplete(state)) return state;
    return freezeState({ ...state, completion: "in-flight" });
  }

  if (action.type === "completion-retry") {
    if (state.completion !== "retryable") return state;
    return freezeState({ ...state, completion: "idle" });
  }

  if (action.type === "completion-failed") {
    if (state.completion !== "in-flight") return state;
    return freezeState({ ...state, completion: "retryable" });
  }

  if (action.type === "completion-succeeded") {
    if (
      action.play.id !== state.play.id ||
      action.play.packSlug !== state.pack.slug ||
      action.play.packVersion !== state.pack.version ||
      action.play.status !== "completed"
    ) {
      return state;
    }
    return freezeState({
      ...state,
      phase: "completed",
      play: action.play,
      answers: answerRecord(action.play.answers),
      queue: [],
      inFlightSequence: null,
      failedSequence: null,
      hasSaved: true,
      completion: "completed",
    });
  }

  if (action.type === "incomplete-refreshed") {
    if (
      action.play.id !== state.play.id ||
      action.play.packSlug !== state.pack.slug ||
      action.play.packVersion !== state.pack.version ||
      action.play.status !== "draft"
    ) {
      return state;
    }
    const answers = answerRecord(action.play.answers);
    const nextIndex = firstUnanswered(
      state.pack.cards,
      answers,
      action.play.currentPosition - 1,
    );
    return freezeState({
      ...state,
      play: action.play,
      answers,
      currentIndex: nextIndex === -1 ? state.currentIndex : nextIndex,
      queue: [],
      inFlightSequence: null,
      failedSequence: null,
      hasSaved: action.play.answers.length > 0,
      completion: nextIndex === -1 ? "retryable" : "idle",
    });
  }

  return state;
}

export function isOwnerFlowReadyToComplete(state) {
  return (
    state.phase === "draft" &&
    state.completion === "idle" &&
    state.queue.length === 0 &&
    state.inFlightSequence === null &&
    state.failedSequence === null &&
    state.pack.cards.every((card) => Boolean(state.answers[card.id]))
  );
}

export function ownerSaveStatus(state) {
  if (state.failedSequence !== null) return "failed";
  if (state.queue.length > 0 || state.inFlightSequence !== null)
    return "saving";
  return state.hasSaved ? "saved" : "auto";
}
