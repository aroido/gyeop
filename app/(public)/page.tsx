import OldFriendPlay from "../play/old-friend/play";

export default function Home() {
  return (
    <OldFriendPlay
      disabled={process.env.NODE_ENV !== "development"}
      skipOpening
    />
  );
}
