// ============================================================
// SUMA ERP — Módulo INVENTARIO (sedes, grupos, stock, kárdex)
// Multiempresa -> sedes -> grupos -> materiales. Stock por
// movimientos (kárdex). Alimenta el costo de las recetas (Costos).
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import {
  Package, Plus, Search, RefreshCw, FolderPlus, Folder, X,
  ShoppingCart, SlidersHorizontal, ListFilter, Boxes, Building2,
  AlertTriangle, Save, FileText, History, Download, Settings2, Users, Upload,
} from 'lucide-react';
import {
  Button, Card, Field, SelectField, Modal, Badge, EmptyState, Alert, Spinner, StatCard,
} from '@/components/ui';
import { useActiveCompanyId, useCanEdit, useIsSuperAdmin } from '@/store/AppStore';
import { formatCOP } from '@/config/brand';
import {
  fetchUnits, fetchGroups, createGroup, deleteGroup, fetchSuppliers, createSupplier,
  fetchLocations, createLocation, fetchMaterials, createMaterial,
  fetchStockSummary, createPurchase, createAdjustment, fetchMovements,
  fetchCostPolicy, setCostPolicy, setMaterialCostOverrides, fetchCostHistory,
  COST_POLICY_LABEL,
  type StockRow, type StockStatus, type Location, type InventoryMovement, type MovementType,
  type CostPolicy, type CostHistoryRow,
} from '@/services/modules/inventario';
import { downloadAsExcel } from '@/lib/excelExport';
import { ProveedoresDashboard } from './ProveedoresDashboard';
import { ExcelImporterModal } from '@/components/costos/ExcelImporterModal';
import { downloadPlantillaSUMA } from '@/lib/plantillaImportacion';
import type { ItemGroup, Supplier, Unit, Material } from '@/types/domain';

type Tab = 'stock' | 'movimientos' | 'costos' | 'proveedores';

const STATUS_BADGE: Record<StockStatus, 'green' | 'yellow' | 'red'> = {
  OK: 'green', REPONER: 'yellow', AGOTADO: 'red',
};
const MOVEMENT_LABEL: Record<MovementType, string> = {
  ENTRADA_COMPRA: 'Entrada (compra)',
  SALIDA_VENTA: 'Salida (venta)',
  REVERSO_VENTA: 'Reverso venta',
  AJUSTE: 'Ajuste',
  SALIDA_PRODUCCION: 'Salida (producción)',
  TRASLADO: 'Traslado',
};

