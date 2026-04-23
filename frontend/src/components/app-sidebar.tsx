import { NavList } from './nav-list';

// Sidebar de desktop, FIJA a la izquierda en md+. En mobile queda oculta
// y se reemplaza por MobileSidebar (drawer desde el hamburger del topbar).
export function AppSidebar(): React.JSX.Element {
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-sidebar md:flex md:flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-base font-semibold tracking-tight text-sidebar-foreground">
          Avicont
        </span>
      </div>
      <NavList />
    </aside>
  );
}
