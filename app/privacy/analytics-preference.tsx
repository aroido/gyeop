"use client";

import { useSyncExternalStore } from "react";

import {
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_CONSENT_KEY,
} from "@/lib/analytics/google-analytics-core.mjs";

import styles from "./page.module.css";

type Consent = "pending" | "granted" | "denied";

function readConsent(): Consent {
  if (window.__gyeopAnalyticsConsentOverride) {
    return window.__gyeopAnalyticsConsentOverride;
  }
  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : "pending";
  } catch {
    return "pending";
  }
}

export function AnalyticsPreference({ enabled }: { enabled: boolean }) {
  const consent = useSyncExternalStore(
    (onStoreChange) => {
      if (!enabled) return () => {};
      window.addEventListener(ANALYTICS_CONSENT_EVENT, onStoreChange);
      window.addEventListener("storage", onStoreChange);
      return () => {
        window.removeEventListener(ANALYTICS_CONSENT_EVENT, onStoreChange);
        window.removeEventListener("storage", onStoreChange);
      };
    },
    () => (enabled ? readConsent() : "pending"),
    () => "pending",
  );

  function choose(next: Exclude<Consent, "pending">) {
    try {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, next);
      delete window.__gyeopAnalyticsConsentOverride;
    } catch {
      window.__gyeopAnalyticsConsentOverride = "pending";
      window.dispatchEvent(
        new CustomEvent(ANALYTICS_CONSENT_EVENT, {
          detail: { consent: "pending", revoke: true },
        }),
      );
      return;
    }
    window.dispatchEvent(
      new CustomEvent(ANALYTICS_CONSENT_EVENT, {
        detail: { consent: next, revoke: next === "denied" },
      }),
    );
  }

  if (!enabled) {
    return (
      <section
        className={styles.preference}
        aria-labelledby="analytics-setting"
      >
        <h2 id="analytics-setting">분석 설정</h2>
        <p>현재 서비스 빌드에서는 Google Analytics가 비활성화되어 있어요.</p>
      </section>
    );
  }

  const status =
    consent === "granted"
      ? "현재 이 브라우저에서 분석을 허용했어요."
      : consent === "denied"
        ? "현재 이 브라우저에서 분석을 허용하지 않았어요."
        : "아직 이 브라우저에서 분석 여부를 선택하지 않았어요.";

  return (
    <section className={styles.preference} aria-labelledby="analytics-setting">
      <h2 id="analytics-setting">분석 설정</h2>
      <p aria-live="polite">{status}</p>
      <div className={styles.preferenceActions}>
        <button
          disabled={consent === "granted"}
          type="button"
          onClick={() => choose("granted")}
        >
          분석 허용
        </button>
        <button
          disabled={consent !== "granted"}
          type="button"
          onClick={() => choose("denied")}
        >
          분석 중단
        </button>
      </div>
    </section>
  );
}
