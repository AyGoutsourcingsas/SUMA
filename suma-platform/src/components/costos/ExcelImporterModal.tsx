// ============================================================
// SUMA Platform — Importador Excel/CSV para Insumos (Módulo Costos/Inventarios)
// ============================================================
import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Check, ArrowRight, Layers, CheckCircle2, Sparkles, Database, TrendingDown, Star } from 'lucide-react';
import { Button, Modal, Alert, Badge } from '@/components/ui';
import { formatCOP } from '@/config/brand';
import { importMaterials, type ImportMaterialRow } from '@/services/modules/inventario';
import { useActiveCompanyId, useAppStore } from '@/store/AppStore';
import {
  analyzeWorkbook,
  importCompleteWorkbook,
  type SheetDetection,
  type MultiSheetSummary,
} from '@/services/modules/workbookImporter';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (count: number) => void;
}

type ColumnKey = 'sku' | 'name' | 'base_unit' | 'unit_cost_per_base' | 'group_name' | 'supplier' | 'stock';

interface ColumnDefinition {
  key: ColumnKey;
  label: string;
  required: boolean;
  aliases: string[];
}

const REQUIRED_FIELDS: ColumnDefinition[] = [
  { key: 'name', label: 'Nombre del Insumo / Producto', required: true, aliases: ['nombre', 'producto', 'nombre producto', 'descripcion', 'item', 'materia prima', 'material'] },
  { key: 'base_unit', label: 'Unidad Base (Gr, Ml, Und, etc.)', required: true, aliases: ['unidad', 'und', 'medida', 'u.m.', 'unidad de medida', 'base_unit'] },
  { key: 'unit_cost_per_base', label: 'Costo por Unidad Base', required: true, aliases: ['costo unidad gr/lt/und', 'costo unitario', 'costo unidad', 'costo/unidad', 'valor unitario', 'costo gramo', 'costo gr', 'costo', 'calc_costo_unidad', 'calc_costo_total', 'calc_costo_promedio', 'costo_total', 'precio', 'valor'] },
  { key: 'sku', label: 'Código / SKU', required: false, aliases: ['sku', 'codigo', 'cod', 'código', 'referencia', 'ref'] },
  { key: 'group_name', label: 'Grupo / Categoría', required: false, aliases: ['grupo', 'grupo de inventario', 'categoria', 'categoría', 'departamento', 'tipo'] },
  { key: 'supplier', label: 'Proveedor', required: false, aliases: ['proveedor', 'calc_proveedor', 'distribuidor', 'marca', 'comprado en'] },
  { key: 'stock', label: 'Cantidad / Stock / Peso Inicial', required: false, aliases: ['peso', 'cantidad', 'stock', 'cant', 'existencias', 'saldo', 'calc_peso_ultima_compra'] },
];

