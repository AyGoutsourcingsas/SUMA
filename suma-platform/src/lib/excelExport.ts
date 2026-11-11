// ============================================================
// SUMA ERP — Exportación a Excel (.xlsx)
// Utilidad genérica reutilizable por cualquier módulo.
// Usa SheetJS (xlsx), ya presente en las dependencias.
// ============================================================
import * as XLSX from 'xlsx';

/**
 * Descarga un arreglo de objetos como un archivo .xlsx.
 * @param rows   filas (cada objeto = una fila; las claves son columnas)
 * @param filename  nombre sin extensión
 * @param sheetName nombre de la hoja
 */
export function downloadAsExcel(
  rows: Record<string, unknown>[],
  filename: string,
  sheetName = 'Datos',
): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filename}_${stamp}.xlsx`);
}

/** Varias hojas en un mismo archivo. */
export function downloadMultiSheetExcel(
  sheets: { name: string; rows: Record<string, unknown>[] }[],
  filename: string,
): void {
  const workbook = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(workbook, ws, s.name.slice(0, 31));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filename}_${stamp}.xlsx`);
}
