type MusicThumbnailProps = {
  seed: string;
};

const MOTIFS = [
  [
    ["left-[14%] top-[22%] text-7xl", "♪"],
    ["right-[17%] top-[40%] text-6xl", "♫"],
    ["left-[43%] bottom-[12%] text-5xl", "♩"]
  ],
  [
    ["left-[18%] top-[48%] text-6xl", "♫"],
    ["right-[15%] top-[18%] text-5xl", "♩"],
    ["right-[36%] bottom-[14%] text-7xl", "♪"]
  ],
  [
    ["left-[12%] top-[16%] text-5xl", "♩"],
    ["left-[44%] top-[38%] text-7xl", "♫"],
    ["right-[13%] bottom-[10%] text-6xl", "♪"]
  ],
  [
    ["left-[17%] bottom-[14%] text-7xl", "♪"],
    ["right-[17%] top-[22%] text-7xl", "♫"],
    ["left-[48%] top-[15%] text-5xl", "♩"]
  ]
] as const;

export function MusicThumbnail({ seed }: MusicThumbnailProps) {
  const motif = MOTIFS[hash(seed) % MOTIFS.length];

  return (
    <div aria-hidden="true" className="relative grid h-full w-full place-items-center overflow-hidden bg-neutral-100 text-neutral-950">
      <div className="absolute inset-x-0 top-1/2 grid -translate-y-1/2 gap-3 opacity-20">
        {[0, 1, 2, 3, 4].map((line) => <span className="h-px w-full bg-current" key={line} />)}
      </div>
      {motif.map(([position, note], index) => (
        <span
          className={`absolute font-black leading-none text-neutral-950/75 motion-safe:animate-bounce motion-reduce:animate-none ${position}`}
          key={`${position}-${note}`}
          style={{ animationDelay: `-${index * 700}ms`, animationDuration: `${2800 + index * 300}ms` }}
        >
          {note}
        </span>
      ))}
    </div>
  );
}

function hash(value: string) {
  return Array.from(value).reduce((total, character) => ((total << 5) - total + character.charCodeAt(0)) | 0, 0) >>> 0;
}
