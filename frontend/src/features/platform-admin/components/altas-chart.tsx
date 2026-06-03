import type { AltasPorMes } from '@/types/api';

export interface AltasChartProps {
  /** Serie de altas por mes (12 meses fijos, orden ascendente). */
  altasPorMes: AltasPorMes[];
}

const NOMBRES_MES: Record<number, string> = {
  1: 'Ene',
  2: 'Feb',
  3: 'Mar',
  4: 'Abr',
  5: 'May',
  6: 'Jun',
  7: 'Jul',
  8: 'Ago',
  9: 'Sep',
  10: 'Oct',
  11: 'Nov',
  12: 'Dic',
};

/**
 * Gráfico de barras de altas de organizaciones por mes (sin librería de charting).
 * Las barras se construyen con divs y height calculado como porcentaje del máximo.
 * Presentacional puro — recibe la serie completa vía props.
 */
export function AltasChart({ altasPorMes }: AltasChartProps): React.JSX.Element {
  if (altasPorMes.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">Sin datos de altas.</p>
      </div>
    );
  }

  const maxCount = Math.max(...altasPorMes.map((m) => m.count), 1);

  return (
    <div aria-label="Gráfico de altas de organizaciones por mes">
      <div className="flex items-end gap-1 h-32" role="list">
        {altasPorMes.map((mes) => {
          const heightPct = maxCount > 0 ? (mes.count / maxCount) * 100 : 0;
          const label = `${NOMBRES_MES[mes.month] ?? mes.month} ${mes.year}: ${mes.count} alta${mes.count !== 1 ? 's' : ''}`;
          return (
            <div
              key={`${mes.year}-${mes.month}`}
              role="listitem"
              className="flex flex-1 flex-col items-center gap-1"
              title={label}
            >
              <span className="text-[10px] tabular-nums text-muted-foreground leading-none">
                {mes.count > 0 ? mes.count : ''}
              </span>
              <div
                className="w-full rounded-t-sm bg-primary/70 transition-all"
                style={{ height: `${Math.max(heightPct, mes.count > 0 ? 4 : 0)}%` }}
                aria-label={label}
              />
            </div>
          );
        })}
      </div>
      {/* Eje X: etiquetas de mes */}
      <div className="flex gap-1 mt-1">
        {altasPorMes.map((mes) => (
          <div
            key={`lbl-${mes.year}-${mes.month}`}
            className="flex-1 text-center text-[9px] text-muted-foreground leading-none"
          >
            {NOMBRES_MES[mes.month] ?? mes.month}
          </div>
        ))}
      </div>
    </div>
  );
}
