import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/**
 * Small uppercase tag (the design system's Pill). Bright tones take their on-* text; results
 * (win, loss, draw) keep ink letters inside a colored outline, since the result colors are
 * too light for small text.
 */
const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-2 text-[11px] font-extrabold tracking-wider whitespace-nowrap uppercase transition-all focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-brand text-on-brand [a]:hover:brightness-105",
        secondary: "bg-surface-muted text-ink [a]:hover:brightness-95",
        gold: "bg-gold text-on-gold",
        sky: "bg-sky text-on-sky",
        destructive: "bg-danger text-on-danger",
        outline: "border-2 border-line text-ink [a]:hover:bg-muted",
        win: "border-2 border-win bg-surface text-ink",
        loss: "border-2 border-loss bg-surface text-ink",
        draw: "border-2 border-draw bg-surface text-ink",
        ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-brand-text underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
