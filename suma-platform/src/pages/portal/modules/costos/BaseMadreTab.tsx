// ============================================================
// SUMA ERP — Costos / Base Madre (Inventario Inicial)
// Tabla principal de insumos con CRUD completo + importador
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Edit2, Trash2, Eye, Upload, RefreshCw,
  ChevronDown, ChevronRight, Package, AlertTriangle, FolderPlus, UserPlus,
} from 'lucide-react';
import {
  Button, Card, Field, SelectField, Modal, Badge, EmptyState, Alert, Spinner,
} from '@/components/ui';
import { useActiveCompanyId, useCanEdit } from '@/store/AppStore';
import { formatCOP } from '@/config/brand';
import { supabase } from '@/services/supabase';
import type { Unit } from '@/types/domain';

// ── Tipos ──────────────────────────────────────────────────
interface MaterialRow {
  id: string;
  company_id: string;
  code: string | null;
  name: string;
  base_unit: string;
  unit_cost_per_base: number;
  group_id: string | null;
  group_name?: string;
  supplier_id: string | null;
  supplier_name?: string;
  stock: number;
  stock_min: number;
  purchase_date?: string | null;
  notes?: string | null;
}

interface GroupRow {
  id: string;
  name: string;
  kind: string;
  parent_id: string | null;
  description: string | null;
}

const EMPTY_FORM: Omit<MaterialRow, 'id' | 'company_id'> = {
  code: '',
  name: '',
  base_unit: 'g',
  unit_cost_per_base: 0,
  group_id: null,
  group_name: '',
  supplier_id: null,
  supplier_name: '',
  stock: 0,
  stock_min: 0,
  purchase_date: null,
  notes: '',
};

