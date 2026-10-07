import * as React from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

/** An on/off switch: green on its ledge when on, a grey track when off. */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-(--duration-quick) outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        'bg-line shadow-[0_3px_0_var(--lip)] data-[state=checked]:bg-brand data-[state=checked]:shadow-[0_3px_0_var(--brand-lip)]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-[22px] translate-x-[3px] rounded-full bg-surface transition-transform duration-(--duration-quick) ease-(--ease-bounce) data-[state=checked]:translate-x-[23px]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
