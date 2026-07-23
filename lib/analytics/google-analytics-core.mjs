export const ANALYTICS_CONSENT_KEY = "gyeop:analytics-consent:v1";
export const ANALYTICS_CONSENT_EVENT = "gyeop:analytics-consent-change";

export const GOOGLE_ANALYTICS_SCRIPT_SOURCE =
  "https://www.googletagmanager.com";
export const GOOGLE_ANALYTICS_COLLECT_SOURCES = Object.freeze([
  "https://www.google-analytics.com",
  "https://region1.google-analytics.com",
]);

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

const STATIC_ROUTES = new Map([
  ["/", ["/", "겹 · 홈"]],
  ["/play/new", ["/play/start", "겹 · 질문팩 시작"]],
  ["/play/old-friend", ["/play/start", "겹 · 질문팩 시작"]],
  ["/auth/sign-in", ["/auth/sign-in", "겹 · 로그인"]],
  ["/auth/complete-profile", ["/auth/complete-profile", "겹 · 가입 완료"]],
  ["/me", ["/me", "겹 · 내 프로필"]],
  ["/responses/manage", ["/responses/manage", "겹 · 답변 관리"]],
  ["/privacy", ["/privacy", "겹 · 개인정보와 문의"]],
]);

const OTHER_ROUTE = Object.freeze({
  routeClass: "/other",
  pageTitle: "겹 · 기타 화면",
});

export function isValidGaMeasurementId(value) {
  return typeof value === "string" && MEASUREMENT_ID_PATTERN.test(value);
}

export function normalizeAnalyticsPathname(pathname) {
  if (
    typeof pathname !== "string" ||
    !pathname.startsWith("/") ||
    pathname.includes("?") ||
    pathname.includes("#")
  ) {
    return OTHER_ROUTE;
  }

  const staticRoute = STATIC_ROUTES.get(pathname);
  if (staticRoute) {
    return Object.freeze({
      routeClass: staticRoute[0],
      pageTitle: staticRoute[1],
    });
  }

  const segments = pathname.split("/");
  if (segments.length === 3 && segments[1] === "play" && segments[2]) {
    return Object.freeze({
      routeClass: "/play/:playId",
      pageTitle: "겹 · 내 답변",
    });
  }
  if (segments.length === 3 && segments[1] === "i" && segments[2]) {
    return Object.freeze({
      routeClass: "/i/:publicId",
      pageTitle: "겹 · 친구 초대",
    });
  }
  if (
    segments.length === 4 &&
    segments[1] === "me" &&
    segments[2] === "plays" &&
    segments[3]
  ) {
    return Object.freeze({
      routeClass: "/me/plays/:playId",
      pageTitle: "겹 · 질문팩 관리",
    });
  }
  if (
    segments.length === 4 &&
    segments[1] === "me" &&
    segments[2] === "profile" &&
    segments[3]
  ) {
    return Object.freeze({
      routeClass: "/me/profile/:playId",
      pageTitle: "겹 · 프로필 보기",
    });
  }

  return OTHER_ROUTE;
}

export function createAnalyticsPageView(origin, pathname) {
  const url = new URL(origin);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Analytics origin must use http or https");
  }
  const { routeClass, pageTitle } = normalizeAnalyticsPathname(pathname);
  return Object.freeze({
    page_location: `${url.origin}${routeClass}`,
    page_title: pageTitle,
    page_referrer: "",
  });
}
