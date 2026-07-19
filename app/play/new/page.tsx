import BootstrapOwnerPlay from "./bootstrap";

export default async function NewOwnerPlayPage({
  searchParams,
}: {
  searchParams: Promise<{
    pack?: string | string[];
    source?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const pack = query.pack;
  const entrySource =
    query.source === "same_pack_cta" ? "same_pack_cta" : "home";
  return (
    <BootstrapOwnerPlay
      pack={pack === "old-friend" ? pack : null}
      entrySource={entrySource}
    />
  );
}
