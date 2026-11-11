// ============================================================
// SUMA ERP — Importador del template completo (4 hojas)
// Lee Insumos, Depreciacion, Recetas y Productos del template
// estándar y los carga resolviendo referencias por NOMBRE/CÓDIGO.
// Las recetas pueden usar otras recetas (cascada); el motor SQL
// (migración 011) las costea recursivamente.
// ============================================================
import { supabase } from '@/services/supabase';

// Filas crudas leídas del Excel (claves = títulos de la fila 3)
export interface RawRow { [key: string]: unknown; }

export interface ImportSummary {
  insumos: number;
  depreciacion: number;
  recetas: number;
  productos: number;
  errores: { hoja: string; fila: number; motivo: string }[];
}

const s = (v: unknown) => (v == null ? '' : String(v).trim());

/** Genera un código legible y estable desde un nombre (slug en MAYÚSCULAS). */
function slugCode(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sin acentos
    .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'REC';
}
const num = (v: unknown) => {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Importa el template completo. Orden: insumos -> depreciación ->
 * recetas (varias pasadas para resolver sub-recetas) -> productos.
 */
export async function importTemplate(
  companyId: string,
  sheets: { insumos: RawRow[]; depreciacion: RawRow[]; recetas: RawRow[]; productos: RawRow[] },
): Promise<ImportSummary> {
  const summary: ImportSummary = { insumos: 0, depreciacion: 0, recetas: 0, productos: 0, errores: [] };

  // ── Catálogos actuales (para resolver por nombre) ──
  const [{ data: groupsData }, { data: suppliersData }, { data: materialsData }, { data: locsData }] = await Promise.all([
    supabase.from('item_groups').select('id,name,kind').eq('kind', 'material'),
    supabase.from('suppliers').select('id,name'),
    supabase.from('materials').select('id,name'),
    supabase.from('locations').select('id,is_default'),
  ]);
  const groupByName = new Map((groupsData ?? []).map((g: any) => [g.name.toLowerCase(), g.id]));
  const supplierByName = new Map((suppliersData ?? []).map((x: any) => [x.name.toLowerCase(), x.id]));
  const materialByName = new Map((materialsData ?? []).map((m: any) => [m.name.toLowerCase(), m.id]));
  const defaultLoc = (locsData ?? []).find((l: any) => l.is_default)?.id ?? (locsData ?? [])[0]?.id ?? null;

  const ensureGroup = async (name: string): Promise<string | null> => {
    if (!name) return null;
    const key = name.toLowerCase();
    if (groupByName.has(key)) return groupByName.get(key)!;
    const { data, error } = await supabase.from('item_groups').insert({ company_id: companyId, name, kind: 'material' }).select('id').single();
    if (error) throw error;
    groupByName.set(key, data.id); return data.id;
  };
  const ensureSupplier = async (name: string): Promise<string | null> => {
    if (!name) return null;
    const key = name.toLowerCase();
    if (supplierByName.has(key)) return supplierByName.get(key)!;
    const { data, error } = await supabase.from('suppliers').insert({ company_id: companyId, name }).select('id').single();
    if (error) throw error;
    supplierByName.set(key, data.id); return data.id;
  };

  // ── 1) INSUMOS ──────────────────────────────────────
  for (let i = 0; i < sheets.insumos.length; i++) {
    const r = sheets.insumos[i];
    const name = s(r['Nombre']);
    if (!name) continue;
    if (materialByName.has(name.toLowerCase())) continue; // ya existe
    try {
      const groupId = await ensureGroup(s(r['Grupo']));
      const supplierId = await ensureSupplier(s(r['Proveedor']));
      const cost = num(r['Costo por unidad']);
      const { data, error } = await supabase.from('materials').insert({
        company_id: companyId, name, base_unit: s(r['Unidad']) || 'Und',
        group_id: groupId, supplier_id: supplierId,
        unit_cost_per_base: cost > 0 ? cost : 0,
      }).select('id').single();
      if (error) throw error;
      materialByName.set(name.toLowerCase(), data.id);
      // stock inicial
      const stock = num(r['Stock inicial']);
      if (stock !== 0) {
        await supabase.from('inventory_movements').insert({
          company_id: companyId, location_id: defaultLoc, material_id: data.id,
          movement_type: 'AJUSTE', quantity: stock, unit_cost: cost, reference_type: 'adjustment',
          reason: 'Stock inicial (importación)',
        });
      }
      summary.insumos++;
    } catch (e) { summary.errores.push({ hoja: 'Insumos', fila: i + 4, motivo: (e as Error).message }); }
  }

  // ── 2) DEPRECIACION ─────────────────────────────────
  const resourceByName = new Map<string, string>();
  {
    const { data } = await supabase.from('depreciable_resources').select('id,name');
    for (const d of data ?? []) resourceByName.set((d as any).name.toLowerCase(), (d as any).id);
  }
  for (let i = 0; i < sheets.depreciacion.length; i++) {
    const r = sheets.depreciacion[i];
    const name = s(r['Nombre']);
    if (!name) continue;
    if (resourceByName.has(name.toLowerCase())) continue;
    try {
      const { data, error } = await supabase.from('depreciable_resources').insert({
        company_id: companyId, name,
        method: s(r['Tipo']) || 'POR_USO',
        total_cost: num(r['Costo total']),
        uses_estimated: num(r['Usos estimados']) || null,
        life_months: num(r['Vida util meses']) || null,
        units_per_month: null,
        note: s(r['Nota']) || null,
      }).select('id').single();
      if (error) throw error;
      resourceByName.set(name.toLowerCase(), data.id);
      summary.depreciacion++;
    } catch (e) { summary.errores.push({ hoja: 'Depreciacion', fila: i + 4, motivo: (e as Error).message }); }
  }

  // ── 3) RECETAS (agrupar filas por receta) ───────────
  // Agrupamos por 'Receta' (nombre) o por 'Codigo receta' si viene.
  const recipeGroups = groupBy(sheets.recetas, (r) => s(r['Codigo receta']) || s(r['Receta']));
  const recipeByKey = new Map<string, string>(); // key (code o nombre) -> recipe_id

  // Precargar recetas existentes por código y nombre
  {
    const { data } = await supabase.from('recipes').select('id,code,product');
    for (const rr of data ?? []) {
      if ((rr as any).code) recipeByKey.set(String((rr as any).code).toLowerCase(), (rr as any).id);
      recipeByKey.set(String((rr as any).product).toLowerCase(), (rr as any).id);
    }
  }

  // Crear primero los "cascarones" de receta (para poder referenciar sub-recetas)
  for (const [key, rows] of recipeGroups) {
    if (!key) continue;
    if (recipeByKey.has(key.toLowerCase())) continue;
    const first = rows[0];
    try {
      const { data, error } = await supabase.from('recipes').insert({
        company_id: companyId,
        product: s(first['Receta']) || key,
        code: s(first['Codigo receta']) || slugCode(s(first['Receta']) || key),
        yield_qty: num(first['Rinde cantidad']) || 1,
        yield_unit: s(first['Rinde unidad']) || 'Und',
        margin: (num(first['Margen seguridad %']) || 0) / 100,
        price_mode: 'MARKUP',
      }).select('id').single();
      if (error) throw error;
      recipeByKey.set(key.toLowerCase(), data.id);
      const code = s(first['Codigo receta']);
      if (code) recipeByKey.set(code.toLowerCase(), data.id);
      summary.recetas++;
    } catch (e) { summary.errores.push({ hoja: 'Recetas', fila: 4, motivo: `${key}: ${(e as Error).message}` }); }
  }

  // Ahora insertar las líneas de cada receta (resolviendo referencias)
  for (const [key, rows] of recipeGroups) {
    const recipeId = recipeByKey.get(key.toLowerCase());
    if (!recipeId) continue;
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
    const lines: any[] = [];
    rows.forEach((r, idx) => {
      const tipo = (s(r['Tipo ingrediente']) || 'INSUMO').toUpperCase();
      const ingrediente = s(r['Ingrediente']);
      const qty = num(r['Cantidad']);
      const unit = s(r['Unidad']) || 'Und';
      const base: any = { recipe_id: recipeId, name: ingrediente, qty, unit, unit_cost_per_base: 0, sort_order: idx };
      if (tipo === 'INSUMO' || tipo === 'INSUMOS') {
        base.line_kind = 'MATERIAL';
        base.material_id = materialByName.get(ingrediente.toLowerCase()) ?? null;
      } else if (tipo === 'DEPRECIACION' || tipo === 'MOLDES') {
        base.line_kind = 'DEPRECIACION';
        base.resource_id = resourceByName.get(ingrediente.toLowerCase()) ?? null;
      } else if (tipo === 'RECETA' || tipo === 'SUBRECETA') {
        base.line_kind = 'SUBRECETA';
        base.sub_recipe_id = recipeByKey.get(ingrediente.toLowerCase()) ?? null;
      } else {
        base.line_kind = 'MATERIAL';
        base.material_id = materialByName.get(ingrediente.toLowerCase()) ?? null;
      }
      lines.push(base);
    });
    if (lines.length) {
      const { error } = await supabase.from('recipe_ingredients').insert(lines);
      if (error) summary.errores.push({ hoja: 'Recetas', fila: 4, motivo: `${key}: ${error.message}` });
    }
  }

  // ── 4) PRODUCTOS (se modelan como recetas 'producto') ──
  const prodGroups = groupBy(sheets.productos, (r) => s(r['Codigo producto']) || s(r['Producto']));
  for (const [key, rows] of prodGroups) {
    if (!key) continue;
    const first = rows[0];
    try {
      let recipeId = recipeByKey.get(key.toLowerCase());
      if (!recipeId) {
        const { data, error } = await supabase.from('recipes').insert({
          company_id: companyId,
          product: s(first['Producto']) || key,
          code: s(first['Codigo producto']) || slugCode(s(first['Producto']) || key),
          yield_qty: 1, yield_unit: 'Und',
          margin: (num(first['Margen ganancia %']) || 0) / 100,
          gateway_fee_pct: (num(first['Comision pago %']) || 0) / 100,
          price_mode: 'MARKUP',
        }).select('id').single();
        if (error) throw error;
        recipeId = data.id;
        recipeByKey.set(key.toLowerCase(), data.id);
      }
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
      const lines = rows.map((r, idx) => {
        const tipo = (s(r['Tipo componente']) || 'RECETA').toUpperCase();
        const comp = s(r['Componente']);
        const base: any = { recipe_id: recipeId, name: comp, qty: num(r['Unidades']) || 1, unit: 'Und', unit_cost_per_base: 0, sort_order: idx };
        if (tipo === 'INSUMO' || tipo === 'INSUMOS') {
          base.line_kind = 'MATERIAL';
          base.material_id = materialByName.get(comp.toLowerCase()) ?? null;
        } else {
          base.line_kind = 'SUBRECETA';
          base.sub_recipe_id = recipeByKey.get(comp.toLowerCase()) ?? null;
        }
        return base;
      });
      if (lines.length) await supabase.from('recipe_ingredients').insert(lines);
      summary.productos++;
    } catch (e) { summary.errores.push({ hoja: 'Productos', fila: 4, motivo: `${key}: ${(e as Error).message}` }); }
  }

  return summary;
}

function groupBy<T>(arr: T[], keyFn: (x: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = keyFn(item);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}