function parseNumber(v: unknown): number {
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

export function ExcelImporterModal({ isOpen, onClose, onImportSuccess }: Props) {
  const { state } = useAppStore();
  const activeCompanyId = useActiveCompanyId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'multi_sheet' | 'mapping' | 'preview'>('upload');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [detections, setDetections] = useState<SheetDetection[]>([]);
  const [multiSummary, setMultiSummary] = useState<MultiSheetSummary | null>(null);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<ColumnKey, string>>({
    name: '',
    base_unit: '',
    unit_cost_per_base: '',
    sku: '',
    group_name: '',
    supplier: '',
    stock: '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetState = () => {
    setStep('upload');
    setSheetNames([]);
    setSelectedSheet('');
    setWorkbook(null);
    setHeaders([]);
    setRawRows([]);
    setColumnMapping({
      name: '',
      base_unit: '',
      unit_cost_per_base: '',
      sku: '',
      group_name: '',
      supplier: '',
      stock: '',
    });
    setDetections([]);
    setMultiSummary(null);
    setError(null);
    setSaving(false);
  };

  const processFile = (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        setWorkbook(wb);
        setSheetNames(wb.SheetNames);

        const det = analyzeWorkbook(wb);
        setDetections(det);
        const costSheets = det.filter(d => d.type !== 'desconocida');

        if (costSheets.length >= 2) {
          // Si el archivo tiene múltiples hojas de Costos (Base Madre, Depreciación, Recetas...)
          setStep('multi_sheet');
        } else {
          // Preseleccionar hoja típica como "BASE MADRE" o la primera
          const defaultSheet = wb.SheetNames.find(s => s.toUpperCase().includes('BASE') || s.toUpperCase().includes('MATERIA') || s.toUpperCase().includes('INSUMO')) || wb.SheetNames[0];
          setSelectedSheet(defaultSheet);
          parseSheet(wb, defaultSheet);
        }
      } catch (err) {
        setError('No se pudo leer el archivo Excel/CSV. Verifica que no esté dañado.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportAllSheets = async () => {
    if (!workbook) return;
    const companyId = activeCompanyId || state.company?.id || localStorage.getItem('suma-active-company') || '';
    if (!companyId) {
      setError('Selecciona una empresa activa antes de importar (barra superior).');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await importCompleteWorkbook(companyId, workbook);
      setMultiSummary(res);
      onImportSuccess(res.insumos + res.depreciaciones + res.recetasN1 + res.recetasN2);
    } catch (err: any) {
      setError(err?.message || 'Error al importar las hojas del archivo Excel.');
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const parseSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return;

    // Convertir hoja a matriz cruda para detectar encabezados reales
    const rawMatrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
    if (!rawMatrix || rawMatrix.length === 0) {
      setError(`La hoja "${sheetName}" está vacía.`);
      return;
    }

    // Buscar la fila que tenga más coincidencias con encabezados comunes (ej: NOMBRE PRODUCTO, UNIDAD, COSTO)
    let bestHeaderRowIndex = 0;
    let maxMatches = -1;

    for (let r = 0; r < Math.min(rawMatrix.length, 30); r++) {
      const row = rawMatrix[r];
      if (!Array.isArray(row)) continue;
      const rowStr = row.map(c => String(c).trim().toLowerCase());
      
      let matches = 0;
      for (const def of REQUIRED_FIELDS) {
        if (rowStr.some(cell => def.aliases.some(alias => cell.includes(alias)))) {
          matches++;
        }
      }
      if (matches > maxMatches) {
        maxMatches = matches;
        bestHeaderRowIndex = r;
      }
    }

    const headerRow = (rawMatrix[bestHeaderRowIndex] || []).map((h: any, idx: number) => {
      const str = String(h).trim();
      return str || `Columna_${idx + 1}`;
    });

    // Leer las filas de datos desde la fila posterior a los encabezados
    const rowsData: Record<string, any>[] = [];
    for (let r = bestHeaderRowIndex + 1; r < rawMatrix.length; r++) {
      const rowArr = rawMatrix[r];
      if (!rowArr || !Array.isArray(rowArr)) continue;

      const obj: Record<string, any> = {};
      let hasData = false;

      headerRow.forEach((colName: string, colIdx: number) => {
        const val = rowArr[colIdx];
        if (val !== undefined && val !== null && val !== '') {
          hasData = true;
        }
        obj[colName] = val;
      });

      // Evitar filas vacías
      if (hasData) {
        rowsData.push(obj);
      }
    }

    setHeaders(headerRow);
    setRawRows(rowsData);

    // Auto-mapeo inteligente según aliases
    const autoMapping: Record<ColumnKey, string> = {
      name: '',
      base_unit: '',
      unit_cost_per_base: '',
      sku: '',
      group_name: '',
      supplier: '',
      stock: '',
    };

    REQUIRED_FIELDS.forEach((fieldDef) => {
      const match = headerRow.find((h) => {
        const norm = h.toLowerCase().trim();
        return fieldDef.aliases.some(alias => norm === alias || norm.includes(alias));
      });
      if (match) {
        autoMapping[fieldDef.key] = match;
      }
    });

    setColumnMapping(autoMapping);
    setStep('mapping');
  };

  const handleSheetChange = (sheet: string) => {
    setSelectedSheet(sheet);
    if (workbook) {
      parseSheet(workbook, sheet);
    }
  };

  const handleConfirmMapping = () => {
    if (!columnMapping.name) {
      setError('Debes asignar una columna para el Nombre del Insumo.');
      return;
    }
    if (!columnMapping.base_unit) {
      setError('Debes asignar una columna para la Unidad Base.');
      return;
    }
    if (!columnMapping.unit_cost_per_base) {
      setError('Debes asignar una columna para el Costo por Unidad Base.');
      return;
    }
    setError(null);
    setStep('preview');
  };

  // Convertir filas sin formato a objetos limpios de tipo InventoryItem
  const preparedItems = rawRows
    .map((row, idx) => {
      const name = String(row[columnMapping.name] || '').trim();
      if (!name || name === '0' || name.toLowerCase() === 'nan') return null;

      const baseUnit = String(row[columnMapping.base_unit] || 'Und').trim();
      const unitCost = parseNumber(row[columnMapping.unit_cost_per_base]);

      // Si no hay SKU asignado, autogenerar uno legible
      let sku = columnMapping.sku ? String(row[columnMapping.sku] || '').trim() : '';
      if (!sku) {
        const cleanName = name.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'INS');
        sku = `${cleanName}-${String(idx + 1).padStart(3, '0')}`;
      }

      const groupName = columnMapping.group_name ? String(row[columnMapping.group_name] || '').trim() : '';
      const supplier = columnMapping.supplier ? String(row[columnMapping.supplier] || '').trim() : '';
      const stockVal = parseNumber(row[columnMapping.stock]);

      const item: ImportMaterialRow = {
        sku,
        name,
        base_unit: baseUnit,
        unit_cost_per_base: unitCost,
        group_name: groupName || undefined,
        supplier: supplier || undefined,
        stock: stockVal,
      };
      return item;
    })
    .filter((item): item is ImportMaterialRow => item !== null && item.name.length > 0);

  const handleSaveToSupabase = async () => {
    if (preparedItems.length === 0) {
      setError('No se encontraron filas válidas para importar.');
      return;
    }
    const companyId = activeCompanyId || state.company?.id || localStorage.getItem('suma-active-company') || '';
    if (!companyId) {
      setError('Selecciona una empresa activa antes de importar (barra superior).');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await importMaterials(companyId, preparedItems);
      let msg = `Se importaron ${res.created} insumos.`;
      if (res.skipped) msg += ` ${res.skipped} ya existían (omitidos).`;
      if (res.errors.length) msg += ` ${res.errors.length} con error.`;
      onImportSuccess(res.created);
      alert(msg);
      onClose();
      resetState();
    } catch (err: any) {
      setError(err?.message || 'Error al guardar los insumos en Supabase. Verifica tu conexión.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { onClose(); resetState(); }}
      title="Importar Insumos y Materias Primas (.xlsx / .csv)"
      size="2xl"
    >
      <div className="p-6">
        {/* Stepper Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
          <div className={`flex items-center gap-2 ${step === 'upload' ? 'text-suma-600 font-bold' : 'text-gray-400'}`}>
            <span className="w-6 h-6 rounded-full bg-suma-100 dark:bg-suma-900/50 flex items-center justify-center text-xs">1</span>
            <span>Subir Archivo</span>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-300" />
          <div className={`flex items-center gap-2 ${step === 'mapping' ? 'text-suma-600 font-bold' : 'text-gray-400'}`}>
            <span className="w-6 h-6 rounded-full bg-suma-100 dark:bg-suma-900/50 flex items-center justify-center text-xs">2</span>
            <span>Mapear Columnas</span>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-300" />
          <div className={`flex items-center gap-2 ${step === 'preview' ? 'text-suma-600 font-bold' : 'text-gray-400'}`}>
            <span className="w-6 h-6 rounded-full bg-suma-100 dark:bg-suma-900/50 flex items-center justify-center text-xs">3</span>
            <span>Vista Previa & Guardar</span>
          </div>
        </div>

        {error && <Alert type="error" className="mb-4">{error}</Alert>}

        {/* STEP 1: Upload */}
        {step === 'upload' && (
          <div
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files?.[0];
              if (file) processFile(file);
            }}
            className="text-center py-10 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl hover:border-suma-500 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet className="w-16 h-16 text-suma-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Arrastra o selecciona tu archivo de plantilla Excel
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
              Sube tu hoja de cálculo (.xlsx, .xls o .csv). Los grupos y proveedores nuevos se crearán automáticamente.
            </p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />
            <Button
              size="lg"
              leftIcon={<Upload className="w-4 h-4" />}
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            >
              Examinar archivo
            </Button>
          </div>
        )}

        {/* STEP MULTI-SHEET: Plantilla Completa Detectada */}
        {step === 'multi_sheet' && (
          <div className="space-y-6">
            {!multiSummary ? (
              <>
                <div className="bg-suma-50 dark:bg-suma-950/50 border border-suma-200 dark:border-suma-800 rounded-2xl p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <Sparkles className="w-6 h-6 text-suma-600" />
                    <h3 className="font-bold text-base text-gray-900 dark:text-white">
                      Plantilla Completa de Costos Detectada
                    </h3>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    Tu archivo contiene múltiples hojas organizadas. El sistema puede importar todo el ecosistema de costos de una sola vez: creará los insumos en Base Madre, los grupos y proveedores que falten, los activos en Depreciación y las recetas de Nivel 1 y Nivel 2.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {detections
                    .filter((d) => d.type !== 'desconocida')
                    .map((d) => (
                      <div
                        key={d.name}
                        className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${
                            d.type === 'base_madre' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' :
                            d.type === 'depreciacion' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' :
                            d.type === 'n1_recetas' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' :
                            'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                          }`}>
                            {d.type === 'base_madre' && <Database className="w-5 h-5" />}
                            {d.type === 'depreciacion' && <TrendingDown className="w-5 h-5" />}
                            {d.type === 'n1_recetas' && <Layers className="w-5 h-5" />}
                            {d.type === 'n2_recetas' && <Star className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-gray-900 dark:text-white">
                              {d.type === 'base_madre' && 'Base Madre (Insumos)'}
                              {d.type === 'depreciacion' && 'Depreciación'}
                              {d.type === 'n1_recetas' && 'Recetas Nivel 1'}
                              {d.type === 'n2_recetas' && 'Recetas Nivel 2'}
                            </p>
                            <span className="text-xs text-gray-400 font-mono">Hoja: {d.name}</span>
                          </div>
                        </div>
                        <Badge variant="gray">~{d.count} filas</Badge>
                      </div>
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => {
                      const defaultSheet = sheetNames.find(s => s.toUpperCase().includes('BASE') || s.toUpperCase().includes('MATERIA') || s.toUpperCase().includes('INSUMO')) || sheetNames[0];
                      setSelectedSheet(defaultSheet);
                      if (workbook) parseSheet(workbook, defaultSheet);
                    }}
                    className="text-xs text-gray-500 hover:text-suma-600 underline"
                  >
                    O importar solo una hoja manualmente
                  </button>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={() => { onClose(); resetState(); }}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleImportAllSheets}
                      loading={saving}
                      className="bg-suma-600 hover:bg-suma-700 text-white font-bold"
                      leftIcon={<Sparkles className="w-4 h-4" />}
                    >
                      🚀 Importar Todo el Archivo
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-6 space-y-5">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-300 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    ¡Plantilla Importada Exitosamente!
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Se han procesado e insertado todos los datos en la base de datos de SUMA.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg mx-auto text-left">
                  <div className="bg-blue-50 dark:bg-blue-950/40 p-3 rounded-xl border border-blue-200 dark:border-blue-800">
                    <span className="text-xs text-blue-600 font-semibold">Insumos Base Madre</span>
                    <p className="text-xl font-bold font-mono text-blue-900 dark:text-blue-100">{multiSummary.insumos}</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-950/40 p-3 rounded-xl border border-purple-200 dark:border-purple-800">
                    <span className="text-xs text-purple-600 font-semibold">Depreciaciones</span>
                    <p className="text-xl font-bold font-mono text-purple-900 dark:text-purple-100">{multiSummary.depreciaciones}</p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
                    <span className="text-xs text-amber-600 font-semibold">Recetas N1</span>
                    <p className="text-xl font-bold font-mono text-amber-900 dark:text-amber-100">{multiSummary.recetasN1}</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-950/40 p-3 rounded-xl border border-green-200 dark:border-green-800">
                    <span className="text-xs text-green-600 font-semibold">Recetas N2</span>
                    <p className="text-xl font-bold font-mono text-green-900 dark:text-green-100">{multiSummary.recetasN2}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                    <span className="text-xs text-gray-500 font-semibold">Grupos Creados</span>
                    <p className="text-xl font-bold font-mono text-gray-800 dark:text-gray-200">{multiSummary.grupos}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                    <span className="text-xs text-gray-500 font-semibold">Proveedores</span>
                    <p className="text-xl font-bold font-mono text-gray-800 dark:text-gray-200">{multiSummary.proveedores}</p>
                  </div>
                </div>

                {multiSummary.errors.length > 0 && (
                  <div className="max-h-24 overflow-y-auto text-xs text-red-500 bg-red-50 dark:bg-red-950 p-2 rounded-lg text-left">
                    {multiSummary.errors.map((err, i) => <p key={i}>{err}</p>)}
                  </div>
                )}

                <Button
                  size="lg"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  onClick={() => { onClose(); resetState(); }}
                >
                  Finalizar y Ver en Costos
                </Button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Mapping */}
        {step === 'mapping' && (
          <div>
            {sheetNames.length > 1 && (
              <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl flex items-center justify-between border border-gray-200 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-suma-600" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Hoja detectada:</span>
                </div>
                <select
                  value={selectedSheet}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800"
                >
                  {sheetNames.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Hemos auto-detectado las columnas de tu archivo. Ajusta las equivalencias si alguna no coincide:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {REQUIRED_FIELDS.map((field) => (
                <div key={field.key} className="bg-gray-50 dark:bg-gray-900/60 p-3 rounded-lg border border-gray-200 dark:border-gray-800">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    value={columnMapping[field.key]}
                    onChange={(e) => setColumnMapping({ ...columnMapping, [field.key]: e.target.value })}
                    className={`w-full px-3 py-1.5 rounded-md border text-xs bg-white dark:bg-gray-800 ${
                      field.required && !columnMapping[field.key]
                        ? 'border-red-400 dark:border-red-500'
                        : 'border-gray-300 dark:border-gray-700'
                    }`}
                  >
                    <option value="">-- No asignar / Omitir --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button variant="secondary" onClick={() => setStep('upload')}>
                Cambiar archivo
              </Button>
              <Button onClick={handleConfirmMapping} rightIcon={<ArrowRight className="w-4 h-4" />}>
                Ver Vista Previa ({rawRows.length} filas detectadas)
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Preview */}
        {step === 'preview' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                  Se importarán {preparedItems.length} insumos listos para costear
                </h4>
                <p className="text-xs text-gray-500">
                  Se descartaron automáticamente filas vacías, totales intermedios o valores nulos.
                </p>
              </div>
              <Badge variant="green">{preparedItems.length} registros válidos</Badge>
            </div>

            <div className="max-h-72 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl mb-6">
              <table className="suma-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Nombre</th>
                    <th>Unidad</th>
                    <th>Costo / Unidad</th>
                    <th>Grupo</th>
                    <th>Proveedor</th>
                  </tr>
                </thead>
                <tbody>
                  {preparedItems.slice(0, 15).map((item, idx) => (
                    <tr key={idx}>
                      <td className="font-mono text-xs text-gray-500">{item.sku}</td>
                      <td className="font-medium text-gray-900 dark:text-white">{item.name}</td>
                      <td><Badge variant="blue">{item.base_unit}</Badge></td>
                      <td className="font-mono text-sm">{formatCOP(item.unit_cost_per_base)}</td>
                      <td className="text-xs text-gray-600 dark:text-gray-400">{item.group_name || '—'}</td>
                      <td className="text-xs text-gray-500">{item.supplier || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preparedItems.length > 15 && (
                <div className="text-center py-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500">
                  ... y {preparedItems.length - 15} filas más.
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button variant="secondary" onClick={() => setStep('mapping')} disabled={saving}>
                Ajustar mapeo
              </Button>
              <Button
                loading={saving}
                onClick={handleSaveToSupabase}
                leftIcon={<Check className="w-4 h-4" />}
              >
                Confirmar e Importar a SUMA
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
