import { notFound } from "next/navigation";

import { getPack } from "../packs";
import PackPlay from "./play";

export default async function PackPlayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();

  const pack = getPack((await params).slug);
  if (!pack) notFound();

  return <PackPlay key={pack.slug} pack={pack} />;
}
