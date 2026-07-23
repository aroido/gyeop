import assert from "node:assert/strict";
import test from "node:test";

import {
  ANALYTICS_CONSENT_KEY,
  createAnalyticsPageView,
  isValidGaMeasurementId,
  normalizeAnalyticsPathname,
} from "../../lib/analytics/google-analytics-core.mjs";

test("accepts only exact uppercase GA4 measurement IDs", () => {
  for (const value of ["G-TEST123", "G-A1", "G-0"])
    assert.equal(isValidGaMeasurementId(value), true, value);
  for (const value of [
    undefined,
    null,
    "",
    " G-TEST123",
    "G-TEST123 ",
    "g-TEST123",
    "G-test123",
    "UA-TEST123",
    "G-TEST_123",
  ]) {
    assert.equal(isValidGaMeasurementId(value), false, String(value));
  }
  assert.equal(ANALYTICS_CONSENT_KEY, "gyeop:analytics-consent:v1");
});

test("normalizes every reviewed static and dynamic page route", () => {
  const fixtures = [
    ["/", "/", "겹 · 홈"],
    ["/play/new", "/play/start", "겹 · 질문팩 시작"],
    ["/play/old-friend", "/play/start", "겹 · 질문팩 시작"],
    ["/play/play-secret", "/play/:playId", "겹 · 내 답변"],
    ["/i/invite-secret", "/i/:publicId", "겹 · 친구 초대"],
    ["/auth/sign-in", "/auth/sign-in", "겹 · 로그인"],
    ["/auth/complete-profile", "/auth/complete-profile", "겹 · 가입 완료"],
    ["/me", "/me", "겹 · 내 프로필"],
    ["/me/plays/play-secret", "/me/plays/:playId", "겹 · 질문팩 관리"],
    ["/me/profile/play-secret", "/me/profile/:playId", "겹 · 프로필 보기"],
    ["/responses/manage", "/responses/manage", "겹 · 답변 관리"],
    ["/privacy", "/privacy", "겹 · 개인정보와 문의"],
  ];
  for (const [pathname, routeClass, pageTitle] of fixtures) {
    assert.deepEqual(normalizeAnalyticsPathname(pathname), {
      routeClass,
      pageTitle,
    });
  }
});

test("uses exact segment matching and sends unknown or malformed paths to other", () => {
  for (const pathname of [
    "/play",
    "/play/",
    "/play/a/extra",
    "/iplayer/a",
    "/i",
    "/i/",
    "/i/a/extra",
    "/me/plays",
    "/me/plays/a/extra",
    "/me/profile",
    "/api/plays/a",
    "/privacy/extra",
    "/play/a?secret=query",
    "not-a-path",
    undefined,
  ]) {
    assert.deepEqual(normalizeAnalyticsPathname(pathname), {
      routeClass: "/other",
      pageTitle: "겹 · 기타 화면",
    });
  }
});

test("creates the exact sanitized page-view allowlist", () => {
  const sentinels = [
    "dynamic-play-secret",
    "nickname-secret",
    "email@example.com",
    "?campaign=secret",
    "#fragment-secret",
  ];
  const payload = createAnalyticsPageView(
    "https://gyeop.example/some/server/path?query=secret",
    "/play/dynamic-play-secret",
  );
  assert.deepEqual(payload, {
    page_location: "https://gyeop.example/play/:playId",
    page_title: "겹 · 내 답변",
    page_referrer: "",
  });
  assert.deepEqual(Object.keys(payload).sort(), [
    "page_location",
    "page_referrer",
    "page_title",
  ]);
  for (const sentinel of sentinels) {
    assert.doesNotMatch(
      JSON.stringify(payload),
      new RegExp(sentinel.replaceAll("?", "\\?")),
    );
  }
  assert.throws(
    () => createAnalyticsPageView("file:///tmp/gyeop", "/"),
    /http or https/,
  );
});
