import { redirect } from "next/navigation";

export default function LegacyOldFriendPlay() {
  redirect("/play/new?pack=old-friend");
}
