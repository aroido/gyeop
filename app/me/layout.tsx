import { redirect } from "next/navigation";

import { loadOwnerPublicProfileGate } from "@/lib/http/owner-public-profile";

export const dynamic = "force-dynamic";

export default async function OwnerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await loadOwnerPublicProfileGate();
  if (profile?.outcome === "incomplete") {
    redirect("/auth/complete-profile?returnTo=%2Fme");
  }
  return children;
}
