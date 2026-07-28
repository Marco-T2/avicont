import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // `relative` ancla el ::after táctil de abajo (el root era static).
        'peer relative inline-flex h-[1.15rem] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs transition-all outline-none disabled:cursor-not-allowed disabled:opacity-50',
        // Piso táctil §7 vía ::after invisible: agrandar la píldora le cambia
        // el aspecto. Los insets se computan desde el PADDING box (30×16.4:
        // 32×18.4 menos 2 de borde): 30+2×7 = 44 y 16.4+2×14 = 44.4. Con 6px
        // horizontales daba 42, no 44 — medido por hit-testing con medir:tap.
        'pointer-coarse:after:absolute pointer-coarse:after:-inset-x-[7px] pointer-coarse:after:-inset-y-3.5',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-4 rounded-full ring-0 transition-transform',
          'bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground',
          'data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
