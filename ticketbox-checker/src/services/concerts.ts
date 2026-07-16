import type { ConcertOption } from "../types";
import { isCanonicalUuid } from "../utils/validation";

export function parseConcertOptions(payload: unknown): ConcertOption[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.id !== "string"
      || !isCanonicalUuid(candidate.id)
      || typeof candidate.name !== "string"
      || !candidate.name.trim()
    ) {
      return [];
    }
    return [{
      id: candidate.id,
      name: candidate.name.trim(),
      venue: typeof candidate.venue === "string" ? candidate.venue.trim() : "",
      eventDate: typeof candidate.eventDate === "string" ? candidate.eventDate : "",
      eventCode: typeof candidate.eventCode === "string" ? candidate.eventCode.trim() : ""
    }];
  });
}
