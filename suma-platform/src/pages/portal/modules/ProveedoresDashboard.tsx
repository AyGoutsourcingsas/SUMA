// ============================================================
// SUMA ERP — Dashboard de Proveedores
// Visibilidad: cuánto gastas por proveedor, tendencia mensual,
// y qué proveedor te ha subido más los precios. Todo muy visual.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Users, TrendingUp, Download, RefreshCw, AlertTriangle, Package } from 'lucide-react';
import { Card, StatCard, Badge, EmptyState, Spinner, Button, Alert } from '@/components/ui';
import { formatCOP } from '@/config/brand';
import { downloadAsExcel } from '@/lib/excelExport';
import {
  fetchSupplierSpend, fetchSupplierSpendMonthly, fetchSupplierPriceVariation,
  type SupplierSpend, type SupplierSpendMonthly, type SupplierPriceVariation,
} from '@/services/modules/inventario';

export function ProveedoresDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spend, setSpend] = useState<SupplierSpend[]>([]);
  const [monthly, setMonthly] = useState<SupplierSpendMonthly[]>([]);
  const [variation, setVariation] = useState<SupplierPriceVariation[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, m, v] = await Promise.all([
        fetchSupplierSpend(), fetchSupplierSpendMonthly(), fetchSupplierPriceVariation(),
      ]);
      setSpend(s); setMonthly(m); setVariation(v);
    } catch {
      setError('No se pudieron cargar los datos de proveedores. Verifica que aplicaste la migración 009 en Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const gastoTotal = spend.reduce((a, s) => a + (s.gasto_total || 0), 0);
    const proveedores = spend.filter((s) => s.supplier_id).length;
    const subieron = variation.filter((v) => v.variacion_pct > 0).length;
    return { gastoTotal, proveedores, subieron };
  }, [spend, variation]);

  const maxSpend = Math.max(1, ...spend.map((s) => s.gasto_total || 0));

  // Meses únicos ordenados para la mini tendencia
  const months = useMemo(() => {
    const set = Array.from(new Set(monthly.map((m) => m.mes))).sort();
    return set.slice(-6); // últimos 6 meses
  }, [monthly]);

  const spendByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of monthly) map.set(m.mes, (map.get(m.mes) ?? 0) + m.gasto_mes);
    return map;
  }, [monthly]);
  const maxMonth = Math.max(1, ...months.map((m) => spendByMonth.get(m) ?? 0));

  const downloadSpend = () => {
    downloadAsExcel(
      spend.map((s) => ({
        Proveedor: s.supplier_name ?? 'Sin proveedor',
        'Gasto total': Math.round(s.gasto_total),
        'Nº compras': s.num_compras,
        'Ticket promedio': Math.round(s.ticket_promedio),
        'Insumos distintos': s.insumos_distintos,
        'Última compra': s.ultima_compra ?? '',
      })),
      'gasto_por_proveedor', 'Proveedores',
    );
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      {error && <Alert type="error">{error}</Alert>}

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-suma-600" /> Dashboard de proveedores
        </h3>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load} leftIcon={<RefreshCw className="w-4 h-4" />}>Actualizar</Button>
          <Button variant="secondary" size="sm" onClick={downloadSpend} leftIcon={<Download className="w-4 h-4" />}>Descargar Excel</Button>
        </div>
      </div>

      {spend.length === 0 ? (
        <EmptyState icon={<Users className="w-12 h-12" />} title="Sin compras a proveedores aún"
          description="Registra compras con su proveedor en Inventario para ver aquí cuánto gastas en cada uno." />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title="Gasto total en compras" value={formatCOP(totals.gastoTotal)} icon={<TrendingUp className="w-5 h-5" />} color="blue" />
            <StatCard title="Proveedores activos" value={totals.proveedores} icon={<Users className="w-5 h-5" />} color="green" />
            <StatCard title="Insumos que subieron de precio" value={totals.subieron} icon={<AlertTriangle className="w-5 h-5" />} color="orange" />
          </div>

          {/* Gasto por proveedor (barras) */}
          <Card>
            <div className="p-5">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Gasto por proveedor</h4>
              <div className="space-y-3">
                {spend.map((s) => (
                  <div key={s.supplier_id ?? 'none'}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{s.supplier_name ?? 'Sin proveedor'}</span>
                      <span className="font-mono text-gray-900 dark:text-white">{formatCOP(s.gasto_total)}</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-suma-500 rounded-full" style={{ width: `${(s.gasto_total / maxSpend) * 100}%` }} />
                    </div>
                    <div className="flex gap-4 text-xs text-gray-400 mt-0.5">
                      <span>{s.num_compras} compras</span>
                      <span>ticket {formatCOP(s.ticket_promedio)}</span>
                      <span>{s.insumos_distintos} insumos</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Tendencia mensual */}
          {months.length > 0 && (
            <Card>
              <div className="p-5">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Gasto mensual (últimos {months.length} meses)</h4>
                <div className="flex items-end gap-3 h-40">
                  {months.map((m) => {
                    const val = spendByMonth.get(m) ?? 0;
                    const h = (val / maxMonth) * 100;
                    return (
                      <div key={m} className="flex-1 flex flex-col items-center justify-end gap-1">
                        <span className="text-[10px] font-mono text-gray-500">{formatCOP(val)}</span>
                        <div className="w-full bg-suma-500 rounded-t" style={{ height: `${Math.max(2, h)}%` }} />
                        <span className="text-[10px] text-gray-400">{new Date(m).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' })}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          {/* Quién subió más los precios */}
          <Card>
            <div className="p-5 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Variación de precios por proveedor</h4>
              <span className="text-xs text-gray-400">primera vs última compra de cada insumo</span>
            </div>
            {variation.length === 0 ? (
              <div className="px-5 pb-5 text-sm text-gray-500">Aún no hay suficientes compras para comparar precios (se necesita más de una compra por insumo y proveedor).</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="suma-table">
                  <thead><tr><th>Proveedor</th><th>Insumo</th><th>Antes</th><th>Ahora</th><th>Variación</th></tr></thead>
                  <tbody>
                    {variation.map((v, i) => (
                      <tr key={i}>
                        <td className="font-medium">{v.supplier_name ?? '—'}</td>
                        <td>{v.material_name ?? '—'}</td>
                        <td className="font-mono text-sm">{formatCOP(v.first_cost)}</td>
                        <td className="font-mono text-sm">{formatCOP(v.last_cost)}</td>
                        <td>
                          <Badge variant={v.variacion_pct > 0 ? 'red' : 'green'}>
                            {v.variacion_pct > 0 ? '+' : ''}{v.variacion_pct.toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5" /> Tip: compara el gasto y la variación de precios para decidir con qué proveedor te conviene más seguir comprando.
          </p>
        </>
      )}
    </div>
  );
}
