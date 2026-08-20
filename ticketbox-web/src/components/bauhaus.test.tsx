import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BauhausLogo, CornerDecoration, Shape } from "./bauhaus";

describe("Shape", () => {
  it("renders a circle with rounded corners and the color class", () => {
    const { container } = render(<Shape className="h-4 w-4" color="red" kind="circle" />);
    const shape = container.firstElementChild as HTMLElement;
    expect(shape.className).toContain("rounded-full");
    expect(shape.className).toContain("bg-bauhaus-red");
    expect(shape.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders a square without rounded corners", () => {
    const { container } = render(<Shape color="blue" kind="square" />);
    const shape = container.firstElementChild as HTMLElement;
    expect(shape.className).toContain("bg-bauhaus-blue");
    expect(shape.className).not.toContain("rounded-full");
    expect(shape.style.clipPath).toBe("");
  });

  it("renders a triangle using a clip-path polygon", () => {
    const { container } = render(<Shape color="yellow" kind="triangle" />);
    const shape = container.firstElementChild as HTMLElement;
    expect(shape.className).toContain("bg-bauhaus-yellow");
    expect(shape.style.clipPath).toBe("polygon(50% 0%, 0% 100%, 100% 100%)");
  });

  it("applies the ink palette and optional className", () => {
    const { container } = render(<Shape className="h-8 w-8" color="ink" kind="circle" />);
    const shape = container.firstElementChild as HTMLElement;
    expect(shape.className).toContain("bg-ink");
    expect(shape.className).toContain("h-8 w-8");
  });
});

describe("BauhausLogo", () => {
  it("composes one circle, one square and one triangle", () => {
    const { container } = render(<BauhausLogo />);
    const shapes = container.querySelectorAll("span[aria-hidden] > span");
    expect(shapes).toHaveLength(3);
    expect(container.firstElementChild?.className).toContain("inline-flex");
  });

  it("merges an extra className into the wrapper", () => {
    const { container } = render(<BauhausLogo className="ml-2" />);
    expect(container.firstElementChild?.className).toContain("ml-2");
  });
});

describe("CornerDecoration", () => {
  it("rotates through circle, square and triangle by index", () => {
    const first = render(<CornerDecoration index={0} />);
    expect((first.container.firstElementChild as HTMLElement).className).toContain("rounded-full");

    const second = render(<CornerDecoration index={1} />);
    const square = second.container.firstElementChild as HTMLElement;
    expect(square.className).not.toContain("rounded-full");
    expect(square.style.clipPath).toBe("");

    const third = render(<CornerDecoration index={2} />);
    expect((third.container.firstElementChild as HTMLElement).style.clipPath).toBe(
      "polygon(50% 0%, 0% 100%, 100% 100%)"
    );
  });

  it("wraps around for indexes beyond the palette length", () => {
    const wrapped = render(<CornerDecoration index={3} />);
    expect((wrapped.container.firstElementChild as HTMLElement).className).toContain("rounded-full");
  });
});
