// ============================================================
// SUMA ERP — Generador del template de importación (.xlsx)
// Formato estándar y uniforme que el sistema puede leer siempre
// igual. Sigue la lógica de recetas en cascada (base madre ->
// sub-recetas -> piezas -> producto final), estilo MELTÉ pero
// aplicable a restaurantes, panaderías, manufactura, etc.
// ============================================================
import * as XLSX from 'xlsx';

/**
 * Descarga la plantilla oficial de SUMA con 5 hojas, cada una con
 * encabezados en la fila 1 y filas de ejemplo que explican el formato.
 */
export function downloadPlantillaSUMA(): void {
  const wb = XLSX.utils.book_new();

  // ── Hoja 1: INSTRUCCIONES ──────────────────────────────
  const instrucciones = [
    { Campo: 'Cómo usar esta plantilla', Detalle: 'Llena las hojas en este orden: 1) Insumos, 2) Depreciacion, 3) Recetas, 4) Productos.' },
    { Campo: 'Insumos', Detalle: 'Tu "base madre": cada materia prima o empaque que compras, con su costo por unidad base.' },
    { Campo: 'Depreciacion', Detalle: 'Herramientas y moldes que se reparten por uso o por tiempo (olla, molde, impresora...).' },
    { Campo: 'Recetas', Detalle: 'Sub-recetas y piezas. Una receta puede usar insumos, depreciación u OTRAS recetas (cascada).' },
    { Campo: 'Productos', Detalle: 'El producto final que vendes: junta piezas/recetas por sus unidades + empaques.' },
    { Campo: 'Unidades válidas', Detalle: 'Gr, Kg, Ml, Lt, Und, Mt (puedes agregar más en el sistema).' },
    { Campo: 'Importante', Detalle: 'No cambies los nombres de las columnas ni el orden. La fila 1 son los encabezados.' },
    { Campo: 'Nombres únicos', Detalle: 'El nombre conecta todo: un insumo/receta se referencia por su nombre EXACTO.' },
  ];

  // ── Hoja 2: INSUMOS (base madre) ───────────────────────
  const insumos = [
    { Nombre: 'Cera de Soya APF', Unidad: 'Gr', 'Costo por unidad': 20.36, Grupo: 'CERA', Proveedor: 'Crealuz', 'Stock inicial': 25000 },
    { Nombre: 'Colorante Azul', Unidad: 'Ml', 'Costo por unidad': 366.67, Grupo: 'COLORANTES', Proveedor: 'Crealuz', 'Stock inicial': 30 },
    { Nombre: 'Papel impresora', Unidad: 'Und', 'Costo por unidad': 48.33, Grupo: 'ETIQUETAS Y PAPELERIA', Proveedor: 'Temu', 'Stock inicial': 300 },
    { Nombre: 'Bolsas Doypack Kraft', Unidad: 'Und', 'Costo por unidad': 1127.52, Grupo: 'EMPAQUES', Proveedor: 'Mercado Libre', 'Stock inicial': 50 },
  ];

  // ── Hoja 3: DEPRECIACION ───────────────────────────────
  const depreciacion = [
    { Nombre: 'Molde Stitch OHANA', Tipo: 'POR_USO', 'Costo total': 44000, 'Usos estimados': 100, 'Vida util meses': '', Nota: 'Se reparte entre 100 usos = 440 por uso' },
    { Nombre: 'Impresora Epson L3350', Tipo: 'POR_TIEMPO', 'Costo total': 882800, 'Usos estimados': '', 'Vida util meses': 36, Nota: 'Se reparte por mes / unidades vendidas al mes' },
    { Nombre: 'Guillotina x2', Tipo: 'POR_USO', 'Costo total': 5097, 'Usos estimados': 200, 'Vida util meses': '', Nota: '25.49 por uso' },
  ];

  // ── Hoja 4: RECETAS (sub-recetas y piezas) ─────────────
  // Una fila por INGREDIENTE de la receta. Se agrupan por 'Receta'.
  const recetas = [
    // Sub-receta: Cera Azul (rinde 1000 Ml)
    { Receta: 'Cera Azul', 'Rinde cantidad': 1000, 'Rinde unidad': 'Ml', 'Margen seguridad %': 10, Ingrediente: 'Cera de Soya APF', 'Tipo ingrediente': 'INSUMO', Cantidad: 1000, Unidad: 'Gr' },
    { Receta: 'Cera Azul', 'Rinde cantidad': 1000, 'Rinde unidad': 'Ml', 'Margen seguridad %': 10, Ingrediente: 'Colorante Azul', 'Tipo ingrediente': 'INSUMO', Cantidad: 15, Unidad: 'Ml' },
    { Receta: 'Cera Azul', 'Rinde cantidad': 1000, 'Rinde unidad': 'Ml', 'Margen seguridad %': 10, Ingrediente: 'Olla derretidora de cera (11 Libras)', 'Tipo ingrediente': 'DEPRECIACION', Cantidad: 1, Unidad: 'Und' },
    // Pieza: Stitch (rinde 14 Gr) — usa la sub-receta Cera Azul
    { Receta: 'Stitch Ohana', 'Rinde cantidad': 14, 'Rinde unidad': 'Gr', 'Margen seguridad %': 10, Ingrediente: 'Molde Stitch OHANA', 'Tipo ingrediente': 'DEPRECIACION', Cantidad: 1, Unidad: 'Und' },
    { Receta: 'Stitch Ohana', 'Rinde cantidad': 14, 'Rinde unidad': 'Gr', 'Margen seguridad %': 10, Ingrediente: 'Cera Azul', 'Tipo ingrediente': 'RECETA', Cantidad: 14, Unidad: 'Ml' },
    // Receta: Etiqueta (rinde 1 Und)
    { Receta: 'Etiqueta', 'Rinde cantidad': 1, 'Rinde unidad': 'Und', 'Margen seguridad %': 10, Ingrediente: 'Papel impresora', 'Tipo ingrediente': 'INSUMO', Cantidad: 1, Unidad: 'Und' },
    { Receta: 'Etiqueta', 'Rinde cantidad': 1, 'Rinde unidad': 'Und', 'Margen seguridad %': 10, Ingrediente: 'Guillotina x2', 'Tipo ingrediente': 'DEPRECIACION', Cantidad: 1, Unidad: 'Und' },
  ];

  // ── Hoja 5: PRODUCTOS (final que se vende) ─────────────
  // Una fila por COMPONENTE del producto. Se agrupan por 'Producto'.
  const productos = [
    { Producto: 'Colección Ohana', 'Margen ganancia %': 50, 'Comision pago %': 0, Componente: 'Stitch Ohana', 'Tipo componente': 'RECETA', Unidades: 4 },
    { Producto: 'Colección Ohana', 'Margen ganancia %': 50, 'Comision pago %': 0, Componente: 'Etiqueta', 'Tipo componente': 'RECETA', Unidades: 1 },
    { Producto: 'Colección Ohana', 'Margen ganancia %': 50, 'Comision pago %': 0, Componente: 'Bolsas Doypack Kraft', 'Tipo componente': 'INSUMO', Unidades: 1 },
  ];

  const addSheet = (name: string, rows: Record<string, unknown>[]) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet('Instrucciones', instrucciones);
  addSheet('Insumos', insumos);
  addSheet('Depreciacion', depreciacion);
  addSheet('Recetas', recetas);
  addSheet('Productos', productos);

  XLSX.writeFile(wb, 'Plantilla_SUMA_ERP.xlsx');
}
