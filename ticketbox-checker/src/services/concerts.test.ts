import assert from "node:assert/strict";
import test from "node:test";
import { parseConcertOptions } from "./concerts";

test("parseConcertOptions returns usable published concert fields", () => {
  assert.deepEqual(parseConcertOptions({
    content: [{
      id: "20000000-0000-0000-0000-000000000001",
      name: " Anh Trai Say Hi ",
      venue: " My Dinh ",
      eventDate: "2026-07-13T12:00:00Z",
      eventCode: " ATSH "
    }]
  }), [{
    id: "20000000-0000-0000-0000-000000000001",
    name: "Anh Trai Say Hi",
    venue: "My Dinh",
    eventDate: "2026-07-13T12:00:00Z",
    eventCode: "ATSH"
  }]);
});

test("parseConcertOptions ignores malformed entries", () => {
  assert.deepEqual(parseConcertOptions({
    content: [null, { id: "invalid", name: "Bad" }, { id: "20000000-0000-0000-0000-000000000002" }]
  }), []);
  assert.deepEqual(parseConcertOptions(null), []);
});
