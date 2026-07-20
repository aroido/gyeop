import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  validateOwnerFlowSource,
  verifyOwnerFlow,
} from "../../scripts/verify-owner-flow.mjs";

const root = path.resolve(new URL("../../", import.meta.url).pathname);

test("repository owner flow policy passes", () => {
  assert.equal(verifyOwnerFlow(root), true);
});

test("owner flow policy rejects browser persistence and readable cookies", () => {
  for (const source of [
    'localStorage.setItem("answer", "a")',
    'sessionStorage.setItem("play", "id")',
    'indexedDB.open("gyeop")',
    "document.cookie",
  ]) {
    assert.throws(() => validateOwnerFlowSource("fixture.ts", source));
  }
});

test("owner flow policy rejects direct data clients and arbitrary fetch targets", () => {
  for (const source of [
    'import { createClient } from "@supabase/supabase-js"',
    'supabase.from("self_answers")',
    "fetch(url)",
    "fetch(endpoint)",
  ]) {
    assert.throws(() => validateOwnerFlowSource("fixture.ts", source));
  }
});

test("owner flow policy permits exact reviewed fetch construction", () => {
  assert.equal(
    validateOwnerFlowSource(
      "fixture.ts",
      'fetch("/api/plays", { cache: "no-store", credentials: "same-origin" })',
    ),
    true,
  );
});
