-- ============================================================
-- SUMA ERP — Migración 009: Vistas para el Dashboard de proveedores
-- Agregaciones de compras por proveedor (gasto total, mensual) y
-- variación de precios por proveedor. Solo lectura; RLS heredada de
-- las tablas base (purchases/suppliers ya filtran por empresa).
-- Idempotente.
-- ============================================================

-- ─────────────────────────────────────────
-- 1. Gasto por proveedor (total, nº de compras, última compra)
-- ─────────────────────────────────────────
CREATE OR REPLACE VIEW public.supplier_spend AS
SELECT
  p.company_id,
  p.supplier_id,
  s.name                         AS supplier_name,
  COUNT(*)                       AS num_compras,
  COALESCE(SUM(p.total_cost), 0) AS gasto_total,
  COALESCE(AVG(p.total_cost), 0) AS ticket_promedio,
  MAX(p.purchased_at)            AS ultima_compra,
  COUNT(DISTINCT p.material_id)  AS insumos_distintos
FROM public.purchases p
LEFT JOIN public.suppliers s ON s.id = p.supplier_id
WHERE p.voided = false
GROUP BY p.company_id, p.supplier_id, s.name;

-- ─────────────────────────────────────────
-- 2. Gasto por proveedor y mes (para la tendencia mensual)
-- ─────────────────────────────────────────
CREATE OR REPLACE VIEW public.supplier_spend_monthly AS
SELECT
  p.company_id,
  p.supplier_id,
  s.name                                   AS supplier_name,
  date_trunc('month', p.purchased_at)::date AS mes,
  COUNT(*)                                 AS num_compras,
  COALESCE(SUM(p.total_cost), 0)           AS gasto_mes
FROM public.purchases p
LEFT JOIN public.suppliers s ON s.id = p.supplier_id
WHERE p.voided = false
GROUP BY p.company_id, p.supplier_id, s.name, date_trunc('month', p.purchased_at);

-- ─────────────────────────────────────────
-- 3. Variación de precio por proveedor e insumo.
--    Compara el costo unitario de la primera vs la última compra
--    de cada (proveedor, material) para ver quién subió más.
-- ─────────────────────────────────────────
CREATE OR REPLACE VIEW public.supplier_price_variation AS
WITH ranked AS (
  SELECT
    p.company_id, p.supplier_id, p.material_id, p.unit_cost, p.purchased_at,
    ROW_NUMBER() OVER (PARTITION BY p.company_id, p.supplier_id, p.material_id ORDER BY p.purchased_at ASC,  p.created_at ASC)  AS rn_first,
    ROW_NUMBER() OVER (PARTITION BY p.company_id, p.supplier_id, p.material_id ORDER BY p.purchased_at DESC, p.created_at DESC) AS rn_last
  FROM public.purchases p
  WHERE p.voided = false AND p.supplier_id IS NOT NULL
),
first_last AS (
  SELECT
    f.company_id, f.supplier_id, f.material_id,
    f.unit_cost AS first_cost, f.purchased_at AS first_date,
    l.unit_cost AS last_cost,  l.purchased_at AS last_date
  FROM (SELECT * FROM ranked WHERE rn_first = 1) f
  JOIN (SELECT * FROM ranked WHERE rn_last = 1) l
    ON f.company_id = l.company_id AND f.supplier_id = l.supplier_id AND f.material_id = l.material_id
)
SELECT
  fl.company_id,
  fl.supplier_id,
  sup.name   AS supplier_name,
  fl.material_id,
  mat.name   AS material_name,
  fl.first_cost,
  fl.last_cost,
  (fl.last_cost - fl.first_cost)                                              AS variacion_abs,
  CASE WHEN fl.first_cost > 0 THEN (fl.last_cost - fl.first_cost) / fl.first_cost * 100 ELSE 0 END AS variacion_pct,
  fl.first_date,
  fl.last_date
FROM first_last fl
LEFT JOIN public.suppliers sup ON sup.id = fl.supplier_id
LEFT JOIN public.materials mat ON mat.id = fl.material_id
WHERE fl.last_cost <> fl.first_cost;
