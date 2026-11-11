// ============================================================
// SUMA Platform — Módulo Inventarios
// ============================================================
import { useState, useEffect } from 'react';
import {
  Package, Plus, Search, Edit2, Trash2,
  AlertTriangle, Save, RefreshCw,
} from 'lucide-react';
import {
  Button, Card, Field, SelectField,
  Modal, Badge, EmptyState, Alert, StatCard, Spinner,
} from '@/components/ui';
import { useAppStore } from '@/store/AppStore';
import { formatCOP } from '@/config/brand';
import {
  fetchInventoryItems, createInventoryItem,
  updateInventoryItem, deleteInventoryItem,
} from '@/services/supabaseDataProvider';
import { MOCK_INVENTORY_ITEMS } from '@/data/mocks';
import type { InventoryItem } from '@/types/domain';

const UNITS = ['Gr', 'Ml', 'Kg', 'Lt', 'Lb', 'Und', 'Mt', 'Gt'];
const GROUPS = ['CERA', 'FRAGANCIAS', 'COLORANTES', 'MOLDES', 'EMPAQUES', 'ETIQUETAS Y PAPELERÍA', 'MATERIALES', 'ASEO', 'PEBETEROS', 'Otro'];

function ItemForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<InventoryItem>;
  onSave: (item: Omit<InventoryItem, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    sku: initial?.sku ?? '',
    name: initial?.name ?? '',
    base_unit: initial?.base_unit ?? 'Gr',
    unit_cost_per_base: initial?.unit_cost_per_base ?? 0,
    group_name: initial?.group_name ?? '',
    supplier: initial?.supplier ?? '',
    stock: initial?.stock ?? 0,
    stock_min: initial?.stock_min ?? 0,
    company_id: initial?.company_id ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { state } = useAppStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.base_unit) {
      setError('Nombre y unidad base son obligatorios.');
      return;
    }
    setLoading(true);
    try {
      await onSave({ ...form, company_id: state.company?.id ?? '' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      {error && <Alert type="error">{error}</Alert>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="CER-SOY-001" />
        <Field label="Nombre del insumo" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cera de Soya APF" />
        <SelectField label="Unidad base" required value={form.base_unit} onChange={(e) => setForm({ ...form, base_unit: e.target.value })}>
          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </SelectField>
        <Field
          label="Costo por unidad base (COP)"
          type="number"
          required
          value={form.unit_cost_per_base}
          onChange={(e) => setForm({ ...form, unit_cost_per_base: parseFloat(e.target.value) || 0 })}
          placeholder="20.36"
          step="0.01"
          hint={`Ej: si compras 1 Kg a $20.000, costo/Gr = 20`}
        />
        <SelectField label="Grupo de inventario" value={form.group_name ?? ''} onChange={(e) => setForm({ ...form, group_name: e.target.value })}>
          <option value="">Sin grupo</option>
          {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </SelectField>
        <Field label="Proveedor" value={form.supplier ?? ''} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="CreaLuz" />
        <Field label="Stock actual" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: parseFloat(e.target.value) || 0 })} />
        <Field label="Stock mínimo" type="number" value={form.stock_min} onChange={(e) => setForm({ ...form, stock_min: parseFloat(e.target.value) || 0 })} />
      </div>
      <div className="flex gap-3 justify-end pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" loading={loading} leftIcon={<Save className="w-4 h-4" />}>
          {initial?.id ? 'Guardar cambios' : 'Crear insumo'}
        </Button>
      </div>
    </form>
  );
}

