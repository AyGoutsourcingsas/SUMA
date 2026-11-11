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
    ['LLENA LAS HOJAS EN ESTE ORDEN', ''],
    ['1) Insumos', 'Tu base madre: cada materia prima o empaque que COMPRAS, con su costo por unidad.'],
    ['2) Depreciacion', 'Herramientas y moldes que NO se gastan de una vez (olla, molde, impresora). Se reparten.'],
    ['3) Recetas', 'Lo que FABRICAS: sub-recetas (ej. cera de color) y piezas. Pueden usar insumos, depreciación u otras recetas.'],
    ['4) Productos', 'Lo que VENDES: junta recetas/insumos por sus unidades (ej. una colección con 4 piezas + empaque).'],
    ['', ''],
    ['QUÉ ESCRIBIR EN CADA TIPO (columna "Tipo")', ''],
    ['INSUMO', 'El ingrediente existe en la hoja Insumos (lo compras). Ej: Cera de Soya, Papel. Se cobra por su costo.'],
    ['DEPRECIACION', 'El ingrediente existe en la hoja Depreciacion (herramienta/molde). Ej: Molde Stitch, Guillotina. Se cobra por uso.'],
    ['RECETA', 'El ingrediente es OTRA receta que fabricas. Ej: en Stitch usas "Cera Azul" (que es una receta). Pon su CÓDIGO.'],
    ['', ''],
    ['EJEMPLO DE CASCADA (así se conecta todo)', ''],
    ['Paso 1', 'En Insumos: "Cera de Soya APF" a $20/Gr.'],
    ['Paso 2', 'En Recetas: "Cera Azul" (código CERA-AZUL) usa 1000 Gr de Cera de Soya (tipo INSUMO) + colorante.'],
    ['Paso 3', 'En Recetas: "Stitch" usa 14 Ml de Cera Azul (tipo RECETA, código CERA-AZUL) + su molde (DEPRECIACION).'],
    ['Paso 4', 'En Productos: "Colección Ohana" usa 4 unidades de Stitch (tipo RECETA) + empaque (INSUMO).'],
    ['', ''],
    ['REGLAS', ''],
    ['•', 'En cada hoja: fila 1 = nota, fila 2 = ejemplo (puedes borrarla), fila 3 = títulos, desde la fila 4 escribes.'],
    ['•', 'No cambies los títulos (fila 3) ni el orden de las columnas.'],
    ['•', 'CÓDIGO de receta/producto: ponlo igual en todas las filas de esa receta. Si lo dejas vacío, SUMA lo crea del nombre.'],
    ['•', 'El nombre/código conecta todo: escríbelo EXACTAMENTE igual donde lo referencias.'],
    ['•', 'Unidades válidas: Gr, Kg, Ml, Lt, Und, Mt. SUMA convierte sola (ej. compras en Kg, usas en Gr).'],
    ['•', 'Margen seguridad % (recetas) = recargo sobre el costo. Margen ganancia % (productos) = lo que quieres ganar.'],
  ];
  rows.forEach(([a, b], i) => {
    const row = intro.getRow(i + 2);
    row.getCell(1).value = a;
    row.getCell(2).value = b;
    const isHeader = a === a.toUpperCase() && a.length > 4 && !a.startsWith('•') && b === '';
    if (isHeader) row.getCell(1).font = { bold: true, size: 12, color: { argb: COLORS.titleText } };
    if (/^\d\)/.test(a) || ['INSUMO', 'DEPRECIACION', 'RECETA', 'Paso 1', 'Paso 2', 'Paso 3', 'Paso 4'].includes(a)) {
      row.getCell(1).font = { bold: true };
    }
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
    note: 'RECETAS · Repite el mismo CÓDIGO en todas las filas de una receta. El código es OPCIONAL: si lo dejas vacío el sistema lo genera del nombre. Tipo: INSUMO (de Insumos) / DEPRECIACION (de Depreciacion) / RECETA (otra receta, por su código). Desde la fila 4.',
    headers: ['Codigo receta', 'Receta', 'Rinde cantidad', 'Rinde unidad', 'Margen seguridad %', 'Ingrediente', 'Tipo ingrediente', 'Cantidad', 'Unidad'],
    example: ['CERA-AZUL', 'Cera Azul', 1000, 'Ml', 10, 'Cera de Soya APF', 'INSUMO', 1000, 'Gr'],
    widths: [16, 20, 13, 12, 16, 28, 16, 10, 10],
  });

  addStyledSheet(wb, {
    name: 'Productos', color: COLORS.productos,
    note: 'PRODUCTOS (lo que vendes) · Repite el mismo CÓDIGO en las filas del producto (opcional, se autogenera si lo dejas vacío). En "Componente" pon el CÓDIGO (o nombre) de la receta/insumo. Tipo: RECETA / INSUMO. Desde la fila 4.',
    headers: ['Codigo producto', 'Producto', 'Margen ganancia %', 'Comision pago %', 'Componente', 'Tipo componente', 'Unidades'],
    example: ['GUA-COL', 'Colección Guardianes del Bosque', 55, 0, 'HOLLIN-GB', 'RECETA', 8],
    widths: [16, 28, 16, 14, 20, 16, 10],
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
