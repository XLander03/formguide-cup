export const BTN =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border-2 font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';

export const BTN_PRIMARY = `${BTN} border-primary bg-primary text-primary-foreground hover:bg-foreground hover:border-foreground`;

export const BTN_OUTLINE = `${BTN} border-foreground bg-background text-foreground hover:bg-foreground hover:text-background`;

export const BTN_LG = 'h-12 px-6 text-sm';

export const BTN_MD = 'h-10 px-4 py-2 text-sm';