export default function InventariosModule() {
  const { state } = useAppStore();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const [error, setError] = useState('');
  const [isDemo, setIsDemo] = useState(false);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await fetchInventoryItems();
      if (data.length === 0 && !state.company?.id) {
        // Demo mode
        setItems(MOCK_INVENTORY_ITEMS);
        setIsDemo(true);
      } else {
        setItems(data);
        setIsDemo(false);
      }
    } catch {
      setItems(MOCK_INVENTORY_ITEMS);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadItems(); }, []);

  const filtered = items.filter((item) => {
    const matchSearch = !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.sku ?? '').toLowerCase().includes(search.toLowerCase());
    const matchGroup = !groupFilter || item.group_name === groupFilter;
    return matchSearch && matchGroup;
  });

  const handleCreate = async (item: Omit<InventoryItem, 'id' | 'created_at' | 'updated_at'>) => {
    await createInventoryItem(item, state.company?.id ?? '');
    setShowModal(false);
    loadItems();
  };

  const handleUpdate = async (item: Omit<InventoryItem, 'id' | 'created_at' | 'updated_at'>) => {
    if (!editing) return;
    await updateInventoryItem(editing.id, item);
    setEditing(null);
    loadItems();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await deleteInventoryItem(deleting.id);
    setDeleting(null);
    loadItems();
  };

  const lowStock = items.filter((i) => i.stock <= i.stock_min && i.stock_min > 0).length;
  const totalValue = items.reduce((sum, i) => sum + i.unit_cost_per_base * i.stock, 0);
  const groups = [...new Set(items.map((i) => i.group_name).filter(Boolean))];

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Package className="w-6 h-6 text-suma-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inventarios</h1>
            {isDemo && <Badge variant="yellow">Modo demo</Badge>}
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Control de insumos y materias primas. El costo/unidad base se usa en recetas.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={loadItems} leftIcon={<RefreshCw className="w-4 h-4" />}>
            Actualizar
          </Button>
          <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>
            Nuevo insumo
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="Total de insumos"
          value={items.length}
          icon={<Package className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="Stock bajo"
          value={lowStock}
          subtitle="Bajo el mínimo"
          icon={<AlertTriangle className="w-5 h-5" />}
          color={lowStock > 0 ? 'red' : 'green'}
        />
        <StatCard
          title="Valor del inventario"
          value={formatCOP(totalValue)}
          icon={<Package className="w-5 h-5" />}
          color="purple"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar insumo o SKU..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-suma-500"
          />
        </div>
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-suma-500"
        >
          <option value="">Todos los grupos</option>
          {groups.map((g) => <option key={g} value={g!}>{g}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <Card>
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Package className="w-12 h-12" />}
            title="Sin insumos"
            description="Agrega insumos manualmente o impórtalos desde Excel."
            action={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>Nuevo insumo</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="suma-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Nombre</th>
                  <th>Grupo</th>
                  <th>Unidad base</th>
                  <th>Costo/unidad</th>
                  <th>Stock</th>
                  <th>Proveedor</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isLow = item.stock <= item.stock_min && item.stock_min > 0;
                  return (
                    <tr key={item.id}>
                      <td className="text-xs font-mono text-gray-500">{item.sku ?? '—'}</td>
                      <td className="font-medium text-gray-900 dark:text-white">{item.name}</td>
                      <td>
                        {item.group_name ? (
                          <Badge variant="gray">{item.group_name}</Badge>
                        ) : '—'}
                      </td>
                      <td>{item.base_unit}</td>
                      <td className="font-mono text-sm">{formatCOP(item.unit_cost_per_base)}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <span className={isLow ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
                            {item.stock} {item.base_unit}
                          </span>
                          {isLow && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                        </div>
                      </td>
                      <td className="text-gray-500 text-sm">{item.supplier ?? '—'}</td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setEditing(item)}
                            className="p-1.5 text-gray-400 hover:text-suma-600 hover:bg-suma-50 dark:hover:bg-suma-950 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleting(item)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal crear */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Nuevo insumo" size="lg">
        <ItemForm onSave={handleCreate} onCancel={() => setShowModal(false)} />
      </Modal>

      {/* Modal editar */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Editar insumo" size="lg">
        {editing && (
          <ItemForm initial={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} />
        )}
      </Modal>

      {/* Modal eliminar */}
      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Eliminar insumo" size="sm">
        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            ¿Estás seguro de eliminar <strong>{deleting?.name}</strong>?
            Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="danger" onClick={handleDelete} leftIcon={<Trash2 className="w-4 h-4" />}>
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
