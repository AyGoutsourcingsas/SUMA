-- ============================================================
-- SUMA ERP — Migración 003: NÚCLEO (datos maestros compartidos)
-- Base de los módulos Costos, Inventario y Ventas.
-- Basado en MELTÉ 00_COMUN_Y_INTEGRACION (núcleo §3).
-- Multiempresa por company_id + RLS (superadmin ve todo).
-- Idempotente y segura ante re-ejecución.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────
-- 0. Helper de updated_at (ya existe de 001, se reafirma)
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 1. CATÁLOGOS CONFIGURABLES POR EMPRESA
--    Cada empresa define sus propias unidades, grupos, etc.
--    (requisito del usuario: los campos NO son universales)
-- ═══════════════════════════════════════════════════════════

-- 1.1 Unidades de medida (con conversión por factor a una unidad base)
--     Ej: Kg -> base Gr factor 1000; Lt -> base Ml factor 1000.
CREATE TABLE IF NOT EXISTS public.units (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code        text NOT NULL,               -- 'Gr', 'Ml', 'Und', 'Kg'...
  name        text,                        -- 'Gramos'
  dimension   text NOT NULL DEFAULT 'conteo', -- 'peso' | 'volumen' | 'conteo' | 'longitud'
  base_code   text NOT NULL,               -- unidad base de su dimensión ('Gr','Ml','Und','Mt')
  factor      numeric NOT NULL DEFAULT 1,  -- cuántas unidades base = 1 de esta unidad
  created_at  timestamptz DEFAULT now(),
  UNIQUE (company_id, code)
);
CREATE INDEX IF NOT EXISTS units_company_idx ON public.units (company_id);

-- 1.2 Grupos / categorías (sirven como CARPETAS para organizar insumos y recetas)
--     El admin los crea. Soporta jerarquía (carpeta dentro de carpeta).
CREATE TABLE IF NOT EXISTS public.item_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,               -- 'CERA', 'FRAGANCIAS', 'PLATOS FUERTES'...
  kind        text NOT NULL DEFAULT 'material', -- 'material' (inventario) | 'recipe' (costos)
  parent_id   uuid REFERENCES public.item_groups(id) ON DELETE SET NULL,
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (company_id, kind, name, parent_id)
);
CREATE INDEX IF NOT EXISTS item_groups_company_idx ON public.item_groups (company_id);

-- 1.3 Proveedores
CREATE TABLE IF NOT EXISTS public.suppliers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  contact     text,
  phone       text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (company_id, name)
);
CREATE INDEX IF NOT EXISTS suppliers_company_idx ON public.suppliers (company_id);

-- ═══════════════════════════════════════════════════════════
-- 2. PARÁMETROS POR EMPRESA (clave-valor tipado)
--    Aquí viven las "casillas configurables": margen por defecto,
--    comisión de pasarela, IVA, método de costeo, etc.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.company_parameters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key         text NOT NULL,               -- 'iva_pct','costeo_metodo','margen_default_pct'...
  value       text,                        -- se guarda como texto, se castea en app
  value_type  text NOT NULL DEFAULT 'text',-- 'number' | 'percent' | 'text' | 'bool'
  label       text,                        -- etiqueta visible configurable por el admin
  description text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (company_id, key)
);
CREATE INDEX IF NOT EXISTS company_parameters_company_idx ON public.company_parameters (company_id);
DROP TRIGGER IF EXISTS company_parameters_updated_at ON public.company_parameters;
CREATE TRIGGER company_parameters_updated_at BEFORE UPDATE ON public.company_parameters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════
-- 3. MATERIALES (maestro de insumos / materias primas / empaques)
--    Reemplaza inventory_items de forma más completa. El costo
--    unitario se calcula desde las compras (regla de tres).
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.materials (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code                text,                        -- 'MP-001' (único por empresa si se usa)
  name                text NOT NULL,               -- 'Arroz', 'Huevo', 'Cera de Soya'
  group_id            uuid REFERENCES public.item_groups(id) ON DELETE SET NULL,
  base_unit           text NOT NULL,               -- unidad en la que se almacena el stock (Gr, Und, Ml)
  unit_cost_per_base  numeric NOT NULL DEFAULT 0,  -- costo por 1 unidad base (calculado por compras)
  supplier_id         uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  units_per_purchase  numeric,                     -- cuántas unidades base trae una compra típica
  stock_min           numeric DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  note                text,
  -- campos personalizados por empresa (configurables): clave->valor
  custom_fields       jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (company_id, code)
);
CREATE INDEX IF NOT EXISTS materials_company_idx ON public.materials (company_id);
CREATE INDEX IF NOT EXISTS materials_group_idx ON public.materials (group_id);
DROP TRIGGER IF EXISTS materials_updated_at ON public.materials;
CREATE TRIGGER materials_updated_at BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════
-- 4. COMPRAS (cada compra registra cantidad y costo pagado)
--    El costo_unitario = costo_total / cantidad. Alimenta el
--    costo del material según el método de costeo de la empresa.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.purchases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  material_id     uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  purchased_at    date NOT NULL DEFAULT current_date,
  quantity        numeric NOT NULL CHECK (quantity > 0),  -- en unidad base del material
  total_cost      numeric NOT NULL DEFAULT 0,             -- valor pagado por la compra
  unit_cost       numeric GENERATED ALWAYS AS (CASE WHEN quantity > 0 THEN total_cost / quantity ELSE 0 END) STORED,
  supplier_id     uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  note            text,
  affects_stock   boolean NOT NULL DEFAULT true,
  voided          boolean NOT NULL DEFAULT false,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchases_company_idx ON public.purchases (company_id);
