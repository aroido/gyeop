import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relative) {
  const absolute = path.join(ROOT, relative);
  assert.ok(existsSync(absolute), `${relative} is required`);
  return readFileSync(absolute, "utf8");
}

function filesBelow(relative) {
  const absolute = path.join(ROOT, relative);
  if (!existsSync(absolute)) return [];
  const result = [];
  for (const entry of readdirSync(absolute)) {
    const candidate = path.join(absolute, entry);
    if (statSync(candidate).isDirectory()) {
      result.push(...filesBelow(path.relative(ROOT, candidate)));
    } else if (/\.(?:mjs|ts|tsx)$/.test(candidate)) {
      result.push(candidate);
    }
  }
  return result;
}

export function verifyVisitorResponse() {
  for (const file of [
    ...filesBelow("app/i"),
    ...filesBelow("lib/visitor-response"),
  ]) {
    const relative = path.relative(ROOT, file);
    const contents = readFileSync(file, "utf8");
    assert.doesNotMatch(
      contents,
      /\b(?:localStorage|sessionStorage|indexedDB|document\s*\.\s*cookie)\b/,
      `${relative} cannot persist a response credential`,
    );
    assert.doesNotMatch(
      contents,
      /console\s*\./,
      `${relative} cannot log response context`,
    );
  }

  const context = source("lib/visitor-response/visitor-context-core.mjs");
  assert.doesNotMatch(context, /from\s+["']node:/);
  for (const code of [
    "old_friend",
    "school_friend",
    "coworker",
    "romantic",
    "family",
    "online_friend",
    "social_follower",
    "other",
    "under_one_year",
    "one_to_three_years",
    "three_to_five_years",
    "five_to_ten_years",
    "ten_years_or_more",
    "not_sure",
  ]) {
    assert.match(context, new RegExp(`code: ["']${code}["']`));
  }
  assert.match(context, /Object\.freeze/);
  assert.match(context, /decodeVisitorResponseHttpState/);
  assert.match(context, /Object\.getOwnPropertySymbols/);

  const session = source("lib/visitor-response/visitor-session-core.mjs");
  assert.match(session, /__Host-gyeop-response/);
  assert.match(session, /gyeop-visitor-response-v1/);
  assert.match(session, /gyeop-response-start-v1/);
  assert.match(session, /randomBytes\(32\)/);
  assert.match(session, /HttpOnly/);
  assert.match(session, /SameSite=Lax/);
  assert.match(session, /Max-Age/);

  const routePath = "app/api/invites/[publicId]/responses/route.ts";
  const route = source(routePath);
  assert.match(route, /withPublicRequest\s*\(/);
  assert.match(route, /visitorResponseSchema/);
  assert.match(route, /maximumBodyBytes:\s*256/);
  assert.match(route, /privateNoStore:\s*true/);
  assert.match(route, /deriveResponseStartRateLimitKey/);
  assert.doesNotMatch(route, /runRateLimitedDomain/);
  const idCheck = route.indexOf("isSharePublicId(publicId)");
  const cookieParse = route.indexOf(
    "const cookie = parseVisitorResponseCookie",
  );
  const domain = route.indexOf("return visitorResponse");
  assert.ok(
    idCheck >= 0 && cookieParse > idCheck && domain > cookieParse,
    `${routePath} must validate path, then cookie, then domain`,
  );

  const client = source("lib/visitor-response/visitor-response-client.ts");
  for (const contract of [
    'credentials: "same-origin"',
    'cache: "no-store"',
    'intent: "resume"',
    'intent: "start"',
    "const flights = new Map",
    "response.status === 204",
    "response.status === 429",
  ]) {
    assert.ok(
      client.includes(contract),
      `missing client contract: ${contract}`,
    );
  }

  const entry = source("app/i/[publicId]/invite-entry.tsx");
  for (const contract of [
    "submitLatch",
    "RELATIONSHIP_OPTIONS.map",
    "KNOWN_SINCE_OPTIONS.map",
    "이 사람과 어떤 사이인가요?",
    "3장 답하러 가기",
    "응답을 시작했어요",
    "1:1 응답은 다음 단계에서 이어져요.",
  ]) {
    assert.ok(
      entry.includes(contract),
      `missing invite UI contract: ${contract}`,
    );
  }

  const migration = source(
    "supabase/migrations/20260718000600_visitor_response_session.sql",
  );
  for (const contract of [
    "create table public.visitor_responses",
    "alter table public.visitor_responses enable row level security",
    "create or replace function public.start_response",
    "'response_start'",
    "'relationship_selected'",
    "'visitor_response_started'",
    "visitor_response_id",
    "v_kind <> 'public'",
    "interval '24 hours'",
    "when unique_violation",
  ]) {
    assert.ok(
      migration.includes(contract),
      `missing migration contract: ${contract}`,
    );
  }
  assert.doesNotMatch(
    migration,
    /jsonb_build_object\([^;]*(?:session_token_hash|p_rate_limit_key)/s,
    "analytics and RPC JSON cannot expose session or rate hashes",
  );

  const live = source("tests/e2e/owner-play-live.spec.ts");
  assert.match(live, /trace:\s*"off"/);
  assert.match(live, /__Host-gyeop-response/);
  assert.match(live, /readVisitorResponseSummary/);
  return true;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  verifyVisitorResponse();
  console.log("Visitor response source verification passed.");
}
