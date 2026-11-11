// ============================================================
// SUMA ERP — Módulo VENTAS
// Registra ventas tomando precio/costo de Costos (snapshot).
// Al confirmar, descuenta inventario por la receta (kárdex, trigger 006).
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, Plus, Search, DollarSign, ShoppingBag,
  RefreshCw, CheckCircle, Ban,
} from 'lucide-react';
import {
  Button, Card, Field, SelectField, Modal, Badge, EmptyState, Alert, StatCard, Spinner,
} from '@/components/ui';
import { useAppStore, useCanEdit, useIsSuperAdmin } from '@/store/AppStore';
import { formatCOP, formatPercent } from '@/config/brand';
import {
  fetchRecipesForSale, fetchSales, createSale, voidSale,
  type SaleRecord, type RecipeForSale,
} from '@/services/modules/ventas';
import { fetchLocations, type Location } from '@/services/modules/inventario';

const CHANNELS = ['PÁGINA SAAS B2B', 'WHATSAPP', 'FERIAS', 'MERCADO LIBRE', 'INSTAGRAM', 'TIENDA FÍSICA', 'OTRO'];

export default function VentasModule() {
  const { state } = useAppStore();
  const canEdit = useCanEdit();
  const isSuperAdmin = useIsSuperAdmin();
  const companyId = state.company?.id ?? '';

  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [recipes, setRecipes] = useState<RecipeForSale[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [voidingSale, setVoidingSale] = useState<SaleRecord | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, r, l] = await Promise.all([fetchSales(), fetchRecipesForSale(), fetchLocations()]);
      setSales(s);
      setRecipes(r);
      setLocations(l);
    } catch {
      setError('No se pudieron cargar las ventas. Verifica que aplicaste las migraciones (incluida la 006) y que tu usuario tiene empresa asignada.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filteredSales = useMemo(() => sales.filter((s) => {
    const matchSearch = s.product_name.toLowerCase().includes(search.toLowerCase());
    const matchChannel = !channelFilter || s.channel === channelFilter;
    return matchSearch && matchChannel;
  }), [sales, search, channelFilter]);

  // Totales (excluyen anuladas)
  const stats = useMemo(() => {
    const active = sales.filter((s) => s.status !== 'anulada');
    const ingresos = active.reduce((a, s) => a + (s.sale_price * s.qty - (s.discount || 0)), 0);
    const ganancia = active.reduce((a, s) => a + (s.profit || 0), 0);
    const margen = ingresos > 0 ? ganancia / ingresos : 0;
    return { ingresos, ganancia, margen, count: active.length };
  }, [sales]);

  if (loading) {
    return <div className="page-container flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  return (
    <div className="page-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <TrendingUp className="w-6 h-6 text-suma-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ventas & Rentabilidad</h1>
            {isSuperAdmin && <Badge variant="purple">Revisión SUMA</Badge>}
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Registra ventas con el precio y costo de tus recetas. Al confirmar, el inventario
            se descuenta automáticamente según la receta del producto.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={loadData} leftIcon={<RefreshCw className="w-4 h-4" />}>Actualizar</Button>
          {canEdit && <Button size="sm" onClick={() => setShowModal(true)} leftIcon={<Plus className="w-4 h-4" />}>Registrar venta</Button>}
        </div>
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard title="Ingresos (sin anuladas)" value={formatCOP(stats.ingresos)} subtitle={`${stats.count} ventas`} icon={<DollarSign className="w-5 h-5" />} color="blue" />
        <StatCard title="Ganancia neta" value={formatCOP(stats.ganancia)} subtitle="Ingresos − costo de insumos" icon={<ShoppingBag className="w-5 h-5" />} color="green" />
        <StatCard title="Margen real" value={formatPercent(stats.margen)} subtitle="Rentabilidad sobre ventas" icon={<TrendingUp className="w-5 h-5" />} color="purple" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por producto..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-suma-500" />
        </div>
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
          <option value="">Todos los canales</option>
          {CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
        </select>
      </div>

      <Card>
        {filteredSales.length === 0 ? (
          <EmptyState icon={<TrendingUp className="w-12 h-12" />} title="Sin ventas registradas"
            description={canEdit ? 'Registra tu primera venta para calcular ganancias y descontar inventario.' : 'Aún no hay ventas registradas.'}
            action={canEdit ? <Button onClick={() => setShowModal(true)} leftIcon={<Plus className="w-4 h-4" />}>Registrar venta</Button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="suma-table">
              <thead><tr>
                <th>Fecha</th><th>Producto</th><th>Canal</th><th>Cant.</th><th>Precio</th>
                <th>Ingreso</th><th>Costo</th><th>Ganancia</th><th>Margen</th><th>Estado</th><th></th>
              </tr></thead>
              <tbody>
                {filteredSales.map((s) => {
                  const ingreso = s.sale_price * s.qty - (s.discount || 0);
                  const anulada = s.status === 'anulada';
                  return (
                    <tr key={s.id} className={anulada ? 'opacity-50 line-through' : ''}>
                      <td className="text-xs text-gray-500">{new Date(s.sold_at).toLocaleDateString('es-CO')}</td>
                      <td className="font-semibold text-gray-900 dark:text-white">{s.product_name}</td>
                      <td><Badge variant="blue">{s.channel || 'DIRECTA'}</Badge></td>
                      <td className="font-medium">{s.qty}</td>
                      <td className="font-mono text-sm">{formatCOP(s.sale_price)}</td>
                      <td className="font-mono text-sm font-semibold">{formatCOP(ingreso)}</td>
                      <td className="font-mono text-xs text-red-500">{formatCOP(s.total_cost || 0)}</td>
                      <td className="font-mono text-sm font-bold text-green-600 dark:text-green-400">{formatCOP(s.profit || 0)}</td>
                      <td><Badge variant={s.margin_actual >= 0.3 ? 'green' : 'yellow'}>{formatPercent(s.margin_actual || 0)}</Badge></td>
                      <td>{anulada ? <Badge variant="red">Anulada</Badge> : <Badge variant="green">Confirmada</Badge>}</td>
                      <td>
                        {canEdit && !anulada && (
                          <button onClick={() => setVoidingSale(s)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Anular venta">
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showModal && (
        <SaleForm companyId={companyId} recipes={recipes} locations={locations}
          onClose={() => setShowModal(false)}
          onSaved={async () => { setShowModal(false); await loadData(); }} />
      )}

      <Modal isOpen={!!voidingSale} onClose={() => setVoidingSale(null)} title="Anular venta" size="sm">
        <div className="p-6">
          <p className="mb-2">¿Anular la venta de <strong>{voidingSale?.product_name}</strong>?</p>
          <p className="text-xs text-gray-500 mb-6">La venta no se borra: se marca como anulada y el inventario consumido se devuelve.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVoidingSale(null)}>Cancelar</Button>
            <Button variant="danger" onClick={async () => { if (voidingSale) { await voidSale(voidingSale.id); setVoidingSale(null); await loadData(); } }} leftIcon={<Ban className="w-4 h-4" />}>Anular</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────
// Formulario de venta
// ─────────────────────────────────────────
function SaleForm({ companyId, recipes, locations, onClose, onSaved }: {
  companyId: string; recipes: RecipeForSale[]; locations: Location[];
  onClose: () => void; onSaved: () => void;
}) {
  const [recipeId, setRecipeId] = useState('');
  const [productName, setProductName] = useState('');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [channel, setChannel] = useState('WHATSAPP');
  const [locationId, setLocationId] = useState(locations.find((l) => l.is_default)?.id ?? locations[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = recipes.find((r) => r.id === recipeId);
  const unitCost = selected?.computed_cost ?? 0;

  const onSelectRecipe = (id: string) => {
    setRecipeId(id);
    const r = recipes.find((x) => x.id === id);
    if (r) {
      setProductName(r.product);
      setPrice((r.final_price ?? r.computed_price) || 0);
    }
  };

  const ingreso = price * qty - discount;
  const costoTotal = unitCost * qty;
  const ganancia = ingreso - costoTotal;
  const margen = ingreso > 0 ? ganancia / ingreso : 0;

  const save = async () => {
    if (!productName.trim()) { setErr('Selecciona o escribe un producto.'); return; }
    if (price <= 0 || qty <= 0) { setErr('Cantidad y precio deben ser mayores a 0.'); return; }
    setSaving(true); setErr(null);
    try {
      await createSale(companyId, {
        recipe_id: recipeId || null,
        product_name: productName.trim(),
        qty, sale_price: price, unit_cost: unitCost, discount,
        channel, location_id: locationId || null, notes: notes || null,
      });
      onSaved();
    } catch (e) { setErr((e as Error).message || 'No se pudo registrar la venta.'); } finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title="Registrar venta" size="lg">
      <div className="p-6 space-y-4">
        {err && <Alert type="error">{err}</Alert>}

        <SelectField label="Producto / receta costeada" value={recipeId} onChange={(e) => onSelectRecipe(e.target.value)}>
          <option value="">-- Elige una receta de Costos --</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.product} (costo {formatCOP(r.computed_cost)} · precio {formatCOP((r.final_price ?? r.computed_price) || 0)})
            </option>
          ))}
        </SelectField>

        {!recipeId && (
          <Field label="O escribe el nombre del producto" required value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Ej. Kit Pokewax" />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Cantidad" type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          <Field label="Precio unitario (COP)" type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))}
            hint={selected ? `Sugerido: ${formatCOP((selected.final_price ?? selected.computed_price) || 0)}` : undefined} />
          <Field label="Descuento total (COP)" type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
          <SelectField label="Canal" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
          </SelectField>
          <SelectField label="Sede" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </SelectField>
          <Field label="Notas / cliente" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Pedido #1024" />
        </div>

        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl space-y-1.5 text-sm border border-gray-200 dark:border-gray-800">
          <div className="flex justify-between"><span className="text-gray-500">Ingreso:</span><span className="font-mono font-bold">{formatCOP(ingreso)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Costo insumos:</span><span className="font-mono text-red-500">{formatCOP(costoTotal)}</span></div>
          <div className="flex justify-between border-t border-gray-200 dark:border-gray-800 pt-1.5"><span className="font-semibold">Ganancia:</span><span className="font-mono font-bold text-green-600 dark:text-green-400">{formatCOP(ganancia)}</span></div>
          <div className="flex justify-between text-xs"><span className="text-gray-500">Margen:</span><span className="font-semibold">{formatPercent(margen)}</span></div>
        </div>

        {recipeId && (
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-green-500" /> Al guardar, los insumos de esta receta se descuentan del inventario.
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={saving} leftIcon={<CheckCircle className="w-4 h-4" />}>Guardar venta</Button>
        </div>
      </div>
    </Modal>
  );
}
