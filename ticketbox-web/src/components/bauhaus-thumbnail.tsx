import { Shape } from "./bauhaus";

type BauhausThumbnailProps = {
  seed: string;
};

// Deterministic abstract composition per concert, built from the three primary shapes.
const MOTIFS = [
  { circle: "left-[12%] top-[18%] h-16 w-16", square: "right-[16%] top-[30%] h-14 w-14 rotate-45", triangle: "left-[42%] bottom-[14%] h-12 w-12" },
  { circle: "right-[14%] top-[16%] h-14 w-14", square: "left-[16%] top-[42%] h-16 w-16", triangle: "right-[34%] bottom-[12%] h-14 w-14" },
  { circle: "left-[18%] bottom-[16%] h-16 w-16", square: "left-[44%] top-[14%] h-12 w-12 rotate-45", triangle: "right-[14%] top-[36%] h-14 w-14" },
  { circle: "left-[40%] top-[24%] h-20 w-20", square: "right-[18%] bottom-[18%] h-12 w-12", triangle: "left-[12%] top-[14%] h-12 w-12" }
] as const;

export function BauhausThumbnail({ seed }: BauhausThumbnailProps) {
  const motif = MOTIFS[hash(seed) % MOTIFS.length];

  return (
    <div aria-hidden="true" className="relative h-full w-full overflow-hidden bg-canvas">
      <div className="bauhaus-dots absolute inset-0 text-ink/15" />
      <Shape className={`absolute ${motif.circle}`} color="red" kind="circle" />
      <Shape className={`absolute ${motif.square}`} color="blue" kind="square" />
      <Shape className={`absolute ${motif.triangle}`} color="yellow" kind="triangle" />
      <span className="absolute inset-x-0 bottom-0 h-1.5 bg-ink" />
    </div>
  );
}

// Deterministic string hash, also reused for per-concert poster photo selection.
export function hash(value: string) {
  return Array.from(value).reduce((total, character) => ((total << 5) - total + character.charCodeAt(0)) | 0, 0) >>> 0;
}
