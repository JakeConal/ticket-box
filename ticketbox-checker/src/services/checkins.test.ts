import assert from "node:assert/strict";
import test from "node:test";
import { duplicateScanMessage, friendlyScanError, mapCheckinResponse } from "./checkins";

test("maps a backend conflict to a failed local check-in", () => {
  const result = mapCheckinResponse(409, {
    result: "CONFLICT",
    winningCheckedInAt: "2026-07-15T01:30:00.000Z"
  });

  assert.equal(result.kind, "conflict");
  assert.equal(result.localStatus, "CONFLICT");
  assert.match(result.message, /Already checked in/);
});

test("does not treat an INVALID HTTP 200 response as synced", () => {
  const result = mapCheckinResponse(200, {
    result: "INVALID",
    message: "Ticket not found"
  });

  assert.equal(result.kind, "rejected");
  assert.equal(result.localStatus, "REJECTED");
  assert.equal(result.message, "Ticket not found");
});

test("maps an OK response to synced", () => {
  const result = mapCheckinResponse(200, { result: "OK", message: "Checked in" });

  assert.equal(result.kind, "synced");
  assert.equal(result.localStatus, "SYNCED");
});

test("turns technical signature errors into an actionable message", () => {
  const message = friendlyScanError(new Error("Signature verification failed: crypto error"));
  assert.match(message, /QR signature is invalid/);
  assert.doesNotMatch(message, /crypto error/);
});

test("duplicate pending scans explain that sync is still queued", () => {
  const message = duplicateScanMessage("PENDING_SYNC", "2026-07-15T01:30:00.000Z");
  assert.match(message, /Already scanned/);
  assert.match(message, /waiting to sync/);
});
