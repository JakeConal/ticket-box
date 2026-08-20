// Bauhaus geometric primitives: circle, square, triangle in the primary palette.
// Every decorative element in the UI composes these three shapes.

type ShapeColor = "red" | "blue" | "yellow" | "white" | "ink";

const SHAPE_COLORS: Record<ShapeColor, string> = {
  red: "bg-bauhaus-red",
  blue: "bg-bauhaus-blue",
  yellow: "bg-bauhaus-yellow",
  white: "bg-white",
  ink: "bg-ink"
};

export function Shape({
  color,
  kind,
  className
}: {
  color: ShapeColor;
  kind: "circle" | "square" | "triangle";
  className?: string;
}) {
  const base = SHAPE_COLORS[color];
  if (kind === "circle") {
    return <span aria-hidden="true" className={`block rounded-full ${base} ${className || ""}`} />;
  }
  if (kind === "square") {
    return <span aria-hidden="true" className={`block ${base} ${className || ""}`} />;
  }
  return (
    <span
      aria-hidden="true"
      className={`block ${base} ${className || ""}`}
      style={{ clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }}
    />
  );
}

// Brand mark: circle + square + triangle in the primary colors.
export function BauhausLogo({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex items-center gap-1 ${className || ""}`}>
      <Shape className="h-4 w-4" color="red" kind="circle" />
      <Shape className="h-4 w-4" color="blue" kind="square" />
      <Shape className="h-4 w-4" color="yellow" kind="triangle" />
    </span>
  );
}

// Small corner decoration used on cards; rotates through the three shapes.
export function CornerDecoration({ index }: { index: number }) {
  const kinds = ["circle", "square", "triangle"] as const;
  const colors = ["red", "blue", "yellow"] as const;
  return (
    <Shape
      className="absolute right-3 top-3 h-2.5 w-2.5"
      color={colors[index % colors.length]}
      kind={kinds[index % kinds.length]}
    />
  );
}
