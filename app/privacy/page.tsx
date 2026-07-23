import type { Metadata } from "next";
import Link from "next/link";

import { isValidGaMeasurementId } from "@/lib/analytics/google-analytics-core.mjs";

import { AnalyticsPreference } from "./analytics-preference";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "개인정보와 문의 · 겹",
};

export default function PrivacyPage() {
  return (
    <main className={styles.shell}>
      <article className={styles.card}>
        <p className={styles.brand}>겹 · 이용 안내</p>
        <h1>개인정보와 문의</h1>
        <p>
          겹은 연령이나 국가 확인 없이 참여할 수 있는 질문팩 서비스예요.
          생년월일, 신분증, 보호자 정보는 받지 않아요.
        </p>
        <h2>질문팩과 삭제</h2>
        <p>
          모든 질문팩은 전체 연령이 답할 수 있는 내용만 제공해요. 답변 삭제는
          관리 링크에서 직접 처리할 수 있어요. 안전 관련 공개 문의 채널은 공개
          모집 전에 안내할게요.
        </p>
        <h2>질문팩 저장</h2>
        <p>
          질문팩은 가입 없이 시작할 수 있어요. 공유하기 전에 이메일 로그인으로
          내 질문팩을 계정에 저장할 수 있고, 이메일은 친구 화면이나 질문 결과에
          표시하지 않아요.
        </p>
        <h2>선택형 방문 통계</h2>
        <p>
          이 브라우저에서 명시적으로 허용한 경우에만 Google Analytics로 동적
          식별자를 제거한 화면 종류 방문 통계를 보내요. Google은 분석
          쿠키·client/session 식별자와 기기·브라우저·대략적 지역 정보를 처리할
          수 있어요. 닉네임, 이메일, 답변, 관계, 실제 질문팩·초대 식별자는
          보내지 않아요.
        </p>
        <p className={styles.detail}>
          분석 쿠키는 최초 생성부터 최대 60일이며 새 방문으로 연장하지 않아요.
          Google의 user/event 데이터 보관 설정은 별도로 2개월이고, 이 기간은
          표준 집계 보고서에는 적용되지 않을 수 있어요. 아래 선택은 이
          브라우저의 localStorage에 계속 남으며 계정이나 다른 브라우저와
          동기화되지 않아요.
        </p>
        <AnalyticsPreference
          enabled={isValidGaMeasurementId(
            process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
          )}
        />
        <h2>문의</h2>
        <p>
          문의 접수 채널을 준비 중이에요. 공개 모집 전 이 페이지에 안내할게요.
        </p>
        <Link href="/">홈으로</Link>
      </article>
    </main>
  );
}
