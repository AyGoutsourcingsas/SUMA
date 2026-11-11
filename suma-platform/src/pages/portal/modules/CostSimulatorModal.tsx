// ============================================================
// SUMA ERP — Simulador de costos (visual, en pantalla)
// El cliente mete precios hipotéticos por insumo y ve AL INSTANTE
// cómo quedarían sus recetas: costo, precio y si conviene o no.
// Descarga opcional de la comparativa a Excel.
// ============================================================
import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Download, AlertTriangle, RotateCcw, X } from 'lucide-react';
import { Modal, Button, Badge } from '@/components/ui';
import { formatCOP, formatPercent } from '@/config/brand';
import { simulateRecipes } from '@/lib/costSimulator';
import { downloadAsExcel } from '@/lib/excelExport';
import type { Unit, Material, ItemGroup } from '@/types/domain';
import type { RecipeRecord } from '@/services/modules/costos';

export function CostSimulatorModal({
  isOpen, onClose, recipes, materials, units, groups,
}: {
  isOpen: boolean;
  onClose: () => void;
  recipes: RecipeRecord[];
  materials: Material[];
  units: Unit[];
  groups: ItemGroup[];
}) {
  // precio hipotético por material (texto para permitir vacío)
  const [sim, setSim] = useState<Record<string, string>>({});

  const simCosts = useMemo(() => {
    const map = new Map<string, number>();
    for (const [id, val] of Object.entries(sim)) {
      if (val !== '' && !Number.isNaN(Number(val))) map.set(id, Number(val));
    }
    return map;
  }, [sim]);

  const results = useMemo(
    () => simulateRecipes({ recipes, units, materials, simCosts }),
    [recipes, units, materials, simCosts],
  );

  // Solo recetas afectadas por los insumos que el usuario cambió
  const affected = useMemo(() => {
    if (simCosts.size === 0) return results;
    const changedIds = new Set(simCosts.keys());
    return results.filter((r) => {
      const rec = recipes.find((x) => x.id === r.recipeId);
      return (rec?.recipe_ingredients ?? []).some((ln) => ln.material_id && changedIds.has(ln.material_id));
    });
  }, [results, recipes, simCosts]);

  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? 'Sin carpeta';

  const hasChanges = simCosts.size > 0;

  const download = () => {
    const rows = affected.map((r) => ({
      Carpeta: groupName(r.groupId),
      Producto: r.product,
      'Costo actual': Math.round(r.currentCost),
      'Costo simulado': Math.round(r.simCost),
      'Diferencia $': Math.round(r.costDiff),
      'Diferencia %': r.costDiffPct.toFixed(1) + '%',
      'Precio actual': Math.round(r.currentPrice),
      'Precio sugerido simulado': Math.round(r.simPrice),
      'Margen si mantengo precio': formatPercent(r.marginIfKeepPrice),
      'Alerta': r.belowTargetMargin ? 'BAJO MARGEN' : 'OK',
    }));
    downloadAsExcel(rows, 'simulacion_costos', 'Simulación');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Simulador de costos" size="2xl">
      <div className="p-6 space-y-5">
        <div className="flex items-start gap-2.5 rounded-lg border border-suma-200 bg-suma-50 dark:border-suma-500/30 dark:bg-suma-500/10 p-3 text-sm text-suma-700 dark:text-suma-300">
          <TrendingUp className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Escribe un precio hipotético para uno o varios insumos y mira al instante cómo quedarían tus recetas. No cambia nada: es solo una simulación.</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Precios hipotéticos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Precios a simular (por unidad base)</h4>
              {hasChanges && (
                <button onClick={() => setSim({})} className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Limpiar
                </button>
              )}
            </div>
            <div className="max-h-[50vh] overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-lg">
              <table className="suma-table">
                <thead><tr><th>Insumo</th><th>Costo actual</th><th>Precio simulado</th></tr></thead>
                <tbody>
                  {materials.map((m) => (
                    <tr key={m.id}>
                      <td className="font-medium text-gray-900 dark:text-white">{m.name} <span className="text-xs text-gray-400">/{m.base_unit}</span></td>
                      <td className="font-mono text-sm">{formatCOP(m.unit_cost_per_base)}</td>
                      <td>
                        <input
                          type="number" step="any"
                          value={sim[m.id] ?? ''}
                          onChange={(e) => setSim((prev) => ({ ...prev, [m.id]: e.target.value }))}
                          placeholder="—"
                          className="w-28 px-2 py-1 rounded border border-suma-300 dark:border-suma-700 text-xs text-right bg-white dark:bg-gray-800"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Impacto en recetas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                {hasChanges ? `Impacto en ${affected.length} receta(s)` : 'Impacto en recetas'}
              </h4>
              {hasChanges && affected.length > 0 && (
                <Button variant="secondary" size="xs" onClick={download} leftIcon={<Download className="w-3.5 h-3.5" />}>Descargar Excel</Button>
              )}
            </div>

            {!hasChanges ? (
              <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center text-sm text-gray-500">
                Escribe un precio simulado a la izquierda para ver aquí cómo cambian tus recetas.
              </div>
            ) : affected.length === 0 ? (
              <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center text-sm text-gray-500">
                Ninguna receta usa los insumos que cambiaste.
              </div>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto space-y-2">
                {affected.map((r) => {
                  const subio = r.costDiff > 0;
                  return (
                    <div key={r.recipeId} className={`p-3 rounded-lg border ${r.belowTargetMargin ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30' : 'border-gray-200 dark:border-gray-800'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">{r.product}</span>
                        {r.belowTargetMargin && (
                          <Badge variant="red"><AlertTriangle className="w-3 h-3 inline mr-1" />Bajo margen</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                        <span className="text-gray-500">Costo actual:</span>
                        <span className="font-mono text-right">{formatCOP(r.currentCost)}</span>
                        <span className="text-gray-500">Costo simulado:</span>
                        <span className={`font-mono text-right font-bold ${subio ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCOP(r.simCost)} {subio ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                        </span>
                        <span className="text-gray-500">Diferencia:</span>
                        <span className={`font-mono text-right ${subio ? 'text-red-600' : 'text-green-600'}`}>
                          {subio ? '+' : ''}{formatCOP(r.costDiff)} ({r.costDiffPct.toFixed(1)}%)
                        </span>
                        <span className="text-gray-500">Precio sugerido:</span>
                        <span className="font-mono text-right">{formatCOP(Math.round(r.simPrice))}</span>
                        <span className="text-gray-500">Si mantienes el precio actual, tu margen sería:</span>
                        <span className={`font-mono text-right font-semibold ${r.belowTargetMargin ? 'text-red-600' : 'text-green-600'}`}>
                          {formatPercent(r.marginIfKeepPrice)}
                        </span>
                      </div>
                      {r.belowTargetMargin && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">
                          ⚠️ Con el precio actual ya no alcanzas tu margen objetivo. Considera subir el precio a {formatCOP(Math.round(r.simPrice))}.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose} leftIcon={<X className="w-4 h-4" />}>Cerrar</Button>
        </div>
      </div>
    </Modal>
  );
}
