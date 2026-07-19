const relationshipLabels = Object.freeze(
  Object.assign(Object.create(null) as Record<string, string>, {
    old_friend: "오래된 친구",
    new_connection: "새로 알게 된 사이",
    coworker: "직장 동료",
    close_relationship: "가까운 사이",
  }),
);

const sensitivityLabels = Object.freeze(
  Object.assign(Object.create(null) as Record<string, string>, {
    low: "낮은 민감도",
    medium: "중간 민감도",
    high: "높은 민감도",
  }),
);

function requiredLabel(
  registry: Readonly<Record<string, string>>,
  code: string,
) {
  if (!Object.prototype.hasOwnProperty.call(registry, code)) {
    throw new Error("Unknown pack label code");
  }
  return registry[code];
}

export function relationshipLabel(code: string) {
  return requiredLabel(relationshipLabels, code);
}

export function sensitivityLabel(code: string) {
  return requiredLabel(sensitivityLabels, code);
}
