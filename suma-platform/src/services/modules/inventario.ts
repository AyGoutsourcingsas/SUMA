// ============================================================
// SUMA ERP — Servicio de datos del módulo INVENTARIO
// Opera sobre el Núcleo (materials, purchases, item_groups,
// suppliers, units) + sedes y kárdex (migración 005).
// Reemplaza al viejo supabaseDataProvider/inventory_items.
// ============================================================
import { supabase } from '@/services/supabase';
import type {
  Material, ItemGroup, Supplier, Unit,
} from '@/types/domain';

// ─────────────────────────────────────────
// Tipos de lectura (vistas de stock)
// ─────────────────────────────────────────
export type StockStatus = 'OK' | 'REPONER' | 'AGOTADO';

export interface StockRow {
  company_id: string;
  material_id: string;
  code: string | null;
  material_name: string;
  base_unit: string;
  group_id: string | null;
  supplier_id: string | null;
  stock_min: number;
  unit_cost: number;
  stock: number;
  stock_value: number;
  status: StockStatus;
}

export interface Location {
  id: string;
  company_id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export type MovementType =
  | 'ENTRADA_COMPRA' | 'SALIDA_VENTA' | 'REVERSO_VENTA'
  | 'AJUSTE' | 'SALIDA_PRODUCCION' | 'TRASLADO';

export interface InventoryMovement {
  id: string;
  company_id: string;
  location_id: string | null;
  material_id: string;
  moved_at: string;
  movement_type: MovementType;
  quantity: number;
  unit_cost: number;
  reference_type?: string | null;
  reference_id?: string | null;
  reason?: string | null;
  created_at: string;
}

// ─────────────────────────────────────────
// Catálogos
// ─────────────────────────────────────────
export async function fetchUnits(): Promise<Unit[]> {
  const { data, error } = await supabase.from('units').select('*').order('code');
  if (error) throw error;
  return data ?? [];
}

export async function fetchGroups(): Promise<ItemGroup[]> {
  const { data, error } = await supabase
    .from('item_groups').select('*').eq('kind', 'material')
    .order('sort_order').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createGroup(companyId: string, name: string, parentId?: string | null, description?: string | null): Promise<ItemGroup> {
  const { data, error } = await supabase
    .from('item_groups')
    .insert({ company_id: companyId, name, kind: 'material', parent_id: parentId ?? null, description: description ?? null })
    .select().single();
  if (error) throw error;
  return data;
}

export async function deleteGroup(id: string): Promise<void> {
  const { error } = await supabase.from('item_groups').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase.from('suppliers').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createSupplier(companyId: string, name: string): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers').insert({ company_id: companyId, name }).select().single();
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────
// Sedes
// ─────────────────────────────────────────
export async function fetchLocations(): Promise<Location[]> {
  const { data, error } = await supabase
    .from('locations').select('*').eq('is_active', true).order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createLocation(companyId: string, name: string, code?: string): Promise<Location> {
  const { data, error } = await supabase
    .from('locations')
    .insert({ company_id: companyId, name, code: code ?? null })
    .select().single();
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────
// Materiales
// ─────────────────────────────────────────
export async function fetchMaterials(): Promise<Material[]> {
  const { data, error } = await supabase.from('materials').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export interface MaterialInput {
  code?: string | null;
  name: string;
  group_id?: string | null;
  base_unit: string;
  supplier_id?: string | null;
  units_per_purchase?: number | null;
  stock_min?: number;
  note?: string | null;
  /** Costo inicial por unidad base (opcional): permite costear recetas
   *  sin registrar una compra formal. Si se envía, fija el costo del
   *  insumo (dispara historial y recálculo de recetas por trigger). */
  initial_cost?: number | null;
}

export async function createMaterial(companyId: string, input: MaterialInput): Promise<Material> {
  const { initial_cost, ...rest } = input;
  const { data, error } = await supabase
    .from('materials')
    .insert({
      ...rest,
      company_id: companyId,
      stock_min: input.stock_min ?? 0,
      unit_cost_per_base: initial_cost != null && initial_cost > 0 ? initial_cost : 0,
    })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateMaterial(id: string, input: Partial<MaterialInput>): Promise<Material> {
  const { data, error } = await supabase
    .from('materials').update(input).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deactivateMaterial(id: string): Promise<void> {
  // No se borra: se inactiva (regla de negocio: nada se elimina).
  const { error } = await supabase.from('materials').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────
// Stock (vistas calculadas)
// ─────────────────────────────────────────
export async function fetchStockSummary(): Promise<StockRow[]> {
  const { data, error } = await supabase
    .from('stock_summary').select('*').order('material_name');
  if (error) throw error;
  return (data ?? []) as StockRow[];
}

// ─────────────────────────────────────────
// Compras (generan movimiento de entrada por trigger)
// ─────────────────────────────────────────
export interface PurchaseInput {
  material_id: string;
  quantity: number;       // en unidad base del material
  total_cost: number;     // valor pagado
  purchased_at?: string;  // ISO date
  supplier_id?: string | null;
  location_id?: string | null;
  note?: string | null;
}

export async function createPurchase(companyId: string, input: PurchaseInput): Promise<void> {
  const { error } = await supabase.from('purchases').insert({
    company_id: companyId,
    material_id: input.material_id,
    quantity: input.quantity,
    total_cost: input.total_cost,
    purchased_at: input.purchased_at ?? new Date().toISOString().slice(0, 10),
    supplier_id: input.supplier_id ?? null,
    location_id: input.location_id ?? null,
    note: input.note ?? null,
    affects_stock: true,
  });
  if (error) throw error;
}

// ─────────────────────────────────────────
// Ajustes (entrada/salida manual con motivo obligatorio)
// ─────────────────────────────────────────
export interface AdjustmentInput {
  material_id: string;
  location_id?: string | null;
  quantity: number;   // + entra, - sale
  reason: string;     // obligatorio
}

export async function createAdjustment(companyId: string, input: AdjustmentInput): Promise<void> {
  const { error } = await supabase.from('inventory_movements').insert({
    company_id: companyId,
    location_id: input.location_id ?? null,
    material_id: input.material_id,
    movement_type: 'AJUSTE',
    quantity: input.quantity,
    unit_cost: 0,
    reference_type: 'adjustment',
    reason: input.reason,
  });
  if (error) throw error;
}

// ─────────────────────────────────────────
// Kárdex / movimientos (con filtros)
// ─────────────────────────────────────────
export interface MovementFilters {
  materialId?: string;
  locationId?: string;
  type?: MovementType;
  from?: string; // ISO date
  to?: string;   // ISO date
}

export async function fetchMovements(filters: MovementFilters = {}): Promise<InventoryMovement[]> {
  let q = supabase.from('inventory_movements').select('*').order('moved_at', { ascending: false });
  if (filters.materialId) q = q.eq('material_id', filters.materialId);
  if (filters.locationId) q = q.eq('location_id', filters.locationId);
  if (filters.type) q = q.eq('movement_type', filters.type);
  if (filters.from) q = q.gte('moved_at', filters.from);
  if (filters.to) q = q.lte('moved_at', filters.to);
  const { data, error } = await q.limit(500);
  if (error) throw error;
  return (data ?? []) as InventoryMovement[];
}

// ─────────────────────────────────────────
// Política de costeo e historial (migración 008)
// ─────────────────────────────────────────
export type CostPolicy = 'ULTIMA_COMPRA' | 'PROMEDIO' | 'CONGELADO' | 'PROYECTADO';

export const COST_POLICY_LABEL: Record<CostPolicy, string> = {
  ULTIMA_COMPRA: 'Última compra (precio nuevo)',
  PROMEDIO: 'Promedio ponderado',
  CONGELADO: 'Congelado (precio anterior)',
  PROYECTADO: 'Proyectado (precio a futuro)',
};

/** Lee la política de costeo de la empresa (parámetro costeo_politica). */
export async function fetchCostPolicy(companyId: string): Promise<CostPolicy> {
  const { data } = await supabase
    .from('company_parameters')
    .select('value')
    .eq('company_id', companyId)
    .eq('key', 'costeo_politica')
    .maybeSingle();
  return (data?.value as CostPolicy) ?? 'ULTIMA_COMPRA';
}

/** Cambia la política de la empresa y recalcula todas las recetas. */
export async function setCostPolicy(companyId: string, policy: CostPolicy): Promise<void> {
  const { error } = await supabase
    .from('company_parameters')
    .update({ value: policy })
    .eq('company_id', companyId)
    .eq('key', 'costeo_politica');
  if (error) throw error;
  // recalcular recetas con la nueva política
  await supabase.rpc('recompute_all_recipes', { p_company_id: companyId });
}

/** Actualiza el costo proyectado o congelado (manual) de un material. */
export async function setMaterialCostOverrides(
  id: string,
  overrides: { projected_cost?: number | null; frozen_cost?: number | null },
): Promise<void> {
  const { error } = await supabase.from('materials').update(overrides).eq('id', id);
  if (error) throw error;
}

export interface CostHistoryRow {
  id: string;
  company_id: string;
  material_id: string;
  old_cost: number | null;
  new_cost: number;
  change_kind: string;
  note: string | null;
  changed_at: string;
}

/** Historial de cambios de costo (opcionalmente de un material). */
export async function fetchCostHistory(materialId?: string): Promise<CostHistoryRow[]> {
  let q = supabase
    .from('material_cost_history')
    .select('*')
    .order('changed_at', { ascending: false });
  if (materialId) q = q.eq('material_id', materialId);
  const { data, error } = await q.limit(1000);
  if (error) throw error;
  return (data ?? []) as CostHistoryRow[];
}

// ─────────────────────────────────────────
// Dashboard de proveedores (migración 009)
// ─────────────────────────────────────────
export interface SupplierSpend {
  company_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  num_compras: number;
  gasto_total: number;
  ticket_promedio: number;
  ultima_compra: string | null;
  insumos_distintos: number;
}

export interface SupplierSpendMonthly {
  company_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  mes: string;
  num_compras: number;
  gasto_mes: number;
}

export interface SupplierPriceVariation {
  company_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  material_id: string;
  material_name: string | null;
  first_cost: number;
  last_cost: number;
  variacion_abs: number;
  variacion_pct: number;
  first_date: string;
  last_date: string;
}

export async function fetchSupplierSpend(): Promise<SupplierSpend[]> {
  const { data, error } = await supabase
    .from('supplier_spend').select('*').order('gasto_total', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SupplierSpend[];
}

export async function fetchSupplierSpendMonthly(): Promise<SupplierSpendMonthly[]> {
  const { data, error } = await supabase
    .from('supplier_spend_monthly').select('*').order('mes');
  if (error) throw error;
  return (data ?? []) as SupplierSpendMonthly[];
}

export async function fetchSupplierPriceVariation(): Promise<SupplierPriceVariation[]> {
  const { data, error } = await supabase
    .from('supplier_price_variation').select('*').order('variacion_pct', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SupplierPriceVariation[];
}

// ─────────────────────────────────────────
// Importación de insumos desde Excel (al nuevo esquema)
// Crea materiales, resolviendo grupo y proveedor por nombre.
// Opcionalmente fija costo inicial y stock inicial (como ajuste).
// ─────────────────────────────────────────
export interface ImportMaterialRow {
  sku?: string;
  name: string;
  base_unit: string;
  unit_cost_per_base: number;
  group_name?: string;
  supplier?: string;
  stock?: number;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; name: string; reason: string }[];
}

export async function importMaterials(
  companyId: string,
  rows: ImportMaterialRow[],
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, skipped: 0, errors: [] };

  // precargar grupos y proveedores existentes
  const [groups, suppliers, existing, locations] = await Promise.all([
    fetchGroups(), fetchSuppliers(), fetchMaterials(), fetchLocations(),
  ]);
  const groupByName = new Map(groups.map((g) => [g.name.toLowerCase(), g.id]));
  const supplierByName = new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id]));
  const existingNames = new Set(existing.map((m) => m.name.toLowerCase()));
  const defaultLoc = locations.find((l) => l.is_default)?.id ?? locations[0]?.id ?? null;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.name?.trim()) { result.errors.push({ row: i + 1, name: r.name ?? '', reason: 'Sin nombre' }); continue; }
      if (existingNames.has(r.name.trim().toLowerCase())) { result.skipped++; continue; }

      // grupo (crear si no existe)
      let groupId: string | null = null;
      if (r.group_name?.trim()) {
        const key = r.group_name.trim().toLowerCase();
        groupId = groupByName.get(key) ?? null;
        if (!groupId) {
          const g = await createGroup(companyId, r.group_name.trim());
          groupId = g.id; groupByName.set(key, g.id);
        }
      }

      // proveedor (crear si no existe)
      let supplierId: string | null = null;
      if (r.supplier?.trim()) {
        const key = r.supplier.trim().toLowerCase();
        supplierId = supplierByName.get(key) ?? null;
        if (!supplierId) {
          const s = await createSupplier(companyId, r.supplier.trim());
          supplierId = s.id; supplierByName.set(key, s.id);
        }
      }

      // crear material con costo inicial
      const mat = await createMaterial(companyId, {
        name: r.name.trim(),
        code: r.sku?.trim() || null,
        group_id: groupId,
        base_unit: r.base_unit?.trim() || 'Und',
        supplier_id: supplierId,
        initial_cost: r.unit_cost_per_base > 0 ? r.unit_cost_per_base : null,
      });
      existingNames.add(r.name.trim().toLowerCase());

      // stock inicial como ajuste de inventario (si viene)
      if (r.stock && r.stock !== 0) {
        await createAdjustment(companyId, {
          material_id: mat.id, location_id: defaultLoc,
          quantity: r.stock, reason: 'Stock inicial (importación Excel)',
        });
      }
      result.created++;
    } catch (e) {
      result.errors.push({ row: i + 1, name: r.name ?? '', reason: (e as Error).message });
    }
  }
  return result;
}
