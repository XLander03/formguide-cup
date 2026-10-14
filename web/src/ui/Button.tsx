import type { ButtonHTMLAttributes } from 'react';
import { BTN, BTN_LG, BTN_MD, BTN_OUTLINE } from './buttons';

type Variant = 'primary' | 'secondary';
type Size = 'sm' | 'md' | 'lg';

/**
 * Shared button. Variants reuse the existing button tokens — no new CSS.
 * `primary` is the filled Download draft treatment (light fill on the primary
 * panel) plus the base button classes that keep the icon and label inline.
 * `secondary` is the outlined style used by Stop.
 */
const VARIANT: Record<Variant, string> = {
  primary: `${BTN} border-background bg-background text-foreground hover:bg-foreground hover:text-background`,
  secondary: BTN_OUTLINE,
};

const SIZE: Record<Exclude<Size, 'sm'>, string> = {
  md: BTN_MD,
  lg: BTN_LG,
};

/** Same small control as the read-back Stop button, plus the shared base classes. */
const STOP_SMALL = `${BTN.replace('font-semibold', 'font-bold')} shrink-0 border-background bg-background px-3 py-1 text-[11px] uppercase text-foreground hover:bg-primary hover:text-primary-foreground`;

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  const classes =
    variant === 'secondary' && size === 'sm'
      ? STOP_SMALL
      : `${VARIANT[variant]} ${SIZE[size === 'sm' ? 'md' : size]}`;
  return <button type={type} className={`${classes} ${className}`.trim()} {...props} />;
}
