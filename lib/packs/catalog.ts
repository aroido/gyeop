import afterWork from "@/content/packs/after-work-v1.json";
import algorithmMirror from "@/content/packs/algorithm-mirror-v1.json";
import cameraRoll from "@/content/packs/camera-roll-v1.json";
import commentSection from "@/content/packs/comment-section-v1.json";
import complimentReceipt from "@/content/packs/compliment-receipt-v1.json";
import coworker from "@/content/packs/coworker-v1.json";
import deadlineMode from "@/content/packs/deadline-mode-v1.json";
import decisionSpiral from "@/content/packs/decision-spiral-v1.json";
import emojiSubtitles from "@/content/packs/emoji-subtitles-v1.json";
import firstImpression from "@/content/packs/first-impression-v1.json";
import friendFusion from "@/content/packs/friend-fusion-v1.json";
import groupChatRole from "@/content/packs/group-chat-role-v1.json";
import honestSelf from "@/content/packs/honest-self-v1.json";
import laughTrack from "@/content/packs/laugh-track-v1.json";
import oldFriend from "@/content/packs/old-friend-v1.json";
import replyTemperature from "@/content/packs/reply-temperature-v1.json";
import roomTemperature from "@/content/packs/room-temperature-v1.json";
import smallLuxury from "@/content/packs/small-luxury-v1.json";
import snackPersonality from "@/content/packs/snack-personality-v1.json";
import socialBattery from "@/content/packs/social-battery-v1.json";
import spontaneousPlan from "@/content/packs/spontaneous-plan-v1.json";
import tinyRoutine from "@/content/packs/tiny-routine-v1.json";
import tripChemistry from "@/content/packs/trip-chemistry-v1.json";
import weekendEscape from "@/content/packs/weekend-escape-v1.json";

export const packManifests = Object.freeze([
  oldFriend,
  firstImpression,
  coworker,
  honestSelf,
  afterWork,
  algorithmMirror,
  cameraRoll,
  commentSection,
  complimentReceipt,
  deadlineMode,
  decisionSpiral,
  emojiSubtitles,
  friendFusion,
  groupChatRole,
  laughTrack,
  replyTemperature,
  roomTemperature,
  smallLuxury,
  snackPersonality,
  socialBattery,
  spontaneousPlan,
  tinyRoutine,
  tripChemistry,
  weekendEscape,
]);

export function findPackManifest(slug: string) {
  return packManifests.find((pack) => pack.slug === slug) ?? null;
}
