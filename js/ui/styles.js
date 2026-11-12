const CHIP = 'border border-ink/25 px-1.5 py-0.5 text-xs';
const SLOT = 'relative flex min-h-[4rem] items-center gap-3 border py-2 pl-10 pr-2 text-sm';
const HEADING = 'border-b border-ink/30 pb-2 font-display text-2xl font-semibold';

export const COLOR_MAP = {
  scarlet: '#8e1f1f', gold: '#c9a227', blue: '#27407a', bronze: '#a0722c',
  yellow: '#d9b22a', black: '#1a1a1a', green: '#1f5c3a', silver: '#b5b8bd',
};

export const CLS = {
  chipItem: CHIP,
  colorItem: `inline-flex items-center gap-1.5 ${CHIP}`,
  swatch: 'h-2.5 w-2.5 rounded-full border border-ink/30',
  toast: 'bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-lg',
  swapOption: 'flex cursor-pointer items-center gap-3 border border-ink/25 px-3 py-2.5 text-sm hover:border-ink/60 has-[:checked]:border-ink has-[:checked]:bg-ink/5',
  swapRadio: 'accent-seal',
  slotEmptyBox: `${SLOT} border-dashed border-ink/30 text-muted`,
  slotFilled: {
    characters: `${SLOT} border-solid border-ink/30 bg-paper text-ink`,
    books: `${SLOT} border-solid border-ink/30 bg-paper text-ink`,
    houses: `${SLOT} border-solid border-ink/30 bg-paper text-ink`,
    spells: `${SLOT} border-solid border-ink/30 bg-paper text-ink`,
  },
  slotEmpty: 'flex-1',
  slotImg: 'h-10 w-10 shrink-0 object-cover object-top',
  slotLabel: 'min-w-0 flex-1 truncate font-medium',
  slotRemove: 'ml-auto grid h-8 w-8 shrink-0 place-items-center border border-ink/30 text-lg leading-none transition-colors hover:border-seal hover:text-seal',
  globalSection: 'space-y-5',
  globalHeading: { characters: HEADING, books: HEADING, houses: HEADING, spells: HEADING },
  globalGrid: 'grid grid-cols-2 gap-5 md:grid-cols-3',
};
