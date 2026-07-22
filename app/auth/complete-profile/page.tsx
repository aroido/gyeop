import { redirect } from "next/navigation";

import { parseOwnerReturnTo } from "@/lib/auth/owner-claim-context-core.mjs";
import { loadOwnerPublicProfileGate } from "@/lib/http/owner-public-profile";

import CompleteProfileForm from "./complete-profile-form";
import styles from "./complete-profile.module.css";

export const dynamic = "force-dynamic";

export default async function CompleteProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const query = await searchParams;
  let returnTo = "/me";
  try {
    returnTo = parseOwnerReturnTo(
      typeof query.returnTo === "string" ? query.returnTo : "/me",
    );
  } catch {
    // Invalid external targets never leave the private owner area.
  }

  const profile = await loadOwnerPublicProfileGate();
  if (profile === null) redirect("/auth/sign-in?returnTo=%2Fme");
  if (profile.outcome === "complete") redirect(returnTo);

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="profile-title">
        <p className={styles.brand}>겹 · 프로필 설정</p>
        <h1 id="profile-title">초대장에 쓸 이름을 알려 주세요</h1>
        <p className={styles.lead}>
          친구가 링크를 열기 전에 닉네임을 볼 수 있어요. Google 계정 이름은
          공개하지 않아요.
        </p>
        <CompleteProfileForm returnTo={returnTo} />
      </section>
    </main>
  );
}
