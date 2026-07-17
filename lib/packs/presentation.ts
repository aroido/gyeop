import type { CSSProperties } from "react";

export type ShareKind = "public" | "one_to_one";

export type PackPresentation = Readonly<{
  moodLabel: string;
  estimatedMinutes: number;
  defaultShareKind: ShareKind;
  cover: Readonly<{
    recipe: "old-friend-card-v1";
    style: Readonly<CSSProperties>;
  }>;
}>;

const oldFriendStyle = Object.freeze({
  background: "#dfff00",
  color: "#050505",
  boxShadow: "0.35rem 0.35rem 0 #315cff",
  transform: "rotate(-0.7deg)",
}) satisfies Readonly<CSSProperties>;

const oldFriend = Object.freeze({
  moodLabel: "따뜻한 회상",
  estimatedMinutes: 2,
  defaultShareKind: "public",
  cover: Object.freeze({
    recipe: "old-friend-card-v1",
    style: oldFriendStyle,
  }),
}) satisfies PackPresentation;

const presentations = Object.freeze(
  Object.assign(Object.create(null) as Record<string, PackPresentation>, {
    "old-friend": oldFriend,
  }),
);

export function getPackPresentation(slug: string): PackPresentation {
  if (!Object.prototype.hasOwnProperty.call(presentations, slug)) {
    throw new Error("Unknown pack presentation");
  }
  return presentations[slug];
}
