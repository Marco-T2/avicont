import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { CuentaTreeNode } from '@/types/api';

import { ClaseBadge } from './clase-badge';

interface CuentaTreeViewProps {
  nodes: CuentaTreeNode[];
  onSelect: (node: CuentaTreeNode) => void;
  /** Opcional: callback al hacer click en el "+" de un agrupador activo.
   *  Si se provee, los agrupadores activos renderizan el botón "+". */
  onCreateChild?: (parent: CuentaTreeNode) => void;
}

// Árbol expandible del plan de cuentas. Todos los nodos inician expandidos
// (CLAUDE.md §plan decisiones): el usuario colapsa las ramas que no necesita.
// El estado de colapso vive en un Set — minimiza re-renders vs un Map.
export function CuentaTreeView({
  nodes,
  onSelect,
  onCreateChild,
}: CuentaTreeViewProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (nodes.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay cuentas sembradas todavía.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border divide-y">
      {nodes.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          depth={0}
          collapsed={collapsed}
          onToggle={toggle}
          onSelect={onSelect}
          onCreateChild={onCreateChild}
        />
      ))}
    </div>
  );
}

interface TreeRowProps {
  node: CuentaTreeNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: CuentaTreeNode) => void;
  onCreateChild?: (parent: CuentaTreeNode) => void;
}

function TreeRow({
  node,
  depth,
  collapsed,
  onToggle,
  onSelect,
  onCreateChild,
}: TreeRowProps): React.JSX.Element {
  const hasChildren = node.hijas.length > 0;
  const isCollapsed = collapsed.has(node.id);
  // Solo agrupadores activos pueden recibir hijas. Los detalle (hojas) y
  // las inactivas no muestran el botón "+".
  const canCreateChild =
    onCreateChild !== undefined && !node.esDetalle && node.activa;

  return (
    <div>
      <div
        // group/row: habilita el hover-visible del botón "+" en desktop
        // (opacity 0 → 100 al hacer hover sobre la fila). Mobile siempre visible.
        className={cn(
          'group/row flex items-center gap-2 px-2 py-2 hover:bg-muted/50 cursor-pointer',
          !node.activa && 'opacity-60',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node)}
      >
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            aria-label={isCollapsed ? 'Expandir rama' : 'Colapsar rama'}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <span className="w-6 shrink-0" aria-hidden="true" />
        )}

        <span className="font-mono text-xs text-muted-foreground shrink-0 w-24">
          {node.codigoInterno}
        </span>
        <span
          className={cn(
            'flex-1 truncate text-sm',
            node.esDetalle ? 'font-normal' : 'font-medium',
          )}
        >
          {node.nombre}
        </span>
        <ClaseBadge clase={node.claseCuenta} className="shrink-0" />
        {canCreateChild ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Crear sub-cuenta bajo ${node.codigoInterno} ${node.nombre}`}
                // Tap target h-11/w-11 (44px) en mobile — Apple HIG (CLAUDE.md §7).
                // Desktop h-8 con hover-visible para no ensuciar árboles densos.
                className="h-11 w-11 shrink-0 md:h-8 md:w-8 md:opacity-0 md:group-hover/row:opacity-100 md:focus-visible:opacity-100 md:transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateChild(node);
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Crear sub-cuenta</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {hasChildren && !isCollapsed ? (
        <div>
          {node.hijas.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
