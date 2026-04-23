import { Menu } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

import { NavList } from './nav-list';

// Drawer de navegación para mobile (< md). El trigger (hamburger) se
// renderiza inline en el Topbar, solo visible en mobile via md:hidden.
// Al seleccionar un item, el drawer se cierra automáticamente.
export function MobileSidebar(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Abrir menú de navegación"
          className="md:hidden h-10 w-10"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-sidebar">
        <SheetHeader className="border-b">
          <SheetTitle className="text-left text-base font-semibold tracking-tight">
            Avicont
          </SheetTitle>
        </SheetHeader>
        <NavList onItemClick={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
