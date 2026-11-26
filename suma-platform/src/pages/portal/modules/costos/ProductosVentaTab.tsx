// ============================================================
// SUMA ERP — Costos / Productos a la Venta (Dashboard BI & Precios)
// Catálogo de productos terminados para la venta, cálculo de margen,
// ganancia en pesos, precios sugeridos y desglose de componentes.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, Search, Eye, Save, RefreshCw,
  Package, Check, Layers2, Filter,
} from 'lucide-react';
import {
  Button, Card, Modal, Badge, EmptyState, Alert, Spinner,
} from '@/components/ui';
import { useActiveCompanyId, useCanEdit } from '@/store/AppStore';
import { formatCOP } from '@/config/brand';
import { supabase } from '@/services/supabase';

interface RecipeLine {
  id: string;
  recipe_id: string;
  line_kind: string;
  name: string;
  qty: number;
  unit: string;
  unit_cost_per_base: number;
  material_id?: string | null;
  depreciation_id?: string | null;
  recipe_ref_id?: string | null;
}

interface ProductSaleItem {
  id: string;
  code: string | null;
  name: string;
  recipe_type: string | null;
  group_id: string | null;
  group_name?: string;
  yield_qty: number;
  yield_unit: string;
  total_cost: number;
  margin_pct: number;           // Porcentaje de ganancia deseado (ej: 100%)
  final_price: number | null;    // Precio digitado/redondeado
  computed_price: number;        // Precio sugerido calculado
  ingredients?: RecipeLine[];
}

