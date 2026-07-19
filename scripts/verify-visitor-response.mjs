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
  assert.match(context, /decodeVisitorAssignment/);
  assert.match(context, /value\.assignments\.length !== 3/);
  assert.match(context, /value\.assignments\.length !== 5/);
  assert.match(context, /assignment\.position !== index \+ 1/);
  assert.match(context, /new Set\(assignments\.map/);
  assert.match(context, /Object\.getOwnPropertySymbols/);

  const session = source("lib/visitor-response/visitor-session-core.mjs");
  assert.match(session, /__Host-gyeop-response/);
  assert.match(session, /gyeop-visitor-response-v1/);
  assert.match(session, /gyeop-response-start-v1/);
  assert.match(session, /gyeop-response-answer-save-v1/);
  assert.match(session, /gyeop-response-submit-v1/);
  assert.match(session, /gyeop-visitor-management-v1/);
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
  assert.match(route, /eligibilityConfirmed === true/);
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
  const httpAdapter = source("lib/http/visitor-responses.ts");
  assert.match(
    httpAdapter,
    /errorResponse\("RATE_LIMITED",\s*retryAfterSeconds\)/,
  );

  const client = source("lib/visitor-response/visitor-response-client.ts");
  assert.match(client, /eligibilityConfirmed: true/);
  for (const contract of [
    'credentials: "same-origin"',
    'cache: "no-store"',
    'intent: "resume"',
    'intent: "start"',
    "const flights = new Map",
    "response.status === 204",
    "response.status === 429",
    "saveVisitorAnswer",
    "submitVisitorAnswers",
    "continueVisitorResponse",
    "/continue",
    "recordVisitorEvent",
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
    "queue.current.push",
    "친구 답과 맞춰보는 중…",
    "3장 비교 완료",
    "2장 더 답하기",
    "2장 이어서 답하기",
    "2장 추가 비교 완료",
    "내 관리 링크 복사",
    "encodeURIComponent(response.packSlug)",
    "&source=same_pack_cta",
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

  const assignmentMigration = source(
    "supabase/migrations/20260718000700_visitor_required_assignments.sql",
  );
  for (const contract of [
    "create table public.visitor_assignments",
    "visitor_responses_id_pack_version_key",
    "create or replace function private.assign_required_response_cards",
    "gyeop-required-assignment-v1",
    "prior_response.status = 'submitted'",
    "prior_link.pack_play_id = p_pack_play_id",
    "card.submitted_sample_count",
    "card.tie_hash",
    "perform private.assign_required_response_cards",
    "v_kind not in ('public', 'one_to_one')",
    "'visitor_responses_pkey'",
    "'visitor_responses_id_pack_version_key'",
    "'visitor_responses_session_token_hash_key'",
  ]) {
    assert.ok(
      assignmentMigration.includes(contract),
      `missing assignment migration contract: ${contract}`,
    );
  }
  for (const publicField of [
    "'cardId'",
    "'stage'",
    "'position'",
    "'visitorPrompt'",
    "'optionA'",
    "'optionB'",
    "'isSignature'",
  ]) {
    assert.ok(
      assignmentMigration.includes(publicField),
      `missing public assignment field: ${publicField}`,
    );
  }
  assert.doesNotMatch(
    assignmentMigration,
    /jsonb_build_object\([^;]*(?:owner_prompt|owner_choice|session_token_hash|secret_hash|tie_hash)/s,
    "assignment API JSON cannot expose owner answers, credentials, or hashes",
  );

  const requiredResponseMigration = source(
    "supabase/migrations/20260718000800_visitor_required_response.sql",
  );
  for (const contract of [
    "create table public.visitor_answers",
    "create or replace function public.start_required_response",
    "create or replace function public.get_visitor_response",
    "create or replace function public.save_response_answer",
    "create or replace function public.submit_response",
    "create or replace function public.record_visitor_response_event",
    "analytics_visitor_terminal_event_unique_idx",
    "'visitor_responses_id_share_link_key'",
    "for update of link",
    "for update of response",
    "when unique_violation then",
    "status = 'disabled'",
    "get stacked diagnostics v_constraint_name = constraint_name",
    "v_constraint_name <> 'analytics_visitor_terminal_event_unique_idx'",
    "'visitor_required_answer_saved'",
    "'visitor_required_submitted'",
    "'packPosition'",
    "'comparison_viewed'",
    "'same_pack_start_clicked'",
  ]) {
    assert.ok(
      requiredResponseMigration.includes(contract),
      `missing required response migration contract: ${contract}`,
    );
  }

  const responseRoutePaths = [
    "app/api/responses/[id]/route.ts",
    "app/api/responses/[id]/answers/[cardId]/route.ts",
    "app/api/responses/[id]/submit/route.ts",
    "app/api/responses/[id]/continue/route.ts",
    "app/api/responses/[id]/events/route.ts",
  ];
  const routeSources = responseRoutePaths.map(source);
  for (const contents of routeSources) {
    assert.match(contents, /withPublicRequest\s*\(/);
    assert.match(contents, /privateNoStore:\s*true/);
    assert.match(contents, /parseVisitorResponseCookie/);
    assert.match(contents, /cookie\.responseId !== id/);
  }
  for (const contract of [
    'visitorResponseMethodNotAllowed("GET")',
    'visitorResponseMethodNotAllowed("POST")',
    'visitorResponseMethodNotAllowed("PUT")',
    "methodNotAllowed as HEAD",
    "methodNotAllowed as OPTIONS",
  ]) {
    assert.ok(
      routeSources.some((route) => route.includes(contract)),
      `missing unsupported-method contract: ${contract}`,
    );
  }

  const answerRoute = source(
    "app/api/responses/[id]/answers/[cardId]/route.ts",
  );
  const answerLimiter = answerRoute.indexOf("runRateLimitedDomain");
  const answerDomain = answerRoute.lastIndexOf("saveVisitorAnswer({");
  assert.ok(answerLimiter >= 0 && answerDomain > answerLimiter);
  assert.match(answerRoute, /limit:\s*120/);
  const submitRoute = source("app/api/responses/[id]/submit/route.ts");
  const submitLimiter = submitRoute.indexOf("runRateLimitedDomain");
  const submitDomain = submitRoute.lastIndexOf("submitVisitorAnswers({");
  assert.ok(submitLimiter >= 0 && submitDomain > submitLimiter);
  assert.match(submitRoute, /limit:\s*10/);

  const continueRoute = source("app/api/responses/[id]/continue/route.ts");
  assert.match(continueRoute, /emptyOwnerMutationSchema/);
  assert.match(continueRoute, /maximumBodyBytes:\s*2/);
  assert.match(continueRoute, /continueVisitorAnswers\(\{ cookie, signal \}\)/);

  const optionalMigration = source(
    "supabase/migrations/20260719000200_visitor_optional_answers.sql",
  );
  for (const contract of [
    "create or replace function public.assign_optional_cards",
    "gyeop-optional-assignment-v1",
    "prior_link.pack_play_id = v_pack_play_id",
    "assignment.stage = 'optional'",
    "visitor_optional_started as (",
    "visitor_optional_completed as (",
    "'optional_answers_started'",
    "'optional_answers_completed'",
  ]) {
    assert.ok(
      optionalMigration.includes(contract),
      `missing optional response migration contract: ${contract}`,
    );
  }
  const optionalState = optionalMigration.slice(
    optionalMigration.indexOf(
      "create or replace function private.visitor_required_response_state",
    ),
    optionalMigration.indexOf(
      "create or replace function public.assign_optional_cards",
    ),
  );
  assert.doesNotMatch(
    optionalState,
    /'(?:ownerPrompt|sessionTokenHash|secretHash|tieHash)'\s*,/,
    "optional response JSON cannot expose owner prompts, credentials, or hashes",
  );

  const management = source("lib/visitor-management/management-secret.ts");
  for (const contract of [
    "getRandomValues(bytes)",
    "gyeop:visitor-management:v1:",
    'status: "pending"',
    'status: "completed"',
    "/responses/manage#token=",
    "globalThis.localStorage",
    "storage.removeItem(key(responseId))",
    "parseManagementFragment",
    "removeManagementRecordMatchingSecret",
  ]) {
    assert.ok(
      management.includes(contract),
      `missing management storage contract: ${contract}`,
    );
  }

  const withdrawalMigration = source(
    "supabase/migrations/20260719000300_visitor_response_withdrawal.sql",
  );
  for (const contract of [
    "create function public.withdraw_response",
    "delete from public.visitor_answers",
    "delete from public.visitor_assignments",
    "analytics_withdrawal_scrub_guard",
    "response_withdrawn",
    "status = 'withdrawn'",
  ]) {
    assert.ok(
      withdrawalMigration.includes(contract),
      `missing visitor withdrawal contract: ${contract}`,
    );
  }

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
