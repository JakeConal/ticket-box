import assert from "node:assert/strict";
import test from "node:test";
import { isCanonicalUuid } from "./validation";

test("accepts seeded PostgreSQL UUIDs without RFC version bits", () => {
  assert.equal(isCanonicalUuid("20000000-0000-0000-0000-000000000002"), true);
});

test("rejects malformed concert IDs", () => {
  assert.equal(isCanonicalUuid("20000000-0000-0000-0000"), false);
  assert.equal(isCanonicalUuid("not-a-uuid"), false);
});
