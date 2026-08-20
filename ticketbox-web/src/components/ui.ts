// Central Bauhaus design tokens. Every page composes these shared classes;
// keep one-off styling out of pages and extend here instead.
// Palette: red #D02020, blue #1040C0, yellow #F0C020, ink #121212, canvas #F0F0F0.

const press = "transition-all duration-200 ease-out hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none motion-reduce:transform-none";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export const ui = {
  page: "mx-auto min-h-dvh w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8",
  authPage: "grid min-h-dvh place-items-center px-4 py-8 sm:px-6",
  adminPage: "min-h-dvh px-4 py-4 sm:px-6 sm:py-6 lg:px-8",
  nav: "mb-10 flex flex-wrap items-center justify-between gap-3 border-b-4 border-ink py-4",
  brand: "inline-flex min-h-11 items-center gap-2 text-lg font-black uppercase tracking-tight text-ink no-underline",
  navActions: "flex flex-wrap items-center gap-2",
  primaryButton: `inline-flex min-h-11 items-center justify-center border-2 border-ink bg-bauhaus-red px-4 py-2 text-sm font-bold uppercase tracking-wider text-white no-underline shadow-[4px_4px_0px_0px_#121212] ${press} hover:bg-bauhaus-red/90 ${focus} disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0`,
  secondaryButton: `inline-flex min-h-11 items-center justify-center border-2 border-ink bg-bauhaus-blue px-4 py-2 text-sm font-bold uppercase tracking-wider text-white no-underline shadow-[4px_4px_0px_0px_#121212] ${press} hover:bg-bauhaus-blue/90 ${focus} disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0`,
  yellowButton: `inline-flex min-h-11 items-center justify-center border-2 border-ink bg-bauhaus-yellow px-4 py-2 text-sm font-bold uppercase tracking-wider text-ink no-underline shadow-[4px_4px_0px_0px_#121212] ${press} hover:bg-bauhaus-yellow/90 ${focus} disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0`,
  ghostButton: `inline-flex min-h-11 items-center justify-center border-2 border-transparent bg-transparent px-3 py-2 text-sm font-bold uppercase tracking-wider text-ink no-underline transition-colors duration-200 hover:border-ink hover:bg-white ${focus} disabled:cursor-not-allowed disabled:opacity-45`,
  dangerButton: `inline-flex min-h-11 items-center justify-center border-2 border-ink bg-white px-4 py-2 text-sm font-bold uppercase tracking-wider text-bauhaus-red no-underline shadow-[4px_4px_0px_0px_#121212] ${press} hover:bg-bauhaus-red hover:text-white ${focus} disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0`,
  compactButton: "min-h-10 px-3 py-1.5 text-xs",
  muted: "text-sm leading-relaxed text-ink/70",
  eyebrow: "text-xs font-bold uppercase tracking-widest text-ink/60",
  panel: "relative min-w-0 border-4 border-ink bg-white p-5 shadow-[8px_8px_0px_0px_#121212] sm:p-6",
  form: "grid gap-4 text-sm font-medium text-ink [&_input]:mt-2 [&_input]:min-h-11 [&_input]:w-full [&_input]:border-2 [&_input]:border-ink [&_input]:bg-white [&_input]:px-3 [&_input]:py-2 [&_input]:text-base [&_input]:font-normal [&_input]:text-ink [&_input]:outline-none [&_input]:transition-colors [&_input]:focus-visible:outline-2 [&_input]:focus-visible:outline-offset-2 [&_input]:focus-visible:outline-ink [&_textarea]:mt-2 [&_textarea]:w-full [&_textarea]:border-2 [&_textarea]:border-ink [&_textarea]:bg-white [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-base [&_textarea]:font-normal [&_textarea]:text-ink [&_textarea]:outline-none [&_textarea]:focus-visible:outline-2 [&_textarea]:focus-visible:outline-offset-2 [&_textarea]:focus-visible:outline-ink",
  alertError: "border-2 border-ink bg-bauhaus-red px-4 py-3 text-sm font-bold text-white shadow-[4px_4px_0px_0px_#121212]",
  alertSuccess: "border-2 border-ink bg-ink px-4 py-3 text-sm font-bold text-white shadow-[4px_4px_0px_0px_#121212]",
  alertWarning: "border-2 border-ink bg-bauhaus-yellow px-4 py-3 text-sm font-bold leading-6 text-ink shadow-[4px_4px_0px_0px_#121212]",
  statusBadge: "inline-flex border-2 border-ink bg-white px-2 py-1 text-xs font-bold uppercase tracking-widest text-ink",
  tableWrap: "max-w-full overflow-x-auto border-2 border-ink shadow-[4px_4px_0px_0px_#121212]",
  table: "w-full min-w-[38rem] border-collapse bg-white text-left text-sm [&_th]:border-b-2 [&_th]:border-ink [&_th]:bg-bauhaus-yellow [&_th]:px-3 [&_th]:py-3 [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wider [&_td]:border-b [&_td]:border-ink/20 [&_td]:px-3 [&_td]:py-3 [&_td]:align-top",
  rowButton: "grid w-full gap-1 text-left text-sm text-ink transition-colors hover:text-bauhaus-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
  sectionHeading: "flex flex-wrap items-end justify-between gap-4",
  actionRow: "flex flex-wrap gap-3",
  emptyState: "border-4 border-dashed border-ink/40 bg-white p-6 text-sm leading-6 text-ink/70",
  metric: "relative border-4 border-ink bg-white p-4 shadow-[4px_4px_0px_0px_#121212] [&_span]:block [&_span]:text-xs [&_span]:font-bold [&_span]:uppercase [&_span]:tracking-widest [&_span]:text-ink/60 [&_strong]:mt-3 [&_strong]:block [&_strong]:text-2xl [&_strong]:font-black [&_strong]:text-ink"
} as const;

