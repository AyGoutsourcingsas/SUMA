// ============================================================
// SUMA ERP — Importador del template completo de SUMA
// Lee las 4 hojas (Insumos, Depreciacion, Recetas, Productos),
// toma la fila 3 como encabezados (salta nota y ejemplo) y carga
// todo con importTemplate(). Muestra resumen y errores.
// ============================================================
import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, CheckCircle, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { Modal, Button, Alert, Spinner } from '@/components/ui';
import { useActiveCompanyId } from '@/store/AppStore';
import { importTemplate, type RawRow, type ImportSummary } from '@/services/modules/importador';

function readSheet(wb: XLSX.WorkBook, sheetName: string, headerRow = 3): RawRow[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
  if (matrix.length < headerRow) return [];
  const headers = (matrix[headerRow - 1] || []).map((h) => String(h).trim());
  const rows: RawRow[] = [];
  for (let r = headerRow; r < matrix.length; r++) {
    const row = matrix[r];
    if (!Array.isArray(row) || row.every((c) => String(c).trim() === '')) continue;
    const obj: RawRow = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
    rows.push(obj);
  }
  return rows;
}

function findSheet(wb: XLSX.WorkBook, target: string): string | null {
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return wb.SheetNames.find((n) => norm(n).includes(norm(target))) ?? null;
}

export function TemplateImporterModal({
  isOpen, onClose, onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const activeCompanyId = useActiveCompanyId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [fileName, setFileName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setSummary(null);
    // Leer company_id FRESCO al momento de ejecutar (no del closure)
    const companyId = activeCompanyId || localStorage.getItem('suma-active-company') || '';
    if (!companyId) {
      setError('No hay empresa activa. Elige una empresa en el selector de la barra superior y vuelve a intentar.');
      return;
    }
    setFileName(file.name);
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });

      const sInsumos = findSheet(wb, 'insumo');
      const sDepr = findSheet(wb, 'depreciacion');
      const sRecetas = findSheet(wb, 'receta');
      const sProductos = findSheet(wb, 'producto');

      if (!sInsumos && !sRecetas && !sProductos) {
        setError(`No se encontraron las hojas del template. Hojas del archivo: ${wb.SheetNames.join(', ')}. Usa la plantilla oficial de SUMA.`);
        return;
      }

      const res = await importTemplate(companyId, {
        insumos: sInsumos ? readSheet(wb, sInsumos) : [],
        depreciacion: sDepr ? readSheet(wb, sDepr) : [],
        recetas: sRecetas ? readSheet(wb, sRecetas) : [],
        productos: sProductos ? readSheet(wb, sProductos) : [],
      });
      setSummary(res);
      onDone();
    } catch (e) {
      // Mostrar el detalle real (de Supabase o del parseo) para diagnosticar
      const msg = (e as any)?.message || (e as any)?.error_description || JSON.stringify(e);
      setError(`Error al importar: ${msg}`);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = ''; // permite re-subir el mismo archivo
    }
  };

  const reset = () => { setSummary(null); setError(null); setFileName(''); if (inputRef.current) inputRef.current.value = ''; };
  const close = () => { onClose(); reset(); };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Importar plantilla SUMA (.xlsx)" size="lg">
      <div className="p-6 space-y-4">
        {/* El error SIEMPRE visible y prominente */}
        {error && <Alert type="error">{error}</Alert>}

        {/* input oculto SIEMPRE montado (no se pierde entre estados) */}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        {loading ? (
          <div className="py-12 text-center">
            <Spinner size="lg" />
            <p className="mt-3 text-sm text-gray-500">Procesando {fileName}… Esto puede tardar unos segundos.</p>
          </div>
        ) : summary ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">Importación completada</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard label="Insumos" value={summary.insumos} />
              <SummaryCard label="Depreciación" value={summary.depreciacion} />
              <SummaryCard label="Recetas" value={summary.recetas} />
              <SummaryCard label="Productos" value={summary.productos} />
            </div>
            {summary.errores.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-amber-600 mb-1">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">{summary.errores.length} advertencia(s)</span>
                </div>
                <div className="max-h-40 overflow-y-auto text-xs bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-1">
                  {summary.errores.map((e, i) => (
                    <div key={i} className="text-gray-600 dark:text-gray-400">
                      <strong>{e.hoja}</strong> (fila {e.fila}): {e.motivo}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={reset}>Importar otro</Button>
              <Button onClick={close}>Listo</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-suma-200 bg-suma-50 dark:border-suma-500/30 dark:bg-suma-500/10 p-3 text-sm text-suma-700 dark:text-suma-300">
              Sube la <strong>plantilla oficial de SUMA</strong> ya llena (hojas Insumos, Depreciacion, Recetas, Productos).
              El sistema lee la fila 3 como títulos y tus datos desde la fila 4.
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full block border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-10 text-center cursor-pointer hover:border-suma-500 transition-colors"
            >
              <FileSpreadsheet className="w-14 h-14 text-suma-600 mx-auto mb-3" />
              <span className="block font-semibold text-gray-900 dark:text-white mb-1">Selecciona tu archivo .xlsx</span>
              <span className="block text-sm text-gray-500 mb-4">Insumos · Depreciación · Recetas · Productos</span>
              <span className="inline-flex items-center gap-2 bg-suma-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <UploadCloud className="w-4 h-4" /> Examinar
              </span>
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-center">
      <p className="text-2xl font-black text-suma-600">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