export default function BaseMadreTab() {
  const companyId = useActiveCompanyId();
  const canEdit = useCanEdit();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; phone?: string | null }[]>([]);

  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Modales
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaterialRow | null>(null);
  const [viewing, setViewing] = useState<MaterialRow | null>(null);
  const [deleting, setDeleting] = useState<MaterialRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // Crear grupo (modal independiente + inline desde el form de insumo)
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [groupSaving, setGroupSaving] = useState(false);

  // Crear proveedor inline (nombre + número)
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [supplierSaving, setSupplierSaving] = useState(false);

  // Importador masivo simple (CSV / Excel pegado)
  const [showImporter, setShowImporter] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importPreview, setImportPreview] = useState<Partial<MaterialRow>[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, gRes, uRes, sRes] = await Promise.all([
        supabase.from('materials').select(`
          id, company_id, code, name, base_unit, unit_cost_per_base,
          group_id, supplier_id, stock, stock_min, purchase_date, notes,
          item_groups(name), suppliers(name)
        `).order('name'),
        supabase.from('item_groups').select('*').eq('kind', 'material').order('name'),
        supabase.from('units').select('*').order('code'),
        supabase.from('suppliers').select('id, name, phone').order('name'),
      ]);
      if (mRes.error) throw mRes.error;
      if (gRes.error) throw gRes.error;
      if (uRes.error) throw uRes.error;
      setMaterials(
        (mRes.data ?? []).map((m: any) => ({
          ...m,
          group_name: m.item_groups?.name ?? '(Sin grupo)',
          supplier_name: m.suppliers?.name ?? '',
        }))
      );
      setGroups(gRes.data ?? []);
      setUnits(uRes.data ?? []);
      setSuppliers(sRes.data ?? []);
    } catch (e: any) {
      setError(e.message || 'Error cargando Base Madre.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return materials.filter((m) => {
      const matchSearch =
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        (m.code ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (m.supplier_name ?? '').toLowerCase().includes(search.toLowerCase());
      const matchGroup = !filterGroup || m.group_id === filterGroup;
      return matchSearch && matchGroup;
    });
  }, [materials, search, filterGroup]);

  // Agrupar por grupo para vista colapsable
  const byGroup = useMemo(() => {
    const map = new Map<string, MaterialRow[]>();
    for (const m of filtered) {
      const key = m.group_name || '(Sin grupo)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [filtered]);

  const toggleGroup = (name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  };

  const openEdit = (m: MaterialRow) => {
    setEditing(m);
    setForm({
      code: m.code ?? '',
      name: m.name,
      base_unit: m.base_unit,
      unit_cost_per_base: m.unit_cost_per_base,
      group_id: m.group_id,
      group_name: m.group_name ?? '',
      supplier_id: m.supplier_id,
      supplier_name: m.supplier_name ?? '',
      stock: m.stock,
      stock_min: m.stock_min,
      purchase_date: m.purchase_date ?? null,
      notes: m.notes ?? '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!companyId) { setError('No hay empresa activa.'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        company_id: companyId,
        code: form.code || null,
        name: form.name.trim(),
        base_unit: form.base_unit,
        unit_cost_per_base: Number(form.unit_cost_per_base),
        group_id: form.group_id || null,
        supplier_id: form.supplier_id || null,
        stock: Number(form.stock),
        stock_min: Number(form.stock_min),
        purchase_date: form.purchase_date || null,
        notes: form.notes || null,
      };
      if (editing) {
        const { error: err } = await supabase.from('materials').update(payload).eq('id', editing.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('materials').insert(payload);
        if (err) throw err;
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e.message || 'Error guardando.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      const { error: err } = await supabase.from('materials').delete().eq('id', deleting.id);
      if (err) throw err;
      setDeleting(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Crear grupo nuevo (lo usa tanto el botón "+ Grupo" como el inline del form)
  const handleCreateGroup = async (): Promise<string | null> => {
    if (!newGroupName.trim()) { setError('Escribe un nombre para el grupo.'); return null; }
    if (!companyId) { setError('No hay empresa activa. Selecciona una empresa en la barra superior.'); return null; }
    setGroupSaving(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('item_groups')
        .insert({ company_id: companyId, name: newGroupName.trim(), kind: 'material', description: newGroupDesc.trim() || null })
        .select('id, name, kind, parent_id, description')
        .single();
      if (err) throw err;
      const created = data as GroupRow;
      setGroups((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewGroupName('');
      setNewGroupDesc('');
      setShowGroupModal(false);
      return created.id;
    } catch (e: any) {
      const msg = (e?.code === '23505' || /duplicate|unique/i.test(e?.message ?? ''))
        ? `Ya existe un grupo llamado "${newGroupName.trim()}".`
        : (e.message || 'No se pudo crear el grupo.');
      setError(msg);
      return null;
    } finally {
      setGroupSaving(false);
    }
  };

  // Crear proveedor nuevo (nombre + número) desde el form de insumo
  const handleCreateSupplier = async (): Promise<string | null> => {
    if (!newSupplierName.trim()) { setError('Escribe el nombre del proveedor.'); return null; }
    if (!companyId) { setError('No hay empresa activa. Selecciona una empresa en la barra superior.'); return null; }
    setSupplierSaving(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('suppliers')
        .insert({ company_id: companyId, name: newSupplierName.trim(), phone: newSupplierPhone.trim() || null })
        .select('id, name, phone')
        .single();
      if (err) throw err;
      const created = data as { id: string; name: string; phone?: string | null };
      setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      // Asignar automáticamente el proveedor recién creado al insumo en edición
      setForm((f) => ({ ...f, supplier_id: created.id, supplier_name: created.name }));
      setNewSupplierName('');
      setNewSupplierPhone('');
      setShowSupplierModal(false);
      return created.id;
    } catch (e: any) {
      const msg = (e?.code === '23505' || /duplicate|unique/i.test(e?.message ?? ''))
        ? `Ya existe un proveedor llamado "${newSupplierName.trim()}".`
        : (e.message || 'No se pudo crear el proveedor.');
      setError(msg);
      return null;
    } finally {
      setSupplierSaving(false);
    }
  };

  // Parseo básico de CSV pegado
  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n').filter(Boolean);
    if (lines.length < 2) { setImportPreview([]); return; }
    // Detectar separador
    const sep = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const rows: Partial<MaterialRow>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(sep);
      const obj: any = {};
      headers.forEach((h, idx) => { obj[h] = vals[idx]?.trim() ?? ''; });
      rows.push({
        code: obj.codigo || obj.code || null,
        name: obj.nombre || obj.name || obj.insumo || obj.material || '',
        base_unit: obj.unidad || obj.base_unit || obj.unit || 'g',
        unit_cost_per_base: parseFloat(obj.costo || obj.costo_por_unidad || obj.unit_cost || '0') || 0,
        stock: parseFloat(obj.stock || obj.cantidad || '0') || 0,
        stock_min: parseFloat(obj.stock_min || obj.minimo || '0') || 0,
        group_name: obj.grupo || obj.group || '',
        supplier_name: obj.proveedor || obj.supplier || '',
        notes: obj.notas || obj.notes || '',
      });
    }
    setImportPreview(rows);
  };

  const handleImport = async () => {
    if (!companyId || importPreview.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      // Resolver group_id por nombre
      const rows = importPreview.map((r) => {
        const g = groups.find((g) => g.name.toLowerCase() === (r.group_name ?? '').toLowerCase());
        const s = suppliers.find((s) => s.name.toLowerCase() === (r.supplier_name ?? '').toLowerCase());
        return {
          company_id: companyId,
          code: r.code || null,
          name: r.name || 'Sin nombre',
          base_unit: r.base_unit || 'g',
          unit_cost_per_base: r.unit_cost_per_base || 0,
          group_id: g?.id || null,
          supplier_id: s?.id || null,
          stock: r.stock || 0,
          stock_min: r.stock_min || 0,
          notes: r.notes || null,
        };
      });
      const { error: err } = await supabase.from('materials').insert(rows);
      if (err) throw err;
      setShowImporter(false);
      setCsvText('');
      setImportPreview([]);
      await load();
    } catch (e: any) {
      setError(e.message || 'Error importando.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const statusBadge = (m: MaterialRow) => {
    if (m.stock <= 0) return <Badge variant="red">Agotado</Badge>;
    if (m.stock <= m.stock_min) return <Badge variant="yellow">Por reponer</Badge>;
    return <Badge variant="green">OK</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar insumo, código, proveedor..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-suma-500"
            />
          </div>
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          >
            <option value="">Todos los grupos</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setShowImporter(true)} leftIcon={<Upload className="w-4 h-4" />}>
                Importar masivo
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setNewGroupName(''); setNewGroupDesc(''); setShowGroupModal(true); }} leftIcon={<FolderPlus className="w-4 h-4" />}>
                Nuevo grupo
              </Button>
              <Button size="sm" onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>
                Nuevo insumo
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={load} leftIcon={<RefreshCw className="w-4 h-4" />}>
            Actualizar
          </Button>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Resumen rápido */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total insumos', value: materials.length, color: 'text-suma-600' },
          { label: 'Grupos', value: groups.length, color: 'text-blue-600' },
          { label: 'Por reponer', value: materials.filter((m) => m.stock <= m.stock_min && m.stock > 0).length, color: 'text-yellow-600' },
          { label: 'Agotados', value: materials.filter((m) => m.stock <= 0).length, color: 'text-red-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabla colapsable por grupo */}
      {byGroup.size === 0 ? (
        <EmptyState
          icon={<Package className="w-12 h-12" />}
          title="Sin insumos registrados"
          description={canEdit ? 'Crea tu primer insumo o importa desde Excel.' : 'Aún no hay insumos en la Base Madre.'}
          action={canEdit ? <Button onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>Crear insumo</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {Array.from(byGroup.entries()).map(([groupName, rows]) => (
            <Card key={groupName} className="overflow-hidden">
              {/* Cabecera de grupo */}
              <button
                onClick={() => toggleGroup(groupName)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors text-left"
              >
                {collapsedGroups.has(groupName)
                  ? <ChevronRight className="w-4 h-4 text-gray-400" />
                  : <ChevronDown className="w-4 h-4 text-gray-400" />
                }
                <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">{groupName}</span>
                <Badge variant="gray">{rows.length} ítems</Badge>
                <span className="ml-auto text-xs text-gray-400 font-mono">
                  Valor: {formatCOP(rows.reduce((s, r) => s + r.unit_cost_per_base * r.stock, 0))}
                </span>
              </button>

              {/* Filas del grupo — indentadas a la derecha con línea guía */}
              {!collapsedGroups.has(groupName) && (
                <div className="overflow-x-auto border-l-2 border-suma-200 dark:border-suma-800 ml-4">
                  <table className="suma-table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Insumo</th>
                        <th>Unidad</th>
                        <th>Costo/Unidad</th>
                        <th>Stock</th>
                        <th>Valor total</th>
                        <th>Proveedor</th>
                        <th>Estado</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((m) => (
                        <tr key={m.id}>
                          <td className="font-mono text-xs text-gray-500">{m.code || '—'}</td>
                          <td className="font-semibold text-gray-900 dark:text-white">{m.name}</td>
                          <td>{m.base_unit}</td>
                          <td className="font-mono text-sm">{formatCOP(m.unit_cost_per_base)}</td>
                          <td className="font-mono text-sm">{m.stock.toLocaleString('es-CO')}</td>
                          <td className="font-mono text-sm text-suma-700 dark:text-suma-300">
                            {formatCOP(m.unit_cost_per_base * m.stock)}
                          </td>
                          <td className="text-sm text-gray-500">{m.supplier_name || '—'}</td>
                          <td>{statusBadge(m)}</td>
                          <td>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setViewing(m)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="Ver">
                                <Eye className="w-4 h-4" />
                              </button>
                              {canEdit && (
                                <>
                                  <button onClick={() => openEdit(m)} className="p-1.5 text-gray-400 hover:text-suma-600 rounded" title="Editar">
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => setDeleting(m)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Eliminar">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal: Crear / Editar insumo */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Editar insumo' : 'Nuevo insumo'} size="xl">
        <div className="p-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código / SKU" value={form.code ?? ''} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="INS-001" />
            <div className="col-span-2">
              <Field label="Nombre del insumo *" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ej. Cera de soya, Fragancia lavanda..." />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <SelectField label="Unidad base *" value={form.base_unit} onChange={(e) => setForm((f) => ({ ...f, base_unit: e.target.value }))}>
              {units.length > 0
                ? units.map((u) => <option key={u.id} value={u.code}>{u.code} — {u.name}</option>)
                : ['g', 'kg', 'mL', 'L', 'Und', 'cm', 'm'].map((u) => <option key={u} value={u}>{u}</option>)
              }
            </SelectField>
            <Field
              label="Costo por unidad base (COP) *"
              type="number"
              value={form.unit_cost_per_base}
              onChange={(e) => setForm((f) => ({ ...f, unit_cost_per_base: Number(e.target.value) }))}
              hint="Precio al que lo compras por unidad base"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grupo</label>
              <div className="flex gap-2">
                <select
                  value={form.group_id ?? ''}
                  onChange={(e) => {
                    if (e.target.value === '__new__') { setNewGroupName(''); setNewGroupDesc(''); setShowGroupModal(true); return; }
                    setForm((f) => ({ ...f, group_id: e.target.value || null }));
                  }}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-suma-500"
                >
                  <option value="">(Sin grupo)</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  <option value="__new__">➕ Crear grupo nuevo…</option>
                </select>
                <button
                  type="button"
                  title="Crear grupo nuevo"
                  onClick={() => { setNewGroupName(''); setNewGroupDesc(''); setShowGroupModal(true); }}
                  className="flex-shrink-0 px-2 rounded-lg border border-gray-300 dark:border-gray-600 text-suma-600 hover:bg-suma-50 dark:hover:bg-suma-950"
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field
              label="Stock actual"
              type="number"
              value={form.stock}
              onChange={(e) => setForm((f) => ({ ...f, stock: Number(e.target.value) }))}
            />
            <Field
              label="Stock mínimo"
              type="number"
              value={form.stock_min}
              onChange={(e) => setForm((f) => ({ ...f, stock_min: Number(e.target.value) }))}
              hint="Alerta cuando baje de aquí"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proveedor</label>
              <div className="flex gap-2">
                <select
                  value={form.supplier_id ?? ''}
                  onChange={(e) => {
                    if (e.target.value === '__new__') { setNewSupplierName(''); setNewSupplierPhone(''); setShowSupplierModal(true); return; }
                    setForm((f) => ({ ...f, supplier_id: e.target.value || null }));
                  }}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-suma-500"
                >
                  <option value="">(Sin proveedor)</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="__new__">➕ Agregar proveedor…</option>
                </select>
                <button
                  type="button"
                  title="Agregar proveedor"
                  onClick={() => { setNewSupplierName(''); setNewSupplierPhone(''); setShowSupplierModal(true); }}
                  className="flex-shrink-0 px-2 rounded-lg border border-gray-300 dark:border-gray-600 text-suma-600 hover:bg-suma-50 dark:hover:bg-suma-950"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Fecha de compra"
              type="date"
              value={form.purchase_date ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value || null }))}
            />
            <Field
              label="Notas"
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Observaciones..."
            />
          </div>

          {/* Preview costo total en inventario */}
          <div className="bg-suma-50 dark:bg-suma-950 rounded-xl p-4 border border-suma-100 dark:border-suma-900">
            <p className="text-xs text-suma-600 font-semibold mb-1">VALOR EN INVENTARIO</p>
            <p className="text-2xl font-black text-suma-900 dark:text-suma-100 font-mono">
              {formatCOP(Number(form.unit_cost_per_base) * Number(form.stock))}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{Number(form.stock).toLocaleString()} {form.base_unit} × {formatCOP(Number(form.unit_cost_per_base))}/und</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Guardar cambios' : 'Crear insumo'}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Ver insumo */}
      <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title={viewing?.name || 'Detalle'} size="md">
        {viewing && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Código', value: viewing.code || '—' },
                { label: 'Unidad base', value: viewing.base_unit },
                { label: 'Costo/Unidad', value: formatCOP(viewing.unit_cost_per_base) },
                { label: 'Grupo', value: viewing.group_name || '—' },
                { label: 'Stock actual', value: `${viewing.stock} ${viewing.base_unit}` },
                { label: 'Stock mínimo', value: `${viewing.stock_min} ${viewing.base_unit}` },
                { label: 'Proveedor', value: viewing.supplier_name || '—' },
                { label: 'Valor en inventario', value: formatCOP(viewing.unit_cost_per_base * viewing.stock) },
              ].map((f) => (
                <div key={f.label}>
                  <p className="text-xs text-gray-500">{f.label}</p>
                  <p className="font-semibold">{f.value}</p>
                </div>
              ))}
            </div>
            {viewing.notes && (
              <div>
                <p className="text-xs text-gray-500">Notas</p>
                <p className="text-sm">{viewing.notes}</p>
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setViewing(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Confirmar eliminar */}
      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Eliminar insumo" size="sm">
        <div className="p-6 space-y-4">
          <div className="flex gap-3 items-start">
            <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">¿Eliminar <strong>{deleting?.name}</strong>?</p>
              <p className="text-sm text-gray-500 mt-1">Esta acción no se puede deshacer. Si este insumo está en recetas, esas líneas quedarán sin costo.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="danger" onClick={handleDelete} loading={saving} leftIcon={<Trash2 className="w-4 h-4" />}>Eliminar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Importador masivo CSV */}
      <Modal isOpen={showImporter} onClose={() => { setShowImporter(false); setCsvText(''); setImportPreview([]); }} title="Importar insumos (CSV / Excel pegado)" size="2xl">
        <div className="p-6 space-y-4">
          <Alert type="info">
            <strong>Columnas esperadas:</strong> codigo, nombre, unidad, costo, stock, stock_min, grupo, proveedor, notas<br />
            Separa con coma o tabulación. La primera fila es el encabezado.
          </Alert>
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Pega aquí el contenido del CSV o Excel</span>
            <textarea
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); parseCSV(e.target.value); }}
              rows={8}
              placeholder={'codigo\tnombre\tunidad\tcosto\tstock\tstock_min\tgrupo\tproveedor\nINS-001\tCera de soya\tg\t8\t5000\t500\tCERAS\tProveedor ABC'}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-mono bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-suma-500"
            />
          </label>

          {importPreview.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Vista previa — {importPreview.length} registros
              </p>
              <div className="overflow-x-auto max-h-48 rounded border border-gray-200 dark:border-gray-700">
                <table className="suma-table text-xs">
                  <thead>
                    <tr><th>Código</th><th>Nombre</th><th>Unidad</th><th>Costo</th><th>Stock</th><th>Grupo</th><th>Proveedor</th></tr>
                  </thead>
                  <tbody>
                    {importPreview.map((r, i) => (
                      <tr key={i}>
                        <td>{r.code || '—'}</td>
                        <td className={!r.name ? 'text-red-500' : ''}>{r.name || '¡Falta nombre!'}</td>
                        <td>{r.base_unit}</td>
                        <td className="font-mono">{formatCOP(r.unit_cost_per_base ?? 0)}</td>
                        <td>{r.stock}</td>
                        <td>{r.group_name || '—'}</td>
                        <td>{r.supplier_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setShowImporter(false); setCsvText(''); setImportPreview([]); }}>Cancelar</Button>
            <Button
              onClick={handleImport}
              loading={saving}
              disabled={importPreview.length === 0}
              leftIcon={<Upload className="w-4 h-4" />}
            >
              Importar {importPreview.length > 0 ? `(${importPreview.length} ítems)` : ''}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Crear grupo */}
      <Modal isOpen={showGroupModal} onClose={() => setShowGroupModal(false)} title="Nuevo grupo de insumos" size="sm">
        <div className="p-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          <Field
            label="Nombre del grupo *"
            required
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Ej. EMPAQUES, MATERIALES, CERAS..."
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción (opcional)</label>
            <textarea
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              rows={2}
              placeholder="¿Qué insumos agrupa esta categoría?"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-suma-500"
            />
          </div>
          <p className="text-xs text-gray-500">El grupo se crea para la empresa activa. También puedes cargar grupos con el archivo de Excel.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowGroupModal(false)}>Cancelar</Button>
            <Button onClick={handleCreateGroup} loading={groupSaving} leftIcon={<FolderPlus className="w-4 h-4" />}>Crear grupo</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Agregar proveedor (nombre + número) */}
      <Modal isOpen={showSupplierModal} onClose={() => setShowSupplierModal(false)} title="Agregar proveedor" size="sm">
        <div className="p-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          <Field
            label="Nombre del proveedor *"
            required
            value={newSupplierName}
            onChange={(e) => setNewSupplierName(e.target.value)}
            placeholder="Ej. Distribuidora La 14"
          />
          <Field
            label="Número / teléfono"
            value={newSupplierPhone}
            onChange={(e) => setNewSupplierPhone(e.target.value)}
            placeholder="Ej. 3001234567"
            hint="Esta información también se verá en Inventario."
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowSupplierModal(false)}>Cancelar</Button>
            <Button onClick={handleCreateSupplier} loading={supplierSaving} leftIcon={<UserPlus className="w-4 h-4" />}>Agregar proveedor</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
