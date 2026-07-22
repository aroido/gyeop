import afterWork from "@/content/packs/after-work-v2.json";
import afterWorkV1 from "@/content/packs/after-work-v1.json";
import algorithmMirror from "@/content/packs/algorithm-mirror-v2.json";
import algorithmMirrorV1 from "@/content/packs/algorithm-mirror-v1.json";
import cameraRoll from "@/content/packs/camera-roll-v2.json";
import cameraRollV1 from "@/content/packs/camera-roll-v1.json";
import commentSection from "@/content/packs/comment-section-v2.json";
import commentSectionV1 from "@/content/packs/comment-section-v1.json";
import complimentReceipt from "@/content/packs/compliment-receipt-v2.json";
import complimentReceiptV1 from "@/content/packs/compliment-receipt-v1.json";
import coworker from "@/content/packs/coworker-v1.json";
import deadlineMode from "@/content/packs/deadline-mode-v1.json";
import decisionSpiral from "@/content/packs/decision-spiral-v2.json";
import decisionSpiralV1 from "@/content/packs/decision-spiral-v1.json";
import emojiSubtitles from "@/content/packs/emoji-subtitles-v2.json";
import emojiSubtitlesV1 from "@/content/packs/emoji-subtitles-v1.json";
import firstImpression from "@/content/packs/first-impression-v2.json";
import firstImpressionV1 from "@/content/packs/first-impression-v1.json";
import friendFusion from "@/content/packs/friend-fusion-v2.json";
import friendFusionV1 from "@/content/packs/friend-fusion-v1.json";
import groupChatRole from "@/content/packs/group-chat-role-v2.json";
import groupChatRoleV1 from "@/content/packs/group-chat-role-v1.json";
import honestSelf from "@/content/packs/honest-self-v2.json";
import honestSelfV1 from "@/content/packs/honest-self-v1.json";
import laughTrack from "@/content/packs/laugh-track-v1.json";
import oldFriend from "@/content/packs/old-friend-v2.json";
import oldFriendV1 from "@/content/packs/old-friend-v1.json";
import replyTemperature from "@/content/packs/reply-temperature-v2.json";
import replyTemperatureV1 from "@/content/packs/reply-temperature-v1.json";
import roomTemperature from "@/content/packs/room-temperature-v2.json";
import roomTemperatureV1 from "@/content/packs/room-temperature-v1.json";
import smallLuxury from "@/content/packs/small-luxury-v2.json";
import smallLuxuryV1 from "@/content/packs/small-luxury-v1.json";
import snackPersonality from "@/content/packs/snack-personality-v2.json";
import snackPersonalityV1 from "@/content/packs/snack-personality-v1.json";
import socialBattery from "@/content/packs/social-battery-v2.json";
import socialBatteryV1 from "@/content/packs/social-battery-v1.json";
import spontaneousPlan from "@/content/packs/spontaneous-plan-v2.json";
import spontaneousPlanV1 from "@/content/packs/spontaneous-plan-v1.json";
import tinyRoutine from "@/content/packs/tiny-routine-v2.json";
import tinyRoutineV1 from "@/content/packs/tiny-routine-v1.json";
import tripChemistry from "@/content/packs/trip-chemistry-v2.json";
import tripChemistryV1 from "@/content/packs/trip-chemistry-v1.json";
import weekendEscape from "@/content/packs/weekend-escape-v2.json";
import weekendEscapeV1 from "@/content/packs/weekend-escape-v1.json";

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

const packManifestHistory = Object.freeze([
  afterWorkV1,
  afterWork,
  algorithmMirrorV1,
  algorithmMirror,
  cameraRollV1,
  cameraRoll,
  commentSectionV1,
  commentSection,
  complimentReceiptV1,
  complimentReceipt,
  coworker,
  deadlineMode,
  decisionSpiralV1,
  decisionSpiral,
  emojiSubtitlesV1,
  emojiSubtitles,
  firstImpressionV1,
  firstImpression,
  friendFusionV1,
  friendFusion,
  groupChatRoleV1,
  groupChatRole,
  honestSelfV1,
  honestSelf,
  laughTrack,
  oldFriendV1,
  oldFriend,
  replyTemperatureV1,
  replyTemperature,
  roomTemperatureV1,
  roomTemperature,
  smallLuxuryV1,
  smallLuxury,
  snackPersonalityV1,
  snackPersonality,
  socialBatteryV1,
  socialBattery,
  spontaneousPlanV1,
  spontaneousPlan,
  tinyRoutineV1,
  tinyRoutine,
  tripChemistryV1,
  tripChemistry,
  weekendEscapeV1,
  weekendEscape,
]);

export function findPackManifestVersion(slug: string, version: string) {
  return (
    packManifestHistory.find(
      (pack) => pack.slug === slug && pack.version === version,
    ) ?? null
  );
}
