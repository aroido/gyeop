export function choiceOrder(ordinal, optionA, optionB) {
  if (
    !Number.isSafeInteger(ordinal) ||
    ordinal < 1 ||
    typeof optionA !== "string" ||
    typeof optionB !== "string"
  ) {
    throw new Error("Invalid choice order");
  }
  const a = Object.freeze({ choice: "a", label: optionA });
  const b = Object.freeze({ choice: "b", label: optionB });
  return Object.freeze(ordinal % 2 === 1 ? [a, b] : [b, a]);
}

export function visitorChoiceOrdinal(stage, position) {
  if (
    (stage !== "required" && stage !== "optional") ||
    !Number.isSafeInteger(position) ||
    position < 1 ||
    position > (stage === "required" ? 3 : 2)
  ) {
    throw new Error("Invalid visitor choice ordinal");
  }
  return stage === "required" ? position : 3 + position;
}
