import { notFound } from "next/navigation";

import OldFriendPlay from "./play";

export default function OldFriendPlayPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return <OldFriendPlay />;
}