export default function InventariosModule() {
  const canEdit = useCanEdit();
  const isSuperAdmin = useIsSuperAdmin();
  const companyId = useActiveCompanyId();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('stock');

  const [units, setUnits] = useState<Unit[]>([]);
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [costPolicy, setCostPolicyState] = useState<CostPolicy>('ULTIMA_COMPRA');

  // Filtros
  const [activeGroup, setActiveGroup] = useState<string | 'all'>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | StockStatus>('all');
  const [movType, setMovType] = useState<'all' | MovementType>('all');
  const [movFrom, setMovFrom] = useState('');
  const [movTo, setMovTo] = useState('');

  // Modales
  const [showGroup, setShowGroup] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [groupError, setGroupError] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [newLocation, setNewLocation] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showMaterial, setShowMaterial] = useState(false);
  const [showPurchase, setShowPurchase] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showImporter, setShowImporter] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, g, s, l, m, st, pol] = await Promise.all([
        fetchUnits(), fetchGroups(), fetchSuppliers(), fetchLocations(),
        fetchMaterials(), fetchStockSummary(),
        companyId ? fetchCostPolicy(companyId) : Promise.resolve('ULTIMA_COMPRA' as CostPolicy),
      ]);
      setUnits(u); setGroups(g); setSuppliers(s); setLocations(l);
      setMaterials(m); setStock(st); setCostPolicyState(pol);
    } catch {
      setError('No se pudieron cargar los datos. Verifica que aplicaste las migraciones 003, 004 y 005 en Supabase y que tu usuario tiene empresa asignada.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const loadMovements = async () => {
    try {
      const data = await fetchMovements({
        type: movType === 'all' ? undefined : movType,
        from: movFrom || undefined,
        to: movTo || undefined,
      });
      setMovements(data);
    } catch {
      setError('No se pudieron cargar los movimientos.');
    }
  };

  useEffect(() => {
    if (tab === 'movimientos') loadMovements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, movType, movFrom, movTo]);

  // Stock filtrado
  const filteredStock = useMemo(() => {
    return stock.filter((r) => {
      const inGroup = activeGroup === 'all' || r.group_id === activeGroup;
      const matchesSearch =
        r.material_name.toLowerCase().includes(search.toLowerCase()) ||
        (r.code ?? '').toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      return inGroup && matchesSearch && matchesStatus;
    });
  }, [stock, activeGroup, search, statusFilter]);

  const stats = useMemo(() => {
    const total = stock.length;
    const low = stock.filter((r) => r.status !== 'OK').length;
    const value = stock.reduce((acc, r) => acc + (r.stock_value || 0), 0);
    return { total, low, value };
  }, [stock]);

  const materialName = (id: string) => materials.find((m) => m.id === id)?.name ?? '—';

  if (loading) {
    return <div className="page-container flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Package className="w-6 h-6 text-suma-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inventario</h1>
            {isSuperAdmin && <Badge variant="purple">Revisión SUMA</Badge>}
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Controla el stock por sede y grupo. El costo de cada compra actualiza el precio de
            los insumos que usan tus recetas en Costos.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={loadAll} leftIcon={<RefreshCw className="w-4 h-4" />}>Actualizar</Button>
          {canEdit && <Button size="sm" onClick={() => setShowMaterial(true)} leftIcon={<Plus className="w-4 h-4" />}>Nuevo insumo</Button>}
          {canEdit && <Button size="sm" variant="secondary" onClick={() => downloadPlantillaSUMA()} leftIcon={<Download className="w-4 h-4" />}>Descargar plantilla</Button>}
          {canEdit && <Button size="sm" variant="secondary" onClick={() => setShowImporter(true)} leftIcon={<Upload className="w-4 h-4" />}>Importar Excel</Button>}
          {canEdit && <Button size="sm" variant="secondary" onClick={() => setShowPurchase(true)} leftIcon={<ShoppingCart className="w-4 h-4" />}>Registrar compra</Button>}
          {canEdit && <Button size="sm" variant="secondary" onClick={() => setShowAdjust(true)} leftIcon={<SlidersHorizontal className="w-4 h-4" />}>Ajuste</Button>}
        </div>
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      {/* Sedes + Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <StatCard title="Insumos activos" value={stats.total} icon={<Boxes className="w-5 h-5" />} color="blue" />
        <StatCard title="Por reponer / agotados" value={stats.low} icon={<AlertTriangle className="w-5 h-5" />} color="orange" />
        <StatCard title="Valor del inventario" value={formatCOP(stats.value)} icon={<Package className="w-5 h-5" />} color="green" />
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <Building2 className="w-5 h-5 text-gray-400" />
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Sedes</p>
            <p className="text-sm font-semibold truncate">{locations.length} activa(s)</p>
          </div>
          {canEdit && (
            <button onClick={() => setShowLocation(true)} className="ml-auto p-1 text-suma-600 hover:bg-suma-50 dark:hover:bg-suma-950 rounded" title="Nueva sede">
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-800">
        <TabButton active={tab === 'stock'} onClick={() => setTab('stock')} icon={<Boxes className="w-4 h-4" />} label="Stock" />
        <TabButton active={tab === 'movimientos'} onClick={() => setTab('movimientos')} icon={<ListFilter className="w-4 h-4" />} label="Movimientos (kárdex)" />
        <TabButton active={tab === 'costos'} onClick={() => setTab('costos')} icon={<Settings2 className="w-4 h-4" />} label="Costos & política" />
        <TabButton active={tab === 'proveedores'} onClick={() => setTab('proveedores')} icon={<Users className="w-4 h-4" />} label="Proveedores" />
      </div>

      {tab === 'proveedores' ? (
        <ProveedoresDashboard />
      ) : tab === 'costos' ? (
        <CostPolicyPanel
          policy={costPolicy}
          materials={materials}
          canEdit={canEdit}
          onPolicyChange={async (p) => { await setCostPolicy(companyId, p); setCostPolicyState(p); await loadAll(); }}
          onOverrideSaved={loadAll}
        />
      ) : tab === 'stock' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          {/* Carpetas por grupo */}
          <aside className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Grupos</h3>
              {canEdit && (
                <button onClick={() => setShowGroup(true)} className="p-1 text-suma-600 hover:bg-suma-50 dark:hover:bg-suma-950 rounded" title="Nuevo grupo">
                  <FolderPlus className="w-4 h-4" />
                </button>
              )}
            </div>
            <GroupButton active={activeGroup === 'all'} onClick={() => setActiveGroup('all')} icon={<FileText className="w-4 h-4" />} label={`Todos (${stock.length})`} />
            {groups.map((g) => {
              const count = stock.filter((r) => r.group_id === g.id).length;
              return (
                <div key={g.id} className="group flex items-center">
                  <GroupButton active={activeGroup === g.id} onClick={() => setActiveGroup(g.id)} icon={<Folder className="w-4 h-4" />} label={`${g.name} (${count})`} />
                  {canEdit && (
                    <button onClick={async () => { await deleteGroup(g.id); if (activeGroup === g.id) setActiveGroup('all'); setGroups(await fetchGroups()); }} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500" title="Eliminar grupo">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            {groups.length === 0 && <p className="text-xs text-gray-400 px-3">Crea grupos para organizar tus insumos.</p>}
          </aside>

          {/* Tabla de stock */}
          <section>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar insumo por nombre o código..."
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-suma-500" />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | StockStatus)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                <option value="all">Todos los estados</option>
                <option value="OK">OK</option>
                <option value="REPONER">Por reponer</option>
                <option value="AGOTADO">Agotado</option>
              </select>
            </div>

            <Card>
              {filteredStock.length === 0 ? (
                <EmptyState icon={<Package className="w-12 h-12" />} title="Sin insumos en esta vista"
                  description={canEdit ? 'Crea un insumo y registra su primera compra para ver stock.' : 'Aún no hay insumos registrados aquí.'}
                  action={canEdit ? <Button onClick={() => setShowMaterial(true)} leftIcon={<Plus className="w-4 h-4" />}>Nuevo insumo</Button> : undefined} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="suma-table">
                    <thead><tr>
                      <th>Código</th><th>Insumo</th><th>Unidad</th><th>Stock</th>
                      <th>Mínimo</th><th>Costo unit.</th><th>Valor</th><th>Estado</th>
                    </tr></thead>
                    <tbody>
                      {filteredStock.map((r) => (
                        <tr key={r.material_id}>
                          <td className="font-mono text-xs text-gray-500">{r.code || '—'}</td>
                          <td className="font-semibold text-gray-900 dark:text-white">{r.material_name}</td>
                          <td>{r.base_unit}</td>
                          <td className="font-mono">{r.stock}</td>
                          <td className="font-mono text-gray-500">{r.stock_min}</td>
                          <td className="font-mono text-sm">{formatCOP(r.unit_cost)}</td>
                          <td className="font-mono text-sm">{formatCOP(r.stock_value)}</td>
                          <td><Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </section>
        </div>
      ) : (
        /* KÁRDEX / Movimientos */
        <section>
          <div className="flex flex-col sm:flex-row gap-3 mb-4 flex-wrap">
            <select value={movType} onChange={(e) => setMovType(e.target.value as 'all' | MovementType)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
              <option value="all">Todos los tipos</option>
              {Object.entries(MOVEMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-500">Desde
              <input type="date" value={movFrom} onChange={(e) => setMovFrom(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900" />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-500">Hasta
              <input type="date" value={movTo} onChange={(e) => setMovTo(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900" />
            </label>
            <Button variant="secondary" size="sm" onClick={loadMovements} leftIcon={<RefreshCw className="w-4 h-4" />}>Aplicar</Button>
          </div>

          <Card>
            {movements.length === 0 ? (
              <EmptyState icon={<ListFilter className="w-12 h-12" />} title="Sin movimientos" description="Las compras, ajustes y salidas por venta aparecerán aquí." />
            ) : (
              <div className="overflow-x-auto">
                <table className="suma-table">
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Insumo</th><th>Cantidad</th><th>Costo unit.</th><th>Motivo / Ref.</th></tr></thead>
                  <tbody>
                    {movements.map((mv) => (
                      <tr key={mv.id}>
                        <td className="text-xs text-gray-500">{new Date(mv.moved_at).toLocaleDateString('es-CO')}</td>
                        <td><Badge variant={mv.quantity >= 0 ? 'green' : 'red'}>{MOVEMENT_LABEL[mv.movement_type]}</Badge></td>
                        <td className="font-medium">{materialName(mv.material_id)}</td>
                        <td className={`font-mono ${mv.quantity >= 0 ? 'text-green-600' : 'text-red-600'}`}>{mv.quantity >= 0 ? '+' : ''}{mv.quantity}</td>
                        <td className="font-mono text-sm">{formatCOP(mv.unit_cost)}</td>
                        <td className="text-xs text-gray-500">{mv.reason || mv.reference_type || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      )}

      {/* ─── Modales ─── */}
      <Modal isOpen={showGroup} onClose={() => { setShowGroup(false); setGroupError(null); }} title="Nuevo grupo" size="sm">
        <div className="p-6 space-y-4">
          {groupError && <Alert type="error">{groupError}</Alert>}
          <Field label="Nombre del grupo" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="Ej. Lácteos, Empaques..." />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Descripción (opcional)</span>
            <textarea
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              placeholder="¿Qué contiene esta carpeta? Ej. Materias primas de cera y colorantes."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-suma-500"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setShowGroup(false); setGroupError(null); }}>Cancelar</Button>
            <Button
              loading={savingGroup}
              onClick={async () => {
                setGroupError(null);
                if (!newGroup.trim()) { setGroupError('Escribe un nombre para el grupo.'); return; }
                if (!companyId) { setGroupError('Selecciona una empresa activa en la barra superior antes de crear grupos.'); return; }
                setSavingGroup(true);
                try {
                  await createGroup(companyId, newGroup.trim(), null, newGroupDesc.trim() || null);
                  setNewGroup(''); setNewGroupDesc('');
                  setShowGroup(false);
                  setGroups(await fetchGroups());
                } catch (e) {
                  setGroupError((e as Error).message || 'No se pudo crear el grupo.');
                } finally {
                  setSavingGroup(false);
                }
              }}
              leftIcon={<FolderPlus className="w-4 h-4" />}
            >Crear</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showLocation} onClose={() => { setShowLocation(false); setLocationError(null); }} title="Nueva sede / bodega" size="sm">
        <div className="p-6 space-y-4">
          {locationError && <Alert type="error">{locationError}</Alert>}
          <Field label="Nombre de la sede" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Ej. Bodega Norte" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setShowLocation(false); setLocationError(null); }}>Cancelar</Button>
            <Button
              onClick={async () => {
                setLocationError(null);
                if (!newLocation.trim()) { setLocationError('Escribe un nombre para la sede.'); return; }
                if (!companyId) { setLocationError('Selecciona una empresa activa en la barra superior.'); return; }
                try {
                  await createLocation(companyId, newLocation.trim());
                  setNewLocation('');
                  setShowLocation(false);
                  setLocations(await fetchLocations());
                } catch (e) {
                  setLocationError((e as Error).message || 'No se pudo crear la sede.');
                }
              }}
              leftIcon={<Plus className="w-4 h-4" />}
            >Crear sede</Button>
          </div>
        </div>
      </Modal>

      {showMaterial && (
        <MaterialForm companyId={companyId} units={units} groups={groups} suppliers={suppliers}
          onClose={() => setShowMaterial(false)}
          onSaved={async () => { setShowMaterial(false); await loadAll(); }}
          onNewSupplier={async (name) => { const s = await createSupplier(companyId, name); setSuppliers(await fetchSuppliers()); return s; }} />
      )}

      {showPurchase && (
        <PurchaseForm companyId={companyId} materials={materials} locations={locations} suppliers={suppliers}
          onClose={() => setShowPurchase(false)}
          onSaved={async () => { setShowPurchase(false); await loadAll(); }} />
      )}

      {showAdjust && (
        <AdjustForm companyId={companyId} materials={materials} locations={locations}
          onClose={() => setShowAdjust(false)}
          onSaved={async () => { setShowAdjust(false); await loadAll(); }} />
      )}

      <ExcelImporterModal
        isOpen={showImporter}
        onClose={() => setShowImporter(false)}
        onImportSuccess={async () => { await loadAll(); }}
      />
    </div>
  );
}

// ─────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-suma-600 text-suma-700 dark:text-suma-300' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
      }`}>
      {icon} {label}
    </button>
  );
}

function GroupButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-suma-50 dark:bg-suma-950 text-suma-700 dark:text-suma-300' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
      }`}>
      {icon} {label}
    </button>
  );
}

function MaterialForm({ companyId, units, groups, suppliers, onClose, onSaved, onNewSupplier }: {
  companyId: string; units: Unit[]; groups: ItemGroup[]; suppliers: Supplier[];
  onClose: () => void; onSaved: () => void; onNewSupplier: (name: string) => Promise<Supplier>;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [groupId, setGroupId] = useState('');
  const [baseUnit, setBaseUnit] = useState(units[0]?.code ?? 'Und');
  const [supplierId, setSupplierId] = useState('');
  const [stockMin, setStockMin] = useState(0);
  const [initialCost, setInitialCost] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) { setErr('El nombre es obligatorio.'); return; }
    setSaving(true); setErr(null);
    try {
      await createMaterial(companyId, {
        name: name.trim(), code: code || null, group_id: groupId || null,
        base_unit: baseUnit, supplier_id: supplierId || null, stock_min: stockMin,
        initial_cost: initialCost > 0 ? initialCost : null,
      });
      onSaved();
    } catch (e) { setErr((e as Error).message || 'No se pudo guardar.'); } finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title="Nuevo insumo" size="lg">
      <div className="p-6 space-y-4">
        {err && <Alert type="error">{err}</Alert>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Field label="Nombre del insumo" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Arroz, Huevo, Cera de Soya" /></div>
          <Field label="Código / SKU" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MP-001" />
          <SelectField label="Grupo" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">(Sin grupo)</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </SelectField>
          <SelectField label="Unidad base" value={baseUnit} onChange={(e) => setBaseUnit(e.target.value)} hint="La unidad en que llevas el stock">
            {units.map((u) => <option key={u.id} value={u.code}>{u.code} — {u.name}</option>)}
          </SelectField>
          <SelectField label="Proveedor" value={supplierId} onChange={(e) => {
            if (e.target.value === '__new__') {
              const n = window.prompt('Nombre del nuevo proveedor:');
              if (n && n.trim()) onNewSupplier(n.trim()).then((s) => setSupplierId(s.id));
            } else setSupplierId(e.target.value);
          }}>
            <option value="">(Sin proveedor)</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="__new__">+ Nuevo proveedor…</option>
          </SelectField>
          <Field label="Stock mínimo" type="number" value={stockMin} onChange={(e) => setStockMin(Number(e.target.value))} hint="Avisa 'Reponer' si baja de este nivel" />
          <Field label={`Costo inicial por ${baseUnit} (opcional)`} type="number" value={initialCost} onChange={(e) => setInitialCost(Number(e.target.value))} hint="Para costear recetas sin registrar compra. Luego las compras lo actualizan." />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={saving} leftIcon={<Save className="w-4 h-4" />}>Crear insumo</Button>
        </div>
      </div>
    </Modal>
  );
}

function PurchaseForm({ companyId, materials, locations, suppliers, onClose, onSaved }: {
  companyId: string; materials: Material[]; locations: Location[]; suppliers: Supplier[];
  onClose: () => void; onSaved: () => void;
}) {
  const [materialId, setMaterialId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [locationId, setLocationId] = useState(locations.find((l) => l.is_default)?.id ?? locations[0]?.id ?? '');
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const mat = materials.find((m) => m.id === materialId);
  const unitCost = quantity > 0 ? totalCost / quantity : 0;

  const save = async () => {
    if (!materialId) { setErr('Elige un insumo.'); return; }
    if (quantity <= 0) { setErr('La cantidad debe ser mayor a 0.'); return; }
    setSaving(true); setErr(null);
    try {
      await createPurchase(companyId, {
        material_id: materialId, quantity, total_cost: totalCost,
        purchased_at: date, supplier_id: supplierId || null, location_id: locationId || null,
      });
      onSaved();
    } catch (e) { setErr((e as Error).message || 'No se pudo registrar la compra.'); } finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title="Registrar compra (entrada de stock)" size="lg">
      <div className="p-6 space-y-4">
        {err && <Alert type="error">{err}</Alert>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <SelectField label="Insumo" value={materialId} onChange={(e) => setMaterialId(e.target.value)} required>
              <option value="">-- Elige el insumo --</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.base_unit})</option>)}
            </SelectField>
          </div>
          <Field label={`Cantidad (${mat?.base_unit ?? 'unidad base'})`} type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} hint="En la unidad base del insumo" />
          <Field label="Costo total pagado (COP)" type="number" value={totalCost} onChange={(e) => setTotalCost(Number(e.target.value))} />
          <SelectField label="Sede / bodega" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </SelectField>
          <SelectField label="Proveedor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">(Sin proveedor)</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectField>
          <Field label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="bg-suma-50 dark:bg-suma-950 p-3 rounded-lg text-sm">
          Costo por {mat?.base_unit ?? 'unidad'}: <strong className="font-mono">{formatCOP(unitCost)}</strong>
          <span className="text-xs text-gray-500 block">Este valor actualizará el costo del insumo en tus recetas.</span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={saving} leftIcon={<ShoppingCart className="w-4 h-4" />}>Registrar compra</Button>
        </div>
      </div>
    </Modal>
  );
}

function AdjustForm({ companyId, materials, locations, onClose, onSaved }: {
  companyId: string; materials: Material[]; locations: Location[];
  onClose: () => void; onSaved: () => void;
}) {
  const [materialId, setMaterialId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [locationId, setLocationId] = useState(locations.find((l) => l.is_default)?.id ?? locations[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!materialId) { setErr('Elige un insumo.'); return; }
    if (quantity === 0) { setErr('La cantidad no puede ser 0 (usa + para entrada, − para salida).'); return; }
    if (!reason.trim()) { setErr('El motivo es obligatorio.'); return; }
    setSaving(true); setErr(null);
    try {
      await createAdjustment(companyId, { material_id: materialId, location_id: locationId || null, quantity, reason: reason.trim() });
      onSaved();
    } catch (e) { setErr((e as Error).message || 'No se pudo registrar el ajuste.'); } finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title="Ajuste de inventario" size="md">
      <div className="p-6 space-y-4">
        {err && <Alert type="error">{err}</Alert>}
        <SelectField label="Insumo" value={materialId} onChange={(e) => setMaterialId(e.target.value)} required>
          <option value="">-- Elige el insumo --</option>
          {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.base_unit})</option>)}
        </SelectField>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cantidad (+ entra / − sale)" type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} hint="Ej. -5 para una merma" />
          <SelectField label="Sede / bodega" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </SelectField>
        </div>
        <Field label="Motivo" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Conteo físico, merma, daño..." />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={saving} leftIcon={<Save className="w-4 h-4" />}>Registrar ajuste</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────
// Panel de Costos & Política de costeo (+ historial descargable)
// ─────────────────────────────────────────
function CostPolicyPanel({
  policy, materials, canEdit, onPolicyChange, onOverrideSaved,
}: {
  policy: CostPolicy;
  materials: Material[];
  canEdit: boolean;
  onPolicyChange: (p: CostPolicy) => void | Promise<void>;
  onOverrideSaved: () => void | Promise<void>;
}) {
  const [history, setHistory] = useState<CostHistoryRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { projected?: string; frozen?: string }>>({});

  const materialName = (id: string) => materials.find((m) => m.id === id)?.name ?? '—';

  const loadHistory = async () => {
    const h = await fetchCostHistory();
    setHistory(h);
    setShowHistory(true);
  };

  const downloadHistory = async () => {
    const h = history.length ? history : await fetchCostHistory();
    const rows = h.map((r) => ({
      Fecha: new Date(r.changed_at).toLocaleString('es-CO'),
      Insumo: materialName(r.material_id),
      'Costo anterior': r.old_cost ?? '',
      'Costo nuevo': r.new_cost,
      Variación: r.old_cost != null ? r.new_cost - r.old_cost : '',
      'Variación %': r.old_cost ? (((r.new_cost - r.old_cost) / r.old_cost) * 100).toFixed(1) + '%' : '',
      Tipo: r.change_kind,
      Nota: r.note ?? '',
    }));
    downloadAsExcel(rows, 'historial_costos', 'Historial de costos');
  };

  const saveOverride = async (id: string) => {
    setSavingId(id);
    try {
      const d = drafts[id] ?? {};
      await setMaterialCostOverrides(id, {
        projected_cost: d.projected !== undefined && d.projected !== '' ? Number(d.projected) : undefined,
        frozen_cost: d.frozen !== undefined && d.frozen !== '' ? Number(d.frozen) : undefined,
      });
      await onOverrideSaved();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Selector de política */}
      <Card>
        <div className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <Settings2 className="w-5 h-5 text-suma-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Política de costeo de la empresa</h3>
              <p className="text-sm text-gray-500">Define con qué costo se calculan tus recetas. Al cambiarla, todas las recetas se recalculan.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(Object.keys(COST_POLICY_LABEL) as CostPolicy[]).map((p) => (
              <button
                key={p}
                disabled={!canEdit}
                onClick={() => onPolicyChange(p)}
                className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                  policy === p
                    ? 'border-suma-500 bg-suma-50 dark:bg-suma-950 text-suma-800 dark:text-suma-200'
                    : 'border-gray-200 dark:border-gray-700 hover:border-suma-300'
                } ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <span className="font-semibold block">{COST_POLICY_LABEL[p]}</span>
                <span className="text-xs text-gray-500">
                  {p === 'ULTIMA_COMPRA' && 'Usa el precio de la compra más reciente.'}
                  {p === 'PROMEDIO' && 'Promedio de todas las compras.'}
                  {p === 'CONGELADO' && 'Mantiene el precio anterior que fijaste.'}
                  {p === 'PROYECTADO' && 'Usa el precio a futuro que proyectes.'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Costos por insumo: actual / proyectado / congelado */}
      <Card>
        <div className="p-5 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">Costos por insumo</h3>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={loadHistory} leftIcon={<History className="w-4 h-4" />}>Ver historial</Button>
            <Button variant="secondary" size="sm" onClick={downloadHistory} leftIcon={<Download className="w-4 h-4" />}>Descargar Excel</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="suma-table">
            <thead><tr>
              <th>Insumo</th><th>Unidad</th><th>Costo actual</th>
              <th>Congelado (anterior)</th><th>Proyectado (futuro)</th>{canEdit && <th></th>}
            </tr></thead>
            <tbody>
              {materials.map((m) => {
                const d = drafts[m.id] ?? {};
                return (
                  <tr key={m.id}>
                    <td className="font-semibold text-gray-900 dark:text-white">{m.name}</td>
                    <td>{m.base_unit}</td>
                    <td className="font-mono text-sm">{formatCOP(m.unit_cost_per_base)}</td>
                    <td>
                      {canEdit ? (
                        <input type="number" step="any"
                          defaultValue={m.frozen_cost ?? ''}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [m.id]: { ...prev[m.id], frozen: e.target.value } }))}
                          placeholder="—"
                          className="w-28 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 text-xs text-right bg-white dark:bg-gray-800" />
                      ) : formatCOP(m.frozen_cost ?? 0)}
                    </td>
                    <td>
                      {canEdit ? (
                        <input type="number" step="any"
                          defaultValue={m.projected_cost ?? ''}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [m.id]: { ...prev[m.id], projected: e.target.value } }))}
                          placeholder="—"
                          className="w-28 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 text-xs text-right bg-white dark:bg-gray-800" />
                      ) : formatCOP(m.projected_cost ?? 0)}
                    </td>
                    {canEdit && (
                      <td>
                        {(d.projected !== undefined || d.frozen !== undefined) && (
                          <Button size="xs" onClick={() => saveOverride(m.id)} loading={savingId === m.id} leftIcon={<Save className="w-3.5 h-3.5" />}>Guardar</Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal historial */}
      <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title="Historial de costos" size="xl">
        <div className="p-6">
          <div className="flex justify-end mb-3">
            <Button variant="secondary" size="sm" onClick={downloadHistory} leftIcon={<Download className="w-4 h-4" />}>Descargar Excel</Button>
          </div>
          {history.length === 0 ? (
            <EmptyState icon={<History className="w-12 h-12" />} title="Sin cambios de costo registrados" description="Cada vez que un insumo cambie de costo (por una compra), aparecerá aquí." />
          ) : (
            <div className="overflow-x-auto max-h-[60vh]">
              <table className="suma-table">
                <thead><tr><th>Fecha</th><th>Insumo</th><th>Antes</th><th>Después</th><th>Variación</th><th>Tipo</th></tr></thead>
                <tbody>
                  {history.map((r) => {
                    const diff = r.old_cost != null ? r.new_cost - r.old_cost : null;
                    return (
                      <tr key={r.id}>
                        <td className="text-xs text-gray-500">{new Date(r.changed_at).toLocaleDateString('es-CO')}</td>
                        <td className="font-medium">{materialName(r.material_id)}</td>
                        <td className="font-mono text-sm">{r.old_cost != null ? formatCOP(r.old_cost) : '—'}</td>
                        <td className="font-mono text-sm">{formatCOP(r.new_cost)}</td>
                        <td className={`font-mono text-sm ${diff != null && diff > 0 ? 'text-red-600' : diff != null && diff < 0 ? 'text-green-600' : ''}`}>
                          {diff != null ? (diff > 0 ? '+' : '') + formatCOP(diff) : '—'}
                        </td>
                        <td><Badge variant="gray">{r.change_kind}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
