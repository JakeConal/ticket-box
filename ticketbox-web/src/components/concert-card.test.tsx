import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConcertSummary } from "../lib/audience-api";
import { ConcertCard, summarizeAvailability } from "./concert-card";

const concert: ConcertSummary = {
  id: "c-123",
  name: "Summer Fest",
  venue: "My Dinh Stadium",
  eventDate: "2026-09-01T19:30:00Z",
  status: "PUBLISHED",
  eventCode: "SF26"
};

describe("summarizeAvailability", () => {
  it("sums remaining quantity per zone", () => {
    const summary = summarizeAvailability([
      { zone: "A", remainingQuantity: 10, soldOut: false },
      { zone: "A", remainingQuantity: 5, soldOut: false },
      { zone: "B", remainingQuantity: 0, soldOut: true }
    ]);
    expect(summary.A.remaining).toBe(15);
    expect(summary.B.remaining).toBe(0);
  });

  it("marks a zone sold out only when every entry for it is sold out", () => {
    const summary = summarizeAvailability([
      { zone: "A", remainingQuantity: 0, soldOut: true },
      { zone: "A", remainingQuantity: 3, soldOut: false }
    ]);
    expect(summary.A.soldOut).toBe(false);
  });

  it("returns an empty summary for no items", () => {
    expect(summarizeAvailability([])).toEqual({});
  });
});

describe("ConcertCard", () => {
  it("shows concert details and total remaining tickets", () => {
    const availability = summarizeAvailability([
      { zone: "A", remainingQuantity: 12, soldOut: false },
      { zone: "B", remainingQuantity: 8, soldOut: false }
    ]);
    render(<ConcertCard availability={availability} concert={concert} decorationIndex={0} />);
    expect(screen.getByText("Summer Fest")).toBeInTheDocument();
    expect(screen.getByText("My Dinh Stadium")).toBeInTheDocument();
    expect(screen.getByText("SF26")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View tickets" })).toHaveAttribute("href", "/concerts/c-123");
  });

  it("shows a placeholder when no availability has loaded yet", () => {
    render(<ConcertCard availability={{}} concert={concert} decorationIndex={1} />);
    expect(screen.getByText("Availability loading")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("labels sold-out zones and strikes them through", () => {
    const availability = summarizeAvailability([{ zone: "VIP", remainingQuantity: 0, soldOut: true }]);
    render(<ConcertCard availability={availability} concert={concert} decorationIndex={2} />);
    const badge = screen.getByText(/VIP: Sold out/);
    expect(badge.className).toContain("line-through");
  });
});
