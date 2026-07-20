import type { CSSProperties } from "react";

export type ShareKind = "public" | "one_to_one";

export type PackPresentation = Readonly<{
  moodLabel: string;
  estimatedMinutes: number;
  defaultShareKind: ShareKind;
  cover: Readonly<{
    recipe:
      | "old-friend-card-v1"
      | "first-impression-card-v1"
      | "coworker-card-v1"
      | "honest-self-card-v1";
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

const firstImpression = Object.freeze({
  moodLabel: "가벼운 첫 만남",
  estimatedMinutes: 2,
  defaultShareKind: "public",
  cover: Object.freeze({
    recipe: "first-impression-card-v1",
    style: Object.freeze({
      background: "#315cff",
      color: "#ffffff",
      boxShadow: "0.35rem 0.35rem 0 #dfff00",
      transform: "rotate(0.6deg)",
    }),
  }),
}) satisfies PackPresentation;

const coworker = Object.freeze({
  moodLabel: "담백한 관찰",
  estimatedMinutes: 2,
  defaultShareKind: "public",
  cover: Object.freeze({
    recipe: "coworker-card-v1",
    style: Object.freeze({
      background: "#ff513f",
      color: "#050505",
      boxShadow: "0.35rem 0.35rem 0 #050505",
      transform: "rotate(-0.5deg)",
    }),
  }),
}) satisfies PackPresentation;

const honestSelf = Object.freeze({
  moodLabel: "차분한 솔직함",
  estimatedMinutes: 2,
  defaultShareKind: "one_to_one",
  cover: Object.freeze({
    recipe: "honest-self-card-v1",
    style: Object.freeze({
      background: "#121212",
      color: "#ffffff",
      boxShadow: "0.35rem 0.35rem 0 #dfff00",
      transform: "rotate(0.4deg)",
    }),
  }),
}) satisfies PackPresentation;

const presentations = Object.freeze(
  Object.assign(Object.create(null) as Record<string, PackPresentation>, {
    "old-friend": oldFriend,
    "first-impression": firstImpression,
    coworker,
    "honest-self": honestSelf,
  }),
);

export function getPackPresentation(slug: string): PackPresentation {
  if (!Object.prototype.hasOwnProperty.call(presentations, slug)) {
    throw new Error("Unknown pack presentation");
  }
  return presentations[slug];
}
