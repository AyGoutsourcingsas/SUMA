// ============================================================
// SUMA ERP — Importador Multi-Hoja de Plantilla Completa
// Lee todas las hojas de la plantilla (Base Madre, Depreciación,
// Recetas N1, Recetas N2, Productos) en un solo proceso.
// ============================================================
import * as XLSX from 'xlsx';
import { supabase } from '@/services/supabase';

export interface SheetDetection {
  name: string;
  count: number;
  type: 'base_madre' | 'depreciacion' | 'n1_recetas' | 'n2_recetas' | 'productos' | 'desconocida';
}

export interface MultiSheetSummary {
  insumos: number;
  grupos: number;
  proveedores: number;
  depreciaciones: number;
  recetasN1: number;
  lineasN1: number;
  recetasN2: number;
  lineasN2: number;
  errors: string[];
}

export function parseNumber(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let str = String(v).trim().replace(/[^0-9.,-]/g, '');
  if (!str) return 0;
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) str = str.replace(/\./g, '').replace(',', '.');
    else str = str.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const parts = str.split(',');
    str = (parts.length === 2 && parts[1].length <= 2) ? str.replace(',', '.') : str.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const parts = str.split('.');
    str = (parts.length === 2 && parts[1].length <= 2) ? str : str.replace(/\./g, '');
  }
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : 0;
}

const norm = (s: string) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

function findSheet(wb: XLSX.WorkBook, keywords: string[]): string | null {
  for (const name of wb.SheetNames) {
    const n = norm(name);
    for (const kw of keywords) {
      if (n.includes(norm(kw))) return name;
    }
  }
  return null;
}

function extractRowsWithHeaders(ws: XLSX.WorkSheet, candidateHeaderKeywords: string[]): Record<string, any>[] {
  const rawMatrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
  if (!rawMatrix || rawMatrix.length === 0) return [];

  // Buscar fila con más coincidencias
  let bestRowIdx = -1;
  let maxMatches = 0;
  for (let r = 0; r < Math.min(rawMatrix.length, 30); r++) {
    const row = rawMatrix[r];
    if (!Array.isArray(row)) continue;
    let matches = 0;
    for (const cell of row) {
      const c = norm(String(cell));
      if (candidateHeaderKeywords.some((kw) => c.includes(norm(kw)))) {
        matches++;
      }
    }
    if (matches > maxMatches) {
      maxMatches = matches;
      bestRowIdx = r;
    }
  }

  if (bestRowIdx === -1 || maxMatches === 0) {
    // Si no detectó por keywords, usar fila 0 si tiene texto
    bestRowIdx = 0;
  }

  const headers = (rawMatrix[bestRowIdx] || []).map((h, i) => norm(String(h)) || `col_${i}`);
  const result: Record<string, any>[] = [];

  for (let r = bestRowIdx + 1; r < rawMatrix.length; r++) {
    const rowArr = rawMatrix[r];
    if (!Array.isArray(rowArr)) continue;
    const obj: Record<string, any> = {};
    let hasData = false;

    headers.forEach((h, i) => {
      const val = rowArr[i];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        hasData = true;
      }
      obj[h] = val;
    });

    if (hasData) {
      result.push(obj);
    }
  }

  return result;
}

function getField(row: Record<string, any>, aliases: string[]): any {
  for (const alias of aliases) {
    const key = norm(alias);
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key];
    }
    // Búsqueda parcial de clave
    for (const rowKey of Object.keys(row)) {
      if (rowKey.includes(key)) {
        const val = row[rowKey];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return val;
        }
      }
    }
  }
  return '';
}

/**
 * Analiza un workbook de Excel y detecta qué hojas contiene y cuántas filas tiene cada una.
 */
export function analyzeWorkbook(wb: XLSX.WorkBook): SheetDetection[] {
  const detections: SheetDetection[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const n = norm(sheetName);

    let type: SheetDetection['type'] = 'desconocida';
    if (n.includes('base') || n.includes('materia') || n.includes('insumo')) {
      type = 'base_madre';
    } else if (n.includes('deprec')) {
      type = 'depreciacion';
    } else if (n.includes('n1') || (n.includes('receta') && !n.includes('n2'))) {
      type = 'n1_recetas';
    } else if (n.includes('n2') || n.includes('producto')) {
      type = 'n2_recetas';
    }

    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
    detections.push({
      name: sheetName,
      count: Math.max(0, rows.length - 4),
      type,
    });
  }

  return detections;
}

