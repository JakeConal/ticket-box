import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BauhausBackdrop } from "./bauhaus-backdrop";

describe("BauhausBackdrop", () => {
  it("renders a fixed, non-interactive decorative layer", () => {
    const { container } = render(<BauhausBackdrop />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.className).toContain("pointer-events-none");
    expect(root.className).toContain("fixed");
  });

  it("renders the five static decoration shapes", () => {
    const { container } = render(<BauhausBackdrop />);
    expect(container.querySelectorAll("span[aria-hidden]")).toHaveLength(5);
  });
});
