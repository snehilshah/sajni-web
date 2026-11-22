import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Material 3 Expressive Button.
 *
 *  variants: filled (default) | tonal | outlined | text | elevated | destructive | secondary | link
 *  sizes:    sm | default | lg | icon variants | fab | fab-extended
 */
const buttonVariants = cva(
  [
    'group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap',
    'font-sans font-medium tracking-[0.005em]',
    'transition-[background-color,box-shadow,transform,color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]',
    'outline-none select-none',
    'focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'active:scale-[0.97]',
    'disabled:pointer-events-none disabled:opacity-50',
    'aria-invalid:ring-2 aria-invalid:ring-destructive/30',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
    "[&_svg:not([class*='size-'])]:size-[18px]",
  ].join(' '),
  {
    variants: {
      variant: {
        // Filled — high-emphasis primary CTA.
        default:
          'rounded-full border border-transparent bg-primary text-primary-foreground shadow-none hover:shadow-[var(--m3-elev-1)] hover:brightness-105',
        // Tonal — medium-emphasis container fill.
        tonal:
          'rounded-full border border-transparent bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] hover:brightness-[0.97]',
        // Neutral — secondary action. Kept the `outline` name for call sites,
        // but it's a borderless neutral fill now: borders only carry state
        // (DESIGN.md), and an outline on every Cancel was decoration.
        outline:
          'rounded-full border border-transparent bg-[hsl(var(--surface-container-high))] text-foreground hover:bg-[hsl(var(--surface-container-highest))]',
        // Text — lowest emphasis.
        ghost:
          'rounded-full border border-transparent bg-transparent text-foreground hover:bg-[hsl(var(--on-surface)/0.06)]',
        // Elevated — like text but with a subtle surface lift.
        elevated:
          'rounded-full border border-transparent bg-[hsl(var(--surface-container-low))] text-primary shadow-[var(--m3-elev-1)] hover:bg-[hsl(var(--surface-container))] hover:shadow-[var(--m3-elev-2)]',
        // Secondary alias — kept for backwards compat; renders tonal.
        secondary:
          'rounded-full border border-transparent bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] hover:brightness-[0.97]',
        // Red is rationed: only the final "yes, delete" carries a fill.
        // Destructive — error container fill: confirm dialogs only.
        destructive:
          'rounded-full border border-transparent bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))] hover:brightness-[0.97]',
        // Destructive quiet — Delete in an editor's footer / action bar:
        // dressed like the Cancel beside it (neutral fill), red label only.
        'destructive-quiet':
          'rounded-full border border-transparent bg-[hsl(var(--surface-container-high))] text-[hsl(var(--error))] hover:bg-[hsl(var(--error-container))] hover:text-[hsl(var(--on-error-container))]',
        // Destructive ghost — icon-only delete on a row: a muted glyph like
        // any other row icon, turning red only on hover/press, so a list of
        // rows never shows a column of red. Menus use DropdownMenuItem
        // variant="destructive".
        'destructive-ghost':
          'rounded-full border border-transparent bg-transparent text-muted-foreground hover:bg-[hsl(var(--error-container))] hover:text-[hsl(var(--on-error-container))] focus-visible:text-[hsl(var(--error))] active:bg-[hsl(var(--error-container))]',
        // Link — text + underline.
        link: 'rounded-none border-0 px-0 text-primary underline underline-offset-4 hover:no-underline active:scale-100',
      },
      size: {
        default: 'h-10 px-6 text-sm',
        xs: "h-7 gap-1 rounded-full px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: 'h-8 gap-1.5 rounded-full px-4 text-xs',
        lg: 'h-12 gap-2 rounded-full px-7 text-sm',
        icon: 'size-10 rounded-full px-0',
        'icon-xs': "size-7 rounded-full px-0 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-sm': 'size-9 rounded-full px-0',
        'icon-lg': 'size-12 rounded-full px-0',
        // M3 FABs — square-ish rounded.
        fab: "size-14 rounded-2xl shadow-[var(--m3-elev-3)] [&_svg:not([class*='size-'])]:size-6",
        'fab-extended':
          "h-14 gap-3 rounded-2xl px-6 text-sm shadow-[var(--m3-elev-3)] [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant ?? 'default'}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