/**
 * Ejecuta la importación completa de todas las hojas disponibles en el workbook.
 */
export async function importCompleteWorkbook(
  companyId: string,
  wb: XLSX.WorkBook
): Promise<MultiSheetSummary> {
  const summary: MultiSheetSummary = {
    insumos: 0,
    grupos: 0,
    proveedores: 0,
    depreciaciones: 0,
    recetasN1: 0,
    lineasN1: 0,
    recetasN2: 0,
    lineasN2: 0,
    errors: [],
  };

  // 1. Precargar catálogos
  const [gRes, sRes, mRes, dRes] = await Promise.all([
    supabase.from('item_groups').select('id, name, kind').eq('company_id', companyId),
    supabase.from('suppliers').select('id, name').eq('company_id', companyId),
    supabase.from('materials').select('id, name, code').eq('company_id', companyId),
    supabase.from('depreciations').select('id, asset_name').eq('company_id', companyId),
  ]);

  const groupMap = new Map<string, string>(); // 'material:nombre' -> id
  (gRes.data ?? []).forEach((g: any) => groupMap.set(`${g.kind}:${norm(g.name)}`, g.id));

  const supplierMap = new Map<string, string>();
  (sRes.data ?? []).forEach((s: any) => supplierMap.set(norm(s.name), s.id));

  const materialMap = new Map<string, { id: string; cost: number; unit: string }>();
  (mRes.data ?? []).forEach((m: any) => materialMap.set(norm(m.name), { id: m.id, cost: m.unit_cost_per_base || 0, unit: m.base_unit || 'Und' }));

  const depMap = new Map<string, string>();
  (dRes.data ?? []).forEach((d: any) => depMap.set(norm(d.asset_name), d.id));

  const ensureGroup = async (name: string, kind: 'material' | 'recipe' = 'material'): Promise<string | null> => {
    if (!name?.trim()) return null;
    const cleanName = name.trim();
    const key = `${kind}:${norm(cleanName)}`;
    if (groupMap.has(key)) return groupMap.get(key)!;

    try {
      const { data, error } = await supabase
        .from('item_groups')
        .insert({ company_id: companyId, name: cleanName, kind })
        .select('id')
        .single();
      if (!error && data) {
        groupMap.set(key, data.id);
        summary.grupos++;
        return data.id;
      }
    } catch {
      // ignore
    }
    return null;
  };

  const ensureSupplier = async (name: string): Promise<string | null> => {
    if (!name?.trim()) return null;
    const cleanName = name.trim();
    const key = norm(cleanName);
    if (supplierMap.has(key)) return supplierMap.get(key)!;

    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert({ company_id: companyId, name: cleanName })
        .select('id')
        .single();
      if (!error && data) {
        supplierMap.set(key, data.id);
        summary.proveedores++;
        return data.id;
      }
    } catch {
      // ignore
    }
    return null;
  };

  // ─────────────────────────────────────────────────────────────
  // 1. IMPORTAR BASE MADRE (INSUMOS)
  // ─────────────────────────────────────────────────────────────
  const sBaseMadre = findSheet(wb, ['base_madre', 'base madre', 'insumo', 'materia prima', 'materias primas']);
  if (sBaseMadre) {
    const ws = wb.Sheets[sBaseMadre];
    const rows = extractRowsWithHeaders(ws, ['nombre', 'unidad', 'costo', 'grupo', 'codigo']);

    const materialsToInsert: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const name = String(getField(r, ['nombre', 'insumo', 'material', 'descripcion'])).trim();
      if (!name || name === '0' || name.toLowerCase() === 'nan') continue;

      const groupName = String(getField(r, ['grupo', 'categoria', 'tipo'])).trim();
      const supplierName = String(getField(r, ['proveedor', 'calc_proveedor'])).trim();
      const code = String(getField(r, ['codigo', 'sku', 'ref'])).trim() || null;
      const unit = String(getField(r, ['unidad', 'base_unit', 'u.m.'])).trim() || 'Und';
      const cost = parseNumber(getField(r, ['calc_costo_unidad', 'costo', 'calc_costo_total', 'costo_total', 'precio', 'valor']));
      const stock = parseNumber(getField(r, ['calc_peso_ultima_compra', 'stock', 'cantidad', 'peso']));

      const groupId = groupName ? await ensureGroup(groupName, 'material') : null;
      const supplierId = supplierName ? await ensureSupplier(supplierName) : null;

      materialsToInsert.push({
        company_id: companyId,
        code,
        name,
        base_unit: unit,
        unit_cost_per_base: cost,
        group_id: groupId,
        supplier_id: supplierId,
        stock,
        stock_min: 0,
      });
    }

    if (materialsToInsert.length > 0) {
      for (const item of materialsToInsert) {
        try {
          const { data, error } = await supabase.from('materials').insert(item).select('id, name, unit_cost_per_base, base_unit').single();
          if (!error && data) {
            materialMap.set(norm(data.name), { id: data.id, cost: data.unit_cost_per_base, unit: data.base_unit });
            summary.insumos++;
          }
        } catch (e: any) {
          summary.errors.push(`Error en insumo ${item.name}: ${e?.message}`);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. IMPORTAR DEPRECIACIONES
  // ─────────────────────────────────────────────────────────────
  const sDepr = findSheet(wb, ['depreciacion', 'depreciaciones', 'moldes', 'activos']);
  if (sDepr) {
    const ws = wb.Sheets[sDepr];
    const rows = extractRowsWithHeaders(ws, ['activo', 'metodo', 'categoria', 'costo', 'usos']);

    for (const r of rows) {
      const assetName = String(getField(r, ['activo', 'nombre', 'herramienta', 'molde'])).trim();
      if (!assetName || assetName === '0') continue;

      const rawMethod = String(getField(r, ['metodo', 'tipo'])).toUpperCase();
      const method = rawMethod.includes('USO') ? 'USO' : 'TIEMPO';

      const rawCat = String(getField(r, ['categoria'])).toUpperCase();
      let category = 'EQUIPO';
      if (rawCat.includes('MOLDE')) category = 'MOLDE';
      else if (rawCat.includes('FIGURA')) category = 'FIGURA';
      else if (rawCat.includes('HERRAMIENTA')) category = 'HERRAMIENTA';

      const totalCost = parseNumber(getField(r, ['costo_manual', 'calc_costo_total_activo', 'costo', 'valor']));
      const usefulLife = parseNumber(getField(r, ['vida_util_meses', 'meses', 'vida_util']));
      const estimatedUses = parseNumber(getField(r, ['usos_estimados', 'usos']));
      const note = String(getField(r, ['nota', 'descripcion'])).trim() || null;

      try {
        const { data, error } = await supabase
          .from('depreciations')
          .insert({
            company_id: companyId,
            asset_name: assetName,
            category,
            method,
            total_cost: totalCost,
            useful_life_months: method === 'TIEMPO' ? (usefulLife || 24) : null,
            estimated_uses: method === 'USO' ? (estimatedUses || 100) : null,
            salvage_value: 0,
            units_per_month: 100,
            notes: note,
          })
          .select('id, asset_name')
          .single();

        if (!error && data) {
          depMap.set(norm(data.asset_name), data.id);
          summary.depreciaciones++;
        }
      } catch (e: any) {
        summary.errors.push(`Error en depreciación ${assetName}: ${e?.message}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. IMPORTAR RECETAS NIVEL 1
  // ─────────────────────────────────────────────────────────────
  const sN1Recetas = findSheet(wb, ['n1_recetas', 'recetas n1', 'subrecetas']);
  const sN1Lineas = findSheet(wb, ['n1_lineas', 'lineas n1', 'ingredientes n1']);

  const n1RecipeMap = new Map<string, string>(); // code/name -> recipe_id

  if (sN1Recetas) {
    const ws = wb.Sheets[sN1Recetas];
    const rows = extractRowsWithHeaders(ws, ['codigo', 'nombre', 'rendimiento', 'costo']);

    for (const r of rows) {
      const name = String(getField(r, ['nombre', 'receta', 'subreceta', 'producto'])).trim();
      if (!name) continue;

      const code = String(getField(r, ['codigo', 'ref', 'sku'])).trim() || null;
      const type = String(getField(r, ['tipo'])).trim() || 'SUBRECETA';
      const yieldQty = parseNumber(getField(r, ['rendimiento', 'rinde_cantidad', 'cantidad'])) || 1;
      const yieldUnit = String(getField(r, ['unidad_rendimiento', 'rinde_unidad', 'unidad'])).trim() || 'Und';
      const margin = parseNumber(getField(r, ['margen_seguridad_pct', 'margen'])) / 100;
      const totalCost = parseNumber(getField(r, ['calc_total', 'calc_costo_final', 'costo_total', 'costo']));

      try {
        const { data, error } = await supabase
          .from('recipes')
          .insert({
            company_id: companyId,
            level: 1,
            product: name,
            code,
            recipe_type: type,
            yield_qty: yieldQty,
            yield_unit: yieldUnit,
            margin: margin || 0,
            total_cost: totalCost || 0,
            computed_price: totalCost,
            final_price: totalCost,
          })
          .select('id, product, code')
          .single();

        if (!error && data) {
          n1RecipeMap.set(norm(data.product), data.id);
          if (data.code) n1RecipeMap.set(norm(data.code), data.id);
          summary.recetasN1++;
        }
      } catch (e: any) {
        summary.errors.push(`Error en receta N1 ${name}: ${e?.message}`);
      }
    }

    // Importar líneas N1 si existe la hoja
    if (sN1Lineas) {
      const wsL = wb.Sheets[sN1Lineas];
      const lineRows = extractRowsWithHeaders(wsL, ['receta', 'ingrediente', 'cantidad']);

      const linesByRecipe = new Map<string, any[]>();
      for (const lr of lineRows) {
        const recipeKey = norm(String(getField(lr, ['receta_codigo', 'receta', 'codigo'])));
        if (!recipeKey) continue;
        if (!linesByRecipe.has(recipeKey)) linesByRecipe.set(recipeKey, []);
        linesByRecipe.get(recipeKey)!.push(lr);
      }

      for (const [recipeKey, lines] of linesByRecipe.entries()) {
        const recipeId = n1RecipeMap.get(recipeKey);
        if (!recipeId) continue;

        const preparedLines: any[] = [];
        lines.forEach((l, idx) => {
          const ingName = String(getField(l, ['ingrediente', 'nombre', 'material'])).trim();
          if (!ingName) return;

          const qty = parseNumber(getField(l, ['cantidad', 'qty'])) || 1;
          const unit = String(getField(l, ['unidad', 'unit'])).trim() || 'g';
          const lineCostUnit = parseNumber(getField(l, ['calc_costo_unitario', 'costo_unitario', 'costo']));

          const mat = materialMap.get(norm(ingName));
          const depId = depMap.get(norm(ingName));

          let lineKind = 'MATERIAL';
          let materialId: string | null = null;
          let depreciationId: string | null = null;

          if (depId) {
            lineKind = 'DEPRECIACION';
            depreciationId = depId;
          } else if (mat) {
            lineKind = 'MATERIAL';
            materialId = mat.id;
          } else {
            lineKind = 'MANUAL';
          }

          preparedLines.push({
            recipe_id: recipeId,
            line_kind: lineKind,
            material_id: materialId,
            depreciation_id: depreciationId,
            name: ingName,
            qty,
            unit,
            unit_cost_per_base: lineCostUnit || (mat ? mat.cost : 0),
            sort_order: idx,
          });
        });

        if (preparedLines.length > 0) {
          const { error } = await supabase.from('recipe_ingredients').insert(preparedLines);
          if (!error) summary.lineasN1 += preparedLines.length;
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 4. IMPORTAR RECETAS NIVEL 2 / PRODUCTOS
  // ─────────────────────────────────────────────────────────────
  const sN2Recetas = findSheet(wb, ['n2_recetas', 'recetas n2', 'productos']);
  const sN2Lineas = findSheet(wb, ['n2_lineas', 'lineas n2', 'producto_lineas', 'componentes']);

  const n2RecipeMap = new Map<string, string>();

  if (sN2Recetas) {
    const ws = wb.Sheets[sN2Recetas];
    const rows = extractRowsWithHeaders(ws, ['codigo', 'nombre', 'rendimiento', 'costo', 'margen']);

    for (const r of rows) {
      const name = String(getField(r, ['nombre', 'producto', 'receta'])).trim();
      if (!name) continue;

      const code = String(getField(r, ['codigo', 'ref', 'sku'])).trim() || null;
      const type = String(getField(r, ['tipo'])).trim() || 'PRODUCTO';
      const yieldQty = parseNumber(getField(r, ['rendimiento', 'rinde_cantidad', 'cantidad'])) || 1;
      const yieldUnit = String(getField(r, ['unidad_rendimiento', 'rinde_unidad', 'unidad'])).trim() || 'Und';
      const margin = parseNumber(getField(r, ['margen_seguridad_pct', 'margen_objetivo', 'margen'])) / 100;
      const totalCost = parseNumber(getField(r, ['calc_total', 'calc_costo_total', 'costo_total', 'costo']));
      const finalPrice = parseNumber(getField(r, ['precio_final', 'calc_precio_sugerido', 'precio']));

      try {
        const { data, error } = await supabase
          .from('recipes')
          .insert({
            company_id: companyId,
            level: 2,
            product: name,
            code,
            recipe_type: type,
            yield_qty: yieldQty,
            yield_unit: yieldUnit,
            margin: margin || 0.3,
            total_cost: totalCost || 0,
            computed_price: finalPrice || totalCost * 1.3,
            final_price: finalPrice || null,
          })
          .select('id, product, code')
          .single();

        if (!error && data) {
          n2RecipeMap.set(norm(data.product), data.id);
          if (data.code) n2RecipeMap.set(norm(data.code), data.id);
          summary.recetasN2++;
        }
      } catch (e: any) {
        summary.errors.push(`Error en receta N2 ${name}: ${e?.message}`);
      }
    }

    if (sN2Lineas) {
      const wsL = wb.Sheets[sN2Lineas];
      const lineRows = extractRowsWithHeaders(wsL, ['receta', 'producto', 'componente', 'ingrediente']);

      const linesByRecipe = new Map<string, any[]>();
      for (const lr of lineRows) {
        const recipeKey = norm(String(getField(lr, ['receta_codigo', 'producto_codigo', 'receta', 'producto', 'codigo'])));
        if (!recipeKey) continue;
        if (!linesByRecipe.has(recipeKey)) linesByRecipe.set(recipeKey, []);
        linesByRecipe.get(recipeKey)!.push(lr);
      }

      for (const [recipeKey, lines] of linesByRecipe.entries()) {
        const recipeId = n2RecipeMap.get(recipeKey);
        if (!recipeId) continue;

        const preparedLines: any[] = [];
        lines.forEach((l, idx) => {
          const compName = String(getField(l, ['componente', 'ingrediente', 'nombre', 'material'])).trim();
          if (!compName) return;

          const qty = parseNumber(getField(l, ['unidades', 'cantidad', 'qty'])) || 1;
          const unit = String(getField(l, ['calc_unidad_rendimiento', 'unidad', 'unit'])).trim() || 'Und';
          const lineCostUnit = parseNumber(getField(l, ['calc_costo_unidad', 'costo_unitario', 'costo']));

          const n1RefId = n1RecipeMap.get(norm(compName));
          const mat = materialMap.get(norm(compName));
          const depId = depMap.get(norm(compName));

          let lineKind = 'MATERIAL';
          let materialId: string | null = null;
          let depreciationId: string | null = null;
          let recipeRefId: string | null = null;

          if (n1RefId) {
            lineKind = 'RECETA_N1';
            recipeRefId = n1RefId;
          } else if (depId) {
            lineKind = 'DEPRECIACION';
            depreciationId = depId;
          } else if (mat) {
            lineKind = 'MATERIAL';
            materialId = mat.id;
          } else {
            lineKind = 'MANUAL';
          }

          preparedLines.push({
            recipe_id: recipeId,
            line_kind: lineKind,
            material_id: materialId,
            depreciation_id: depreciationId,
            recipe_ref_id: recipeRefId,
            name: compName,
            qty,
            unit,
            unit_cost_per_base: lineCostUnit || (mat ? mat.cost : 0),
            sort_order: idx,
          });
        });

        if (preparedLines.length > 0) {
          const { error } = await supabase.from('recipe_ingredients').insert(preparedLines);
          if (!error) summary.lineasN2 += preparedLines.length;
        }
      }
    }
  }

  return summary;
}
