"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_CONSENT_KEY,
  createAnalyticsPageView,
  isValidGaMeasurementId,
} from "@/lib/analytics/google-analytics-core.mjs";

import styles from "./analytics-consent.module.css";

type Consent = "pending" | "granted" | "denied";
type GtagCommand = IArguments;

type AnalyticsRuntime = {
  measurementId: string;
  lastPathname: string;
};

declare global {
  interface Window {
    dataLayer?: GtagCommand[];
    gtag?: (...args: unknown[]) => void;
    __gyeopAnalytics?: AnalyticsRuntime;
    __gyeopAnalyticsConsentOverride?: Consent;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

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

function writeConsent(value: Exclude<Consent, "pending">) {
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
    delete window.__gyeopAnalyticsConsentOverride;
    return true;
  } catch {
    window.__gyeopAnalyticsConsentOverride = "pending";
    return false;
  }
}

function consentParameters(analyticsStorage: "granted" | "denied") {
  return {
    analytics_storage: analyticsStorage,
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  } as const;
}

function gtag() {
  // Google gtag.js consumes the Arguments object pushed by this exact shim.
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer?.push(arguments);
}

function pageView(pathname: string) {
  return createAnalyticsPageView(window.location.origin, pathname);
}

function analyticsConfig(payload: ReturnType<typeof pageView>) {
  return {
    ...payload,
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ignore_referrer: true,
    cookie_domain: "none",
    cookie_expires: 5_184_000,
    cookie_update: false,
  } as const;
}

function queuePageView(measurementId: string, pathname: string) {
  const payload = pageView(pathname);
  window.gtag?.("set", payload);
  window.gtag?.("config", measurementId, {
    ...analyticsConfig(payload),
    update: true,
  });
  window.gtag?.("event", "page_view", payload);
}

function startAnalytics(measurementId: string, pathname: string) {
  const runtime = window.__gyeopAnalytics;
  if (runtime?.measurementId === measurementId) {
    if (runtime.lastPathname !== pathname) {
      queuePageView(measurementId, pathname);
      runtime.lastPathname = pathname;
    }
    return;
  }

  window[`ga-disable-${measurementId}`] = false;
  window.dataLayer = [];
  window.gtag = gtag;

  const payload = pageView(pathname);
  window.gtag("consent", "default", consentParameters("granted"));
  window.gtag("js", new Date());
  window.gtag("set", payload);
  window.gtag("config", measurementId, analyticsConfig(payload));
  window.gtag("event", "page_view", payload);

  window.__gyeopAnalytics = { measurementId, lastPathname: pathname };

  const script = document.createElement("script");
  script.async = true;
  script.dataset.gyeopAnalytics = "true";
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(script);
}

function analyticsCookieNames() {
  return document.cookie
    .split(";")
    .map((cookie) => cookie.trim().split("=", 1)[0])
    .filter((name) => name === "_ga" || name.startsWith("_ga_"));
}

function clearAnalyticsCookies() {
  const hostParts = window.location.hostname.split(".");
  const domains = hostParts.map((_, index) => hostParts.slice(index).join("."));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  for (const name of analyticsCookieNames()) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    for (const domain of domains) {
      document.cookie = `${name}=; Path=/; Domain=${domain}; Max-Age=0; SameSite=Lax${secure}`;
      document.cookie = `${name}=; Path=/; Domain=.${domain}; Max-Age=0; SameSite=Lax${secure}`;
    }
  }
}

function stopAnalytics(measurementId: string, reload = true) {
  window[`ga-disable-${measurementId}`] = true;
  window.gtag?.("consent", "update", consentParameters("denied"));
  document
    .querySelectorAll<HTMLScriptElement>("script[data-gyeop-analytics]")
    .forEach((script) => script.remove());
  clearAnalyticsCookies();
  delete window.gtag;
  delete window.dataLayer;
  delete window.__gyeopAnalytics;
  if (reload) window.location.reload();
}

export function AnalyticsConsent({
  measurementId,
}: {
  measurementId?: string;
}) {
  const pathname = usePathname();
  const enabled = isValidGaMeasurementId(measurementId);
  const configuredMeasurementId =
    enabled && typeof measurementId === "string" ? measurementId : null;
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
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

  useEffect(() => {
    if (!enabled || !ready || !configuredMeasurementId) return;
    if (consent === "granted") {
      startAnalytics(configuredMeasurementId, pathname);
    } else if (window.__gyeopAnalytics) {
      stopAnalytics(configuredMeasurementId);
    }
  }, [configuredMeasurementId, consent, enabled, pathname, ready]);

  useEffect(() => {
    if (!enabled) return;
    const onConsentChange = (event: Event) => {
      const detail = (
        event as CustomEvent<{ consent?: Consent; revoke?: boolean }>
      ).detail;
      const next = detail?.consent;
      if (
        next !== "granted" &&
        detail?.revoke &&
        configuredMeasurementId &&
        window.__gyeopAnalytics
      ) {
        stopAnalytics(configuredMeasurementId, next !== "pending");
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ANALYTICS_CONSENT_KEY) return;
      const next = readConsent();
      if (
        next !== "granted" &&
        window.__gyeopAnalytics &&
        configuredMeasurementId
      ) {
        stopAnalytics(configuredMeasurementId);
      }
    };
    window.addEventListener(ANALYTICS_CONSENT_EVENT, onConsentChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, onConsentChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [configuredMeasurementId, enabled]);

  useEffect(() => {
    const pending = enabled && ready && consent === "pending";
    if (pending) document.body.dataset.analyticsConsent = "pending";
    else delete document.body.dataset.analyticsConsent;
    return () => {
      delete document.body.dataset.analyticsConsent;
    };
  }, [consent, enabled, ready]);

  const choose = useCallback((next: Exclude<Consent, "pending">) => {
    if (!writeConsent(next)) {
      window.dispatchEvent(
        new CustomEvent(ANALYTICS_CONSENT_EVENT, {
          detail: { consent: "pending", revoke: true },
        }),
      );
      return;
    }
    window.dispatchEvent(
      new CustomEvent(ANALYTICS_CONSENT_EVENT, {
        detail: { consent: next, revoke: false },
      }),
    );
  }, []);

  if (!enabled || !ready || consent !== "pending") return null;

  return (
    <aside
      aria-describedby="analytics-consent-description"
      aria-labelledby="analytics-consent-title"
      className={styles.banner}
    >
      <h2 id="analytics-consent-title">방문 통계를 선택해 주세요</h2>
      <p id="analytics-consent-description">
        서비스 개선을 위해 Google Analytics로 익명화한 화면 종류 방문 통계를 볼
        수 있어요. 허용하면 분석 쿠키·세션 정보와 기기·브라우저·대략적 지역
        정보가 처리될 수 있고, 쿠키는 최초 생성부터 최대 60일 유지돼요.
      </p>
      <div className={styles.actions}>
        <button type="button" onClick={() => choose("granted")}>
          분석 허용
        </button>
        <button type="button" onClick={() => choose("denied")}>
          허용하지 않음
        </button>
      </div>
      <Link href="/privacy">보관기간과 분석 설정 자세히 보기</Link>
    </aside>
  );
}
