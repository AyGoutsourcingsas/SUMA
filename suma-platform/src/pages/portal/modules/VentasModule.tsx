// ============================================================
// SUMA Platform — Módulo Ventas
// ============================================================
import React, { useState, useEffect } from 'react';
import {
  TrendingUp, Plus, Search, Calendar, DollarSign,
  ShoppingBag, Trash2, RefreshCw, CheckCircle, Tag
} from 'lucide-react';
import {
  Button, Card, CardHeader, CardBody, Field, SelectField,
  Modal, Badge, EmptyState, Alert, StatCard, Spinner
} from '@/components/ui';
import { useAppStore } from '@/store/AppStore';
import { formatCOP, formatPercent } from '@/config/brand';
import {
  fetchSales, createSale, deleteSale, fetchRecipes
} from '@/services/supabaseDataProvider';
import type { Sale, Recipe } from '@/types/domain';

const CHANNELS = [
  'PÁGINA SAAS B2B',
  'WHATSAPP',
  'FERIAS',
  'MERCADO LIBRE',
  'INSTAGRAM',
  'TIENDA FÍSICA',
  'OTRO',
];

export default function VentasModule() {
  const { state } = useAppStore();
  const [sales, setSales] = useState<Sale[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deletingSale, setDeletingSale] = useState<Sale | null>(null);

  // Formulario de venta
  const [formRecipeId, setFormRecipeId] = useState('');
  const [formProduct, setFormProduct] = useState('');
  const [formQty, setFormQty] = useState<number>(1);
  const [formPrice, setFormPrice] = useState<number>(0);
  const [formChannel, setFormChannel] = useState('WHATSAPP');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [salesData, recipesData] = await Promise.all([
        fetchSales(),
        fetchRecipes(),
      ]);
      setSales(salesData);
      setRecipes(recipesData);
    } catch {
      // Fallback a demo si Supabase no está conectado
      setSales([
        {
          id: 'v1',
          company_id: 'demo',
          product_name: 'Vela de Soya Lavanda Negra',
          qty: 2,
          sale_price: 25000,
          total_revenue: 50000,
          total_cost: 18782,
          profit: 31218,
          margin_actual: 0.624,
          channel: 'WHATSAPP',
          sold_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectRecipe = (recipeId: string) => {
    setFormRecipeId(recipeId);
    const rec = recipes.find((r) => r.id === recipeId);
    if (rec) {
      setFormProduct(rec.product);
      setFormPrice(rec.min_sale_price || rec.total_cost || 0);
    }
  };

  const selectedRecipe = recipes.find((r) => r.id === formRecipeId);
  const unitCost = selectedRecipe?.total_cost || 0;
  const currentTotalCost = unitCost * formQty;
  const currentTotalRevenue = formPrice * formQty;
  const currentProfit = currentTotalRevenue - currentTotalCost;
  const currentMargin = currentTotalRevenue > 0 ? currentProfit / currentTotalRevenue : 0;

  const handleCreateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProduct) {
      setError('Selecciona o ingresa un producto.');
      return;
    }
    if (formPrice <= 0 || formQty <= 0) {
      setError('La cantidad y precio deben ser mayores a cero.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const companyId = state.company?.id || 'demo';
      await createSale(
        {
          company_id: companyId,
          recipe_id: formRecipeId || undefined,
          product_name: formProduct,
          qty: formQty,
          sale_price: formPrice,
          total_cost: currentTotalCost,
          profit: currentProfit,
          margin_actual: currentMargin,
          channel: formChannel,
          notes: formNotes || undefined,
          sold_at: new Date().toISOString(),
        },
        companyId
      );
      setShowModal(false);
      // Reset form
      setFormRecipeId('');
      setFormProduct('');
      setFormQty(1);
      setFormPrice(0);
      setFormNotes('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Error al registrar venta.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingSale) return;
    try {
      await deleteSale(deletingSale.id);
      setDeletingSale(null);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filteredSales = sales.filter((s) => {
    const matchSearch = s.product_name.toLowerCase().includes(search.toLowerCase());
    const matchChannel = !channelFilter || s.channel === channelFilter;
    return matchSearch && matchChannel;
  });

  const totalIngresos = sales.reduce((acc, s) => acc + (s.total_revenue || 0), 0);
  const totalGanancia = sales.reduce((acc, s) => acc + (s.profit || 0), 0);
  const margenPromedio = totalIngresos > 0 ? totalGanancia / totalIngresos : 0;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <TrendingUp className="w-6 h-6 text-suma-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ventas & Rentabilidad</h1>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Registra tus ventas, analiza canales de distribución y monitorea tus ganancias reales.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={loadData} leftIcon={<RefreshCw className="w-4 h-4" />}>
            Actualizar
          </Button>
          <Button size="sm" onClick={() => setShowModal(true)} leftIcon={<Plus className="w-4 h-4" />}>
            Registrar Venta
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="Ingresos Totales"
          value={formatCOP(totalIngresos)}
          subtitle={`${sales.length} transacciones`}
          icon={<DollarSign className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="Ganancia Neta"
          value={formatCOP(totalGanancia)}
          subtitle="Ingresos menos costo de insumos"
          icon={<ShoppingBag className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          title="Margen Real Obtenido"
          value={formatPercent(margenPromedio)}
          subtitle="Rentabilidad neta sobre ventas"
          icon={<TrendingUp className="w-5 h-5" />}
          color="purple"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por producto..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-suma-500"
          />
        </div>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
        >
          <option value="">Todos los canales</option>
          {CHANNELS.map((ch) => (
            <option key={ch} value={ch}>{ch}</option>
          ))}
        </select>
      </div>

      {/* Tabla de ventas */}
      <Card>
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : filteredSales.length === 0 ? (
          <EmptyState
            icon={<TrendingUp className="w-12 h-12" />}
            title="Sin registros de ventas"
            description="Registra tus primeras ventas para calcular tus ganancias y márgenes reales."
            action={
              <Button onClick={() => setShowModal(true)} leftIcon={<Plus className="w-4 h-4" />}>
                Registrar Venta
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="suma-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Canal</th>
                  <th>Cant.</th>
                  <th>Precio Venta</th>
                  <th>Total Ingreso</th>
                  <th>Costo Insumos</th>
                  <th>Ganancia</th>
                  <th>Margen</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((s) => (
                  <tr key={s.id}>
                    <td className="text-xs text-gray-500">
                      {new Date(s.sold_at).toLocaleDateString('es-CO')}
                    </td>
                    <td className="font-semibold text-gray-900 dark:text-white">
                      {s.product_name}
                    </td>
                    <td>
                      <Badge variant="blue">{s.channel || 'DIRECTA'}</Badge>
                    </td>
                    <td className="font-medium">{s.qty}</td>
                    <td className="font-mono text-sm">{formatCOP(s.sale_price)}</td>
                    <td className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                      {formatCOP(s.total_revenue)}
                    </td>
                    <td className="font-mono text-xs text-red-500">
                      {formatCOP(s.total_cost || 0)}
                    </td>
                    <td className="font-mono text-sm font-bold text-green-600 dark:text-green-400">
                      {formatCOP(s.profit || 0)}
                    </td>
                    <td>
                      <Badge variant={s.margin_actual >= 0.3 ? 'green' : 'yellow'}>
                        {formatPercent(s.margin_actual || 0)}
                      </Badge>
                    </td>
                    <td>
                      <button
                        onClick={() => setDeletingSale(s)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal Registrar Venta */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Registrar Nueva Venta" size="lg">
        <form onSubmit={handleCreateSale} className="p-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Producto o Receta Costeada
            </label>
            <select
              value={formRecipeId}
              onChange={(e) => handleSelectRecipe(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            >
              <option value="">-- Seleccionar producto de Fichas/Costos --</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.product} (Costo: {formatCOP(r.total_cost || 0)} | PVP Mínimo: {formatCOP(r.min_sale_price || 0)})
                </option>
              ))}
            </select>
          </div>

          {!formRecipeId && (
            <Field
              label="O escribe el Nombre del Producto"
              required
              value={formProduct}
              onChange={(e) => setFormProduct(e.target.value)}
              placeholder="Ej. Kit Pokewax, Velas de Té x100..."
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Cantidad vendida"
              type="number"
              min="1"
              required
              value={formQty}
              onChange={(e) => setFormQty(parseFloat(e.target.value) || 1)}
            />
            <Field
              label="Precio unitario de venta (COP)"
              type="number"
              required
              value={formPrice}
              onChange={(e) => setFormPrice(parseFloat(e.target.value) || 0)}
              hint={selectedRecipe?.min_sale_price ? `PVP Sugerido: ${formatCOP(selectedRecipe.min_sale_price)}` : undefined}
            />
          </div>

          <SelectField
            label="Canal de Venta"
            value={formChannel}
            onChange={(e) => setFormChannel(e.target.value)}
          >
            {CHANNELS.map((ch) => (
              <option key={ch} value={ch}>{ch}</option>
            ))}
          </SelectField>

          <Field
            label="Notas / Cliente"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="Ej. Pedido #1024 - Cliente recurrente"
          />

          {/* Resumen dinámico */}
          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl space-y-2 text-sm border border-gray-200 dark:border-gray-800">
            <div className="flex justify-between">
              <span className="text-gray-500">Ingreso Total:</span>
              <span className="font-mono font-bold text-gray-900 dark:text-white">{formatCOP(currentTotalRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Costo Estimado de Insumos:</span>
              <span className="font-mono text-red-500">{formatCOP(currentTotalCost)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 dark:border-gray-800 pt-2">
              <span className="font-semibold text-gray-700 dark:text-gray-300">Ganancia Neta:</span>
              <span className="font-mono font-bold text-green-600 dark:text-green-400">{formatCOP(currentProfit)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Margen Real:</span>
              <span className="font-semibold">{formatPercent(currentMargin)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving} leftIcon={<CheckCircle className="w-4 h-4" />}>
              Guardar Venta
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Eliminar */}
      <Modal isOpen={!!deletingSale} onClose={() => setDeletingSale(null)} title="Eliminar Venta" size="sm">
        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            ¿Eliminar el registro de venta de <strong>{deletingSale?.product_name}</strong>?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeletingSale(null)}>Cancelar</Button>
            <Button variant="danger" onClick={handleDelete} leftIcon={<Trash2 className="w-4 h-4" />}>Eliminar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
