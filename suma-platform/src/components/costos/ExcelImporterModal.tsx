// ============================================================
// SUMA Platform — Importador Excel/CSV para Insumos (Módulo Costos/Inventarios)
// ============================================================
import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Check, ArrowRight, Layers } from 'lucide-react';
import { Button, Modal, Alert, Badge } from '@/components/ui';
import { formatCOP } from '@/config/brand';
import { importMaterials, type ImportMaterialRow } from '@/services/modules/inventario';
import { useAppStore } from '@/store/AppStore';

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
  { key: 'name', label: 'Nombre del Insumo / Producto', required: true, aliases: ['nombre', 'producto', 'nombre producto', 'descripcion', 'item', 'materia prima'] },
  { key: 'base_unit', label: 'Unidad Base (Gr, Ml, Und, etc.)', required: true, aliases: ['unidad', 'und', 'medida', 'u.m.', 'unidad de medida', 'base_unit'] },
  { key: 'unit_cost_per_base', label: 'Costo por Unidad Base', required: true, aliases: ['costo unidad gr/lt/und', 'costo unitario', 'costo unidad', 'costo/unidad', 'valor unitario', 'costo gramo', 'costo gr'] },
  { key: 'sku', label: 'Código / SKU', required: false, aliases: ['sku', 'codigo', 'cod', 'código', 'referencia', 'ref'] },
  { key: 'group_name', label: 'Grupo / Categoría', required: false, aliases: ['grupo de inventario', 'grupo', 'categoria', 'categoría', 'departamento', 'tipo'] },
  { key: 'supplier', label: 'Proveedor', required: false, aliases: ['proveedor', 'distribuidor', 'marca', 'comprado en'] },
  { key: 'stock', label: 'Cantidad / Stock / Peso Inicial', required: false, aliases: ['peso', 'cantidad', 'stock', 'cant', 'existencias', 'saldo'] },
];

export function ExcelImporterModal({ isOpen, onClose, onImportSuccess }: Props) {
  const { state } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);

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
    setError(null);
    setSaving(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        setWorkbook(wb);
        setSheetNames(wb.SheetNames);

        // Preseleccionar hoja típica como "BASE MADRE" o la primera
        const defaultSheet = wb.SheetNames.find(s => s.toUpperCase().includes('BASE') || s.toUpperCase().includes('MATERIA') || s.toUpperCase().includes('INSUMO')) || wb.SheetNames[0];
        setSelectedSheet(defaultSheet);
        parseSheet(wb, defaultSheet);
      } catch (err) {
        setError('No se pudo leer el archivo Excel/CSV. Verifica que no esté dañado.');
      }
    };
    reader.readAsArrayBuffer(file);
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
      let rawCost = row[columnMapping.unit_cost_per_base];
      if (typeof rawCost === 'string') {
        rawCost = rawCost.replace(/\$/g, '').replace(/\./g, '').replace(/,/g, '.').trim();
      }
      const unitCost = parseFloat(rawCost) || 0;

      // Si no hay SKU asignado, autogenerar uno legible
      let sku = columnMapping.sku ? String(row[columnMapping.sku] || '').trim() : '';
      if (!sku) {
        const cleanName = name.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'INS');
        sku = `${cleanName}-${String(idx + 1).padStart(3, '0')}`;
      }

      const groupName = columnMapping.group_name ? String(row[columnMapping.group_name] || '').trim() : '';
      const supplier = columnMapping.supplier ? String(row[columnMapping.supplier] || '').trim() : '';
      const stockVal = columnMapping.stock ? parseFloat(row[columnMapping.stock]) || 0 : 0;

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
    const companyId = state.company?.id;
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
          <div className="text-center py-10 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl hover:border-suma-500 transition-colors">
            <FileSpreadsheet className="w-16 h-16 text-suma-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Selecciona tu archivo de insumos
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
              Sube tu hoja de cálculo (.xlsx, .xls o .csv). Puede ser tu "BASE MADRE", catálogo de proveedores o lista de ingredientes.
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
              onClick={() => fileInputRef.current?.click()}
            >
              Examinar archivo
            </Button>
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
