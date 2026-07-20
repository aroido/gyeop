import { cookies } from "next/headers";

import { OWNER_COOKIE_NAME } from "@/lib/owner-play/owner-play-session-core.mjs";

import BootstrapOwnerPlay from "./bootstrap";

const supportedPacks = new Set([
  "old-friend",
  "first-impression",
  "coworker",
  "honest-self",
]);

export default async function NewOwnerPlayPage({
  searchParams,
}: {
  searchParams: Promise<{
    pack?: string | string[];
    source?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const cookieStore = await cookies();
  const pack = query.pack;
  const entrySource =
    query.source === "same_pack_cta" ? "same_pack_cta" : "home";
  return (
    <BootstrapOwnerPlay
      pack={typeof pack === "string" && supportedPacks.has(pack) ? pack : null}
      entrySource={entrySource}
      requiresEligibility={
        !cookieStore.getAll().some(({ name }) => name === OWNER_COOKIE_NAME)
      }
    />
  );
}