export default function ProductosVentaTab() {
  const companyId = useActiveCompanyId();
  const canEdit = useCanEdit();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductSaleItem[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);

  // Filtros
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('');

  // Modo de cálculo de ganancia: 'MARKUP' (Costo + % de costo) o 'MARGIN' (Costo / (1 - %))
  // Por defecto 'MARKUP': Si cuesta $35.000 y se gana el 100%, el precio es $70.000.
  const [calcMode, setCalcMode] = useState<'MARKUP' | 'MARGIN'>('MARKUP');

  // Herramienta de margen masivo
  const [bulkMargin, setBulkMargin] = useState<number | ''>('');

  // Modal de desglose de componentes
  const [viewingProduct, setViewingProduct] = useState<ProductSaleItem | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRes, gRes] = await Promise.all([
        supabase
          .from('recipes')
          .select(`
            id, company_id, code, product, level, recipe_type,
            yield_qty, yield_unit, margin, gateway_fee_pct, total_cost,
            computed_price, final_price, group_id,
            item_groups(name)
          `)
          .eq('level', 2)
          .order('product'),
        supabase.from('item_groups').select('id, name').order('name'),
      ]);

      if (rRes.error) throw rRes.error;

      const recipeIds = (rRes.data ?? []).map((r: any) => r.id);
      let ingsMap: Record<string, RecipeLine[]> = {};

      if (recipeIds.length > 0) {
        const { data: ingData, error: ingErr } = await supabase
          .from('recipe_ingredients')
          .select('id, recipe_id, line_kind, name, qty, unit, unit_cost_per_base, material_id, depreciation_id, recipe_ref_id, sort_order')
          .in('recipe_id', recipeIds)
          .order('sort_order');

        if (!ingErr && ingData) {
          for (const item of ingData) {
            if (!ingsMap[item.recipe_id]) ingsMap[item.recipe_id] = [];
            ingsMap[item.recipe_id].push(item as any);
          }
        }
      }

      setGroups(gRes.data ?? []);
      setProducts(
        (rRes.data ?? []).map((r: any) => {
          const m = r.margin != null ? Number(r.margin) * 100 : 100;
          return {
            id: r.id,
            code: r.code || null,
            name: r.product || '(Sin nombre)',
            recipe_type: r.recipe_type || 'PRODUCTO',
            group_id: r.group_id || null,
            group_name: r.item_groups?.name || 'General',
            yield_qty: r.yield_qty || 1,
            yield_unit: r.yield_unit || 'Und',
            total_cost: Number(r.total_cost) || 0,
            margin_pct: m,
            final_price: r.final_price != null ? Number(r.final_price) : null,
            computed_price: Number(r.computed_price) || 0,
            ingredients: ingsMap[r.id] || [],
          };
        })
      );
    } catch (e: any) {
      setError(e.message || 'Error cargando productos a la venta.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [companyId]);

  // Función para calcular precio sugerido
  const calculateSuggestedPrice = (cost: number, marginPct: number) => {
    if (cost <= 0) return 0;
    if (calcMode === 'MARKUP') {
      // Costo + % de costo: $35.000 + 100% = $70.000
      return Math.round(cost * (1 + marginPct / 100));
    } else {
      // Margen sobre precio de venta: Costo / (1 - %)
      if (marginPct >= 100) return cost * 2;
      return Math.round(cost / (1 - marginPct / 100));
    }
  };

  // Modificar margen de un producto en memoria
  const handleMarginChange = (id: string, newMargin: number) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const suggested = calculateSuggestedPrice(p.total_cost, newMargin);
        return {
          ...p,
          margin_pct: newMargin,
          computed_price: suggested,
          final_price: p.final_price ? p.final_price : suggested,
        };
      })
    );
  };

  // Modificar precio final personalizado de un producto en memoria
  const handleFinalPriceChange = (id: string, newPrice: number | null) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, final_price: newPrice } : p))
    );
  };

  // Aplicar margen masivo a todos los productos visibles
  const handleApplyBulkMargin = () => {
    if (bulkMargin === '' || isNaN(Number(bulkMargin))) return;
    const m = Number(bulkMargin);
    setProducts((prev) =>
      prev.map((p) => {
        const matchesFilter =
          (!filterGroup || p.group_id === filterGroup) &&
          (!search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.code ?? '').toLowerCase().includes(search.toLowerCase()));

        if (!matchesFilter) return p;
        const suggested = calculateSuggestedPrice(p.total_cost, m);
        return {
          ...p,
          margin_pct: m,
          computed_price: suggested,
          final_price: suggested,
        };
      })
    );
  };

  // Guardar todos los cambios en Supabase
  const handleSaveAll = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const p of products) {
        await supabase
          .from('recipes')
          .update({
            margin: p.margin_pct / 100,
            computed_price: p.computed_price || calculateSuggestedPrice(p.total_cost, p.margin_pct),
            final_price: p.final_price || null,
          })
          .eq('id', p.id);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) {
      setError(e.message || 'Error al guardar los precios.');
    } finally {
      setSaving(false);
    }
  };

  // Guardar un producto individual
  const handleSaveSingle = async (p: ProductSaleItem) => {
    try {
      const { error: err } = await supabase
        .from('recipes')
        .update({
          margin: p.margin_pct / 100,
          computed_price: p.computed_price || calculateSuggestedPrice(p.total_cost, p.margin_pct),
          final_price: p.final_price || null,
        })
        .eq('id', p.id);

      if (err) throw err;
      alert(`Precio de "${p.name}" guardado.`);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  // Filtrado de productos
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.code ?? '').toLowerCase().includes(search.toLowerCase());
      const matchGroup = !filterGroup || p.group_id === filterGroup;
      return matchSearch && matchGroup;
    });
  }, [products, search, filterGroup]);

  // Cálculos para Dashboard BI
  const stats = useMemo(() => {
    const count = filteredProducts.length;
    const totalCost = filteredProducts.reduce((s, p) => s + p.total_cost, 0);
    const avgCost = count > 0 ? totalCost / count : 0;
    const totalRevenue = filteredProducts.reduce((s, p) => s + (p.final_price || p.computed_price || p.total_cost), 0);
    const totalProfit = totalRevenue - totalCost;
    const avgMargin = count > 0 ? filteredProducts.reduce((s, p) => s + p.margin_pct, 0) / count : 0;

    return {
      count,
      totalCost,
      avgCost,
      totalRevenue,
      totalProfit,
      avgMargin,
    };
  }, [filteredProducts]);

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      {/* ── Banner Informativo ── */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/60 dark:to-teal-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex gap-3 items-center">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-md">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-emerald-900 dark:text-emerald-100">
                Catálogo de Productos a la Venta & Dashboard de Precios
              </h3>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                Define cuánto porcentaje de ganancia deseas obtener en cada producto. El sistema calcula automáticamente el precio de venta sugerido y la ganancia neta en COP.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button
                onClick={handleSaveAll}
                loading={saving}
                leftIcon={saveSuccess ? <Check className="w-4 h-4 text-green-300" /> : <Save className="w-4 h-4" />}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saveSuccess ? '¡Precios Guardados!' : 'Guardar Todos los Precios'}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={loadData} leftIcon={<RefreshCw className="w-4 h-4" />}>
              Actualizar
            </Button>
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* ── KPIs Dashboard BI ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-xs">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Productos en Venta</p>
          <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{stats.count}</p>
          <span className="text-[11px] text-gray-400">Total en catálogo</span>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-xs">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Costo Promedio</p>
          <p className="text-xl font-bold font-mono text-gray-800 dark:text-gray-200 mt-1">{formatCOP(stats.avgCost)}</p>
          <span className="text-[11px] text-gray-400">Por unidad producida</span>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-xs">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Ganancia Promedio</p>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">+{Math.round(stats.avgMargin)}%</p>
          <span className="text-[11px] text-gray-400">Markup configurado</span>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-xs">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Venta Proyectada</p>
          <p className="text-xl font-bold font-mono text-blue-700 dark:text-blue-300 mt-1">{formatCOP(stats.totalRevenue)}</p>
          <span className="text-[11px] text-gray-400">Total 1 unidad c/u</span>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 shadow-xs">
          <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">Ganancia Bruta</p>
          <p className="text-xl font-black font-mono text-emerald-700 dark:text-emerald-300 mt-1">+{formatCOP(stats.totalProfit)}</p>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">Saldo de utilidad</span>
        </div>
      </div>

      {/* ── Barra de Filtros & Control Masivo ── */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex flex-wrap items-center gap-3 flex-1 w-full lg:w-auto">
            {/* Buscador */}
            <div className="relative min-w-[220px] flex-1 max-w-sm">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto final o código..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Filtro Grupo */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-medium"
              >
                <option value="">Todos los grupos ({products.length})</option>
                {groups.map((g) => {
                  const cnt = products.filter((p) => p.group_id === g.id).length;
                  return (
                    <option key={g.id} value={g.id}>
                      {g.name} ({cnt})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Selector de Modo */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setCalcMode('MARKUP')}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${
                  calcMode === 'MARKUP'
                    ? 'bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-300 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Ejemplo: Costo $35.000 + 100% = $70.000 precio venta"
              >
                Markup (Costo + %)
              </button>
              <button
                type="button"
                onClick={() => setCalcMode('MARGIN')}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${
                  calcMode === 'MARGIN'
                    ? 'bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-300 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Margen comercial estándar: Costo / (1 - %)"
              >
                Margen comercial
              </button>
            </div>
          </div>

          {/* Aplicador masivo de margen */}
          {canEdit && (
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-xl">
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">
                Fijar margen a visibles:
              </span>
              <div className="relative w-20">
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={bulkMargin}
                  onChange={(e) => setBulkMargin(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="100"
                  className="w-full pr-5 pl-2 py-1 text-center font-bold font-mono text-sm rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-300"
                />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">%</span>
              </div>
              <Button size="xs" onClick={handleApplyBulkMargin} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Aplicar
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* ── Tabla Interactiva BI ── */}
      {filteredProducts.length === 0 ? (
        <EmptyState
          icon={<Package className="w-12 h-12 text-gray-300" />}
          title="Sin productos finales registrados"
          description="Carga tus recetas o sube la plantilla de Excel para visualizar los productos y sus precios de venta."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="suma-table">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 font-semibold uppercase">
                  <th>Código</th>
                  <th>Producto Final</th>
                  <th>Grupo</th>
                  <th className="text-center">Composición</th>
                  <th className="text-right">Costo Producción</th>
                  <th className="text-center w-36">% Ganancia</th>
                  <th className="text-right">Ganancia ($ COP)</th>
                  <th className="text-right">Precio Sugerido</th>
                  <th className="text-right w-36">Precio Final</th>
                  <th className="text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredProducts.map((p) => {
                  const suggested = calculateSuggestedPrice(p.total_cost, p.margin_pct);
                  const effectivePrice = p.final_price || suggested;
                  const profitPesos = effectivePrice - p.total_cost;

                  return (
                    <tr key={p.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="font-mono text-xs text-gray-500 font-semibold">
                        {p.code || '—'}
                      </td>
                      <td className="font-bold text-gray-900 dark:text-white">
                        {p.name}
                      </td>
                      <td>
                        <Badge variant="blue" className="text-xs">
                          {p.group_name}
                        </Badge>
                      </td>
                      {/* Botón Detalles / Composición */}
                      <td className="text-center">
                        <Button
                          variant="secondary"
                          size="xs"
                          leftIcon={<Eye className="w-3.5 h-3.5 text-blue-600" />}
                          onClick={() => setViewingProduct(p)}
                          title="Ver qué compone este producto final"
                        >
                          Ver detalle ({p.ingredients?.length ?? 0})
                        </Button>
                      </td>
                      {/* Costo de Producción */}
                      <td className="text-right font-mono font-bold text-gray-700 dark:text-gray-300">
                        {formatCOP(p.total_cost)}
                      </td>
                      {/* Input % Margen deseado */}
                      <td className="text-center">
                        <div className="relative inline-flex items-center w-24">
                          <input
                            type="number"
                            min="0"
                            max="1000"
                            step="5"
                            value={p.margin_pct}
                            onChange={(e) => handleMarginChange(p.id, Number(e.target.value))}
                            className="w-full px-2 py-1 pr-6 font-mono font-bold text-right rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-300 text-sm focus:ring-2 focus:ring-emerald-500"
                          />
                          <span className="absolute right-2 text-xs font-bold text-gray-400">%</span>
                        </div>
                      </td>
                      {/* Ganancia neta en Pesos */}
                      <td className="text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400 text-sm">
                        +{formatCOP(profitPesos)}
                      </td>
                      {/* Precio de venta sugerido */}
                      <td className="text-right font-mono font-black text-gray-900 dark:text-white text-base">
                        {formatCOP(suggested)}
                      </td>
                      {/* Precio final (editable si se desea precio redondo) */}
                      <td className="text-right">
                        <input
                          type="number"
                          value={p.final_price != null ? p.final_price : ''}
                          placeholder={String(suggested)}
                          onChange={(e) => handleFinalPriceChange(p.id, e.target.value === '' ? null : Number(e.target.value))}
                          className="w-full px-2 py-1 text-right font-mono font-bold text-sm rounded border border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 focus:ring-2 focus:ring-emerald-500"
                          title="Precio final al público (puedes digitar un valor redondo como 69900)"
                        />
                      </td>
                      {/* Botón Guardar individual */}
                      <td className="text-center">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleSaveSingle(p)}
                            title="Guardar este precio"
                            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-lg transition-colors"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Modal: Desglose de Componentes del Producto Final ── */}
      <Modal
        isOpen={!!viewingProduct}
        onClose={() => setViewingProduct(null)}
        title={`Composición: ${viewingProduct?.name || ''}`}
        size="2xl"
      >
        {viewingProduct && (
          <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold">Producto</p>
                <p className="text-base font-bold text-gray-900 dark:text-white">{viewingProduct.name}</p>
                <span className="text-xs font-mono text-gray-400">{viewingProduct.code || 'Sin código'}</span>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase font-semibold">Costo Total de Producción</p>
                <p className="text-2xl font-black font-mono text-suma-600 dark:text-suma-400">
                  {formatCOP(viewingProduct.total_cost)}
                </p>
              </div>
            </div>

            <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <Layers2 className="w-4 h-4 text-emerald-600" />
              Ingredientes, Subrecetas N1 y Herramientas que lo componen:
            </h4>

            {(!viewingProduct.ingredients || viewingProduct.ingredients.length === 0) ? (
              <p className="text-sm text-gray-400 italic py-4 text-center">
                Este producto no tiene ingredientes asignados aún.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <table className="suma-table text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      <th>Tipo</th>
                      <th>Componente / Insumo</th>
                      <th className="text-right">Cantidad</th>
                      <th>Unidad</th>
                      <th className="text-right">Costo Unitario</th>
                      <th className="text-right">Costo Línea</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingProduct.ingredients.map((ing, idx) => {
                      const lineCost = ing.qty * ing.unit_cost_per_base;
                      return (
                        <tr key={idx}>
                          <td>
                            <Badge
                              variant={
                                ing.line_kind === 'RECETA_N1'
                                  ? 'yellow'
                                  : ing.line_kind === 'DEPRECIACION'
                                  ? 'purple'
                                  : 'blue'
                              }
                              className="text-[10px]"
                            >
                              {ing.line_kind === 'RECETA_N1'
                                ? 'Subreceta N1'
                                : ing.line_kind === 'DEPRECIACION'
                                ? 'Depreciación'
                                : 'Insumo Base'}
                            </Badge>
                          </td>
                          <td className="font-semibold text-gray-900 dark:text-white">
                            {ing.name}
                          </td>
                          <td className="text-right font-mono font-medium">{ing.qty}</td>
                          <td>{ing.unit}</td>
                          <td className="text-right font-mono text-gray-500">
                            {formatCOP(ing.unit_cost_per_base)}
                          </td>
                          <td className="text-right font-mono font-bold text-gray-900 dark:text-white">
                            {formatCOP(lineCost)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setViewingProduct(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
