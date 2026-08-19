import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BauhausThumbnail } from "./bauhaus-thumbnail";

describe("BauhausThumbnail", () => {
  it("renders the three primary shapes and is decorative-only", () => {
    const { container } = render(<BauhausThumbnail seed="concert-1" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    // One circle, one square, one triangle.
    expect(container.querySelectorAll("span[aria-hidden]")).toHaveLength(3);
  });

  it("is deterministic: the same seed produces the same composition", () => {
    const first = render(<BauhausThumbnail seed="same-seed" />);
    const second = render(<BauhausThumbnail seed="same-seed" />);
    expect(first.container.innerHTML).toBe(second.container.innerHTML);
  });

  it("varies the composition across different seeds", () => {
    const renders = ["alpha", "beta", "gamma", "delta", "epsilon"].map((seed) => {
      const { container } = render(<BauhausThumbnail seed={seed} />);
      return container.innerHTML;
    });
    // With 4 motifs and 5 distinct seeds, at least two compositions must differ.
    expect(new Set(renders).size).toBeGreaterThan(1);
  });
});
