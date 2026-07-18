import BootstrapOwnerPlay from "./bootstrap";

export default async function NewOwnerPlayPage({
  searchParams,
}: {
  searchParams: Promise<{ pack?: string | string[] }>;
}) {
  const pack = (await searchParams).pack;
  return <BootstrapOwnerPlay pack={pack === "old-friend" ? pack : null} />;
}
