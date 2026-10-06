import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/**
 * Pressable buttons sit on a solid ledge (`--lip`, `--ledge` deep) and sink onto it when
 * pressed. Bright fills take their on-* text color and an uppercase label; one `default`
 * (brand green) per view, `gold` only for a reward.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-bold whitespace-nowrap outline-none select-none [--ledge:4px] transition-[transform,box-shadow,filter,background-color] duration-75 ease-out focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-brand text-on-brand [--lip:var(--brand-lip)] uppercase tracking-wide font-extrabold",
        gold: "bg-gold text-on-gold [--lip:var(--gold-lip)] uppercase tracking-wide font-extrabold",
        sky: "bg-sky text-on-sky [--lip:var(--sky-lip)] uppercase tracking-wide font-extrabold",
        danger: "bg-danger text-on-danger [--lip:var(--danger-lip)] uppercase tracking-wide font-extrabold",
        outline:
          "border-2 border-line bg-surface text-ink hover:bg-surface-muted aria-expanded:bg-surface-muted",
        secondary:
          "bg-surface-muted text-ink [--lip:var(--line)] hover:brightness-[0.97] dark:hover:brightness-110 aria-expanded:bg-surface-muted",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground [--ledge:0px]",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 [--ledge:0px]",
        link: "text-brand-text underline-offset-4 hover:underline [--ledge:0px]",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 rounded-md px-2 text-xs [--ledge:2px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-md px-2.5 text-[0.8rem] [--ledge:3px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-6 text-base has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [--ledge:2px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-md [--ledge:3px]",
        "icon-lg": "size-11",
      },
    },
    compoundVariants: [
      {
        // everything with a ledge: draw it, press onto it, grey out when disabled
        variant: ["default", "gold", "sky", "danger", "outline", "secondary"],
        className:
          "mb-(--ledge) shadow-[0_var(--ledge)_0_var(--lip)] hover:brightness-105 active:not-aria-[haspopup]:translate-y-(--ledge) active:not-aria-[haspopup]:shadow-none disabled:bg-surface-muted disabled:text-ink-muted disabled:[--lip:var(--line)] disabled:brightness-100",
      },
      { variant: ["ghost", "destructive", "link"], className: "active:not-aria-[haspopup]:translate-y-px disabled:opacity-50" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