CREATE INDEX IF NOT EXISTS purchases_material_idx ON public.purchases (material_id);
CREATE INDEX IF NOT EXISTS purchases_date_idx ON public.purchases (company_id, purchased_at);

-- ═══════════════════════════════════════════════════════════
-- 5. PRODUCTOS (lo que la empresa vende; su receta vive en Costos)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code        text,
  name        text NOT NULL,               -- 'Arroz Chino'
  group_id    uuid REFERENCES public.item_groups(id) ON DELETE SET NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (company_id, code)
);
CREATE INDEX IF NOT EXISTS products_company_idx ON public.products (company_id);
DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════
-- 6. CONTROL DE CONCURRENCIA POR MÓDULO
--    Facturación/Ventas/Inventario = máx 2 editores a la vez.
--    RRHH/Productividad = máx 10. Se registra una "sesión activa"
--    con heartbeat; la app cuenta editores vigentes por módulo.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.module_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module_id    text NOT NULL,              -- 'ventas','inventarios','costos','rrhh','productividad'
  user_auth_id uuid NOT NULL,              -- auth.users.id
  mode         text NOT NULL DEFAULT 'editor', -- 'editor' | 'lector'
  last_seen    timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz DEFAULT now(),
  UNIQUE (company_id, module_id, user_auth_id)
);
CREATE INDEX IF NOT EXISTS module_sessions_lookup ON public.module_sessions (company_id, module_id, last_seen);

-- Límite de editores por módulo (configurable; defaults del usuario)
CREATE OR REPLACE FUNCTION public.module_editor_limit(p_module text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_module IN ('ventas','inventarios','costos','facturacion') THEN 2
    WHEN p_module IN ('rrhh','productividad') THEN 10
    ELSE 5
  END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 7. ROW LEVEL SECURITY (patrón: su empresa O superadmin)
--    is_superadmin() y current_company_id() vienen de 001/002.
-- ═══════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'units','item_groups','suppliers','company_parameters',
    'materials','purchases','products','module_sessions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I;', t, t);
    EXECUTE format($f$CREATE POLICY "%s_select" ON public.%I FOR SELECT
      USING (company_id = public.current_company_id() OR public.is_superadmin());$f$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON public.%I;', t, t);
    EXECUTE format($f$CREATE POLICY "%s_insert" ON public.%I FOR INSERT
      WITH CHECK (company_id = public.current_company_id() OR public.is_superadmin());$f$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON public.%I;', t, t);
    EXECUTE format($f$CREATE POLICY "%s_update" ON public.%I FOR UPDATE
      USING (company_id = public.current_company_id() OR public.is_superadmin());$f$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON public.%I;', t, t);
    EXECUTE format($f$CREATE POLICY "%s_delete" ON public.%I FOR DELETE
      USING (company_id = public.current_company_id() OR public.is_superadmin());$f$, t, t);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════
-- 8. SEMILLA DE CATÁLOGOS AL CREAR UNA EMPRESA
--    Cuando el superadmin crea una empresa, se cargan unidades,
--    grupos y parámetros por defecto que luego el admin ajusta.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.seed_company_defaults(p_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Unidades base + conversiones comunes
  INSERT INTO public.units (company_id, code, name, dimension, base_code, factor) VALUES
    (p_company_id, 'Gr', 'Gramos',     'peso',      'Gr', 1),
    (p_company_id, 'Kg', 'Kilogramos', 'peso',      'Gr', 1000),
    (p_company_id, 'Ml', 'Mililitros', 'volumen',   'Ml', 1),
    (p_company_id, 'Lt', 'Litros',     'volumen',   'Ml', 1000),
    (p_company_id, 'Und','Unidades',   'conteo',    'Und',1),
    (p_company_id, 'Mt', 'Metros',     'longitud',  'Mt', 1)
  ON CONFLICT (company_id, code) DO NOTHING;

  -- Parámetros por defecto (casillas configurables)
  INSERT INTO public.company_parameters (company_id, key, value, value_type, label, description) VALUES
    (p_company_id, 'iva_pct',            '0.19',          'percent','IVA (%)','Impuesto que se suma al costo si aplica'),
    (p_company_id, 'margen_default_pct', '0.30',          'percent','Margen de ganancia por defecto (%)','Se aplica a una receta nueva; editable por producto'),
    (p_company_id, 'costeo_metodo',      'ULTIMA_COMPRA', 'text',   'Método de costeo','ULTIMA_COMPRA o PROMEDIO_PONDERADO'),
    (p_company_id, 'comision_pago_pct',  '0',             'percent','Comisión pasarela/medio de pago (%)','Ej. Wompi; opcional en el precio de venta'),
    (p_company_id, 'moneda',             'COP',           'text',   'Moneda','Peso colombiano por defecto')
  ON CONFLICT (company_id, key) DO NOTHING;
END $$;
