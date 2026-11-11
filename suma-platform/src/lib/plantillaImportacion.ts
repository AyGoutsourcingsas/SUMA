// ============================================================
// SUMA ERP — Generador del template de importación (.xlsx)
// Usa ExcelJS para producir un archivo ESTÉTICO con colores,
// negritas, bordes y anchos. Estructura por hoja:
//   Fila 1: nota explicativa (qué va y el orden)   [fondo de color]
//   Fila 2: EJEMPLO (cursiva gris, se puede borrar)
//   Fila 3: TÍTULOS de columna                      [fondo de color]
//   Fila 4+: vacío para llenar                      [bordes guía]
// Lógica de recetas en cascada: base madre -> sub-recetas ->
// piezas -> producto final.
// ============================================================
import ExcelJS from 'exceljs';

const COLORS = {
  insumos:      'FFDDEBF7',
  depreciacion: 'FFE2EFDA',
  recetas:      'FFFCE4D6',
  productos:    'FFFFF2CC',
  titleText:    'FF1F4E78',
  exampleText:  'FF808080',
  border:       'FFBFBFBF',
};

interface SheetSpec {
  name: string;
  note: string;
  headers: string[];
  example: (string | number)[];
  color: string;
  widths: number[];
}

function addStyledSheet(wb: ExcelJS.Workbook, spec: SheetSpec) {
  const ws = wb.addWorksheet(spec.name, { views: [{ state: 'frozen', ySplit: 3 }] });
  const n = spec.headers.length;
  ws.columns = spec.widths.map((w) => ({ width: w }));

  const thin = { style: 'thin' as const, color: { argb: COLORS.border } };
  const borders = { top: thin, left: thin, bottom: thin, right: thin };

  // Fila 1: nota (merge a lo ancho)
  ws.mergeCells(1, 1, 1, n);
  const noteCell = ws.getCell(1, 1);
  noteCell.value = spec.note;
  noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: spec.color } };
  noteCell.font = { bold: true, size: 11, color: { argb: COLORS.titleText } };
  noteCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  ws.getRow(1).height = 36;

  // Fila 2: ejemplo
  const exRow = ws.getRow(2);
  spec.example.forEach((v, i) => {
    const cell = exRow.getCell(i + 1);
    cell.value = v;
    cell.font = { italic: true, size: 10, color: { argb: COLORS.exampleText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
    cell.border = borders;
  });
  exRow.height = 18;

  // Fila 3: títulos
  const headRow = ws.getRow(3);
  spec.headers.forEach((h, i) => {
    const cell = headRow.getCell(i + 1);
    cell.value = h;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: spec.color } };
    cell.font = { bold: true, size: 11, color: { argb: COLORS.titleText } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = borders;
  });
  headRow.height = 20;

  // Filas 4+: bordes guía
  for (let r = 4; r <= 28; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= n; c++) row.getCell(c).border = borders;
  }
}

export async function downloadPlantillaSUMA(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SUMA ERP';
  wb.created = new Date();

  // ── Instrucciones ────────────────────────────────────
  const intro = wb.addWorksheet('Instrucciones');
  intro.columns = [{ width: 22 }, { width: 95 }];
  intro.mergeCells('A1:B1');
  const t = intro.getCell('A1');
  t.value = 'PLANTILLA SUMA ERP — guía rápida';
  t.font = { bold: true, size: 14, color: { argb: COLORS.titleText } };
  const rows: [string, string][] = [
    ['', ''],
    ['Llena las hojas en este orden:', ''],
    ['1) Insumos', 'Tu base madre: cada materia prima o empaque con su costo por unidad.'],
    ['2) Depreciacion', 'Herramientas y moldes que se reparten por uso o por tiempo.'],
    ['3) Recetas', 'Sub-recetas y piezas. Una receta puede usar insumos, depreciación u OTRAS recetas.'],
    ['4) Productos', 'El producto final que vendes: junta recetas/insumos por sus unidades.'],
    ['', ''],
    ['Reglas:', ''],
    ['•', 'En cada hoja: fila 1 = nota, fila 2 = ejemplo (puedes borrarla), fila 3 = títulos, desde la fila 4 escribes.'],
    ['•', 'No cambies los títulos (fila 3) ni el orden de las columnas.'],
    ['•', 'El NOMBRE conecta todo: un insumo o receta se referencia por su nombre exacto.'],
    ['•', 'Unidades válidas: Gr, Kg, Ml, Lt, Und, Mt.'],
  ];
  rows.forEach(([a, b], i) => {
    const row = intro.getRow(i + 2);
    row.getCell(1).value = a;
    row.getCell(2).value = b;
    if (a.startsWith('Llena') || a.startsWith('Reglas')) row.getCell(1).font = { bold: true, color: { argb: COLORS.titleText } };
    if (/^\d\)/.test(a)) row.getCell(1).font = { bold: true };
  });

  addStyledSheet(wb, {
    name: 'Insumos', color: COLORS.insumos,
    note: 'INSUMOS (base madre) · Escribe cada materia prima/empaque que compras. Fila 2 = ejemplo (bórrala). Desde la fila 4 pon tus insumos.',
    headers: ['Nombre', 'Unidad', 'Costo por unidad', 'Grupo', 'Proveedor', 'Stock inicial'],
    example: ['Cera de Soya APF', 'Gr', 20.36, 'CERA', 'Crealuz', 25000],
    widths: [28, 10, 16, 20, 18, 14],
  });

  addStyledSheet(wb, {
    name: 'Depreciacion', color: COLORS.depreciacion,
    note: 'DEPRECIACIÓN · Herramientas y moldes. POR_USO = costo/usos; POR_TIEMPO = costo/meses. Fila 2 = ejemplo. Desde la fila 4 escribe.',
    headers: ['Nombre', 'Tipo', 'Costo total', 'Usos estimados', 'Vida util meses', 'Nota'],
    example: ['Molde Stitch OHANA', 'POR_USO', 44000, 100, '', 'Se reparte entre 100 usos = 440 por uso'],
    widths: [28, 12, 14, 16, 16, 42],
  });

  addStyledSheet(wb, {
    name: 'Recetas', color: COLORS.recetas,
    note: 'RECETAS (sub-recetas y piezas) · Una fila por INGREDIENTE. Repite el nombre de la receta en cada ingrediente. Tipo: INSUMO / DEPRECIACION / RECETA. Desde la fila 4.',
    headers: ['Receta', 'Rinde cantidad', 'Rinde unidad', 'Margen seguridad %', 'Ingrediente', 'Tipo ingrediente', 'Cantidad', 'Unidad'],
    example: ['Cera Azul', 1000, 'Ml', 10, 'Cera de Soya APF', 'INSUMO', 1000, 'Gr'],
    widths: [20, 14, 12, 18, 28, 16, 10, 10],
  });

  addStyledSheet(wb, {
    name: 'Productos', color: COLORS.productos,
    note: 'PRODUCTOS (final que vendes) · Una fila por COMPONENTE. Repite el nombre del producto. Tipo: RECETA / INSUMO. Margen = ganancia que quieres. Desde la fila 4.',
    headers: ['Producto', 'Margen ganancia %', 'Comision pago %', 'Componente', 'Tipo componente', 'Unidades'],
    example: ['Colección Ohana', 50, 0, 'Stitch Ohana', 'RECETA', 4],
    widths: [24, 16, 14, 24, 16, 10],
  });

  // Descargar
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Plantilla_SUMA_ERP.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
