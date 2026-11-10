-- ============================================================
-- SUMA Platform — Migración Inicial Idempotente (100% Segura)
-- ============================================================

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────
-- 1. ENUMS (con protección ante re-ejecución)
-- ─────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE role_code AS ENUM ('owner', 'admin', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('Activo', 'Invitado', 'Suspendido');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE company_module_status AS ENUM ('activo', 'en_prueba', 'suspendido', 'pendiente', 'no_contratado');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE billing_period AS ENUM ('mensual', 'trimestral', 'anual');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE application_status AS ENUM (
    'borrador', 'enviada', 'pago_pendiente', 'pago_recibido',
    'en_revision', 'requiere_correccion', 'aprobada', 'rechazada',
    'cuenta_creada', 'activa'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────
-- 2. TABLAS BASE
-- ─────────────────────────────────────────

-- Tabla: companies (Tenant Raíz)
CREATE TABLE IF NOT EXISTS public.companies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  commercial_name     text,
  nit                 text NOT NULL UNIQUE,
  city                text,
  plan                text NOT NULL DEFAULT 'Plan Modular',
  billing_cycle_label text,
  storage_used        bigint DEFAULT 0,
  users_count         int DEFAULT 0,
  created_at          timestamptz DEFAULT now()
);

-- Tabla: company_users
CREATE TABLE IF NOT EXISTS public.company_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text,
  email       text,
  role        role_code DEFAULT 'user',
  role_label  text,
  status      user_status DEFAULT 'Activo',
  last_login  timestamptz,
  permissions text[] DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  UNIQUE (auth_id),
  UNIQUE (company_id, email)
);

-- Tabla: company_modules
CREATE TABLE IF NOT EXISTS public.company_modules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  module_id      text NOT NULL,
  name           text,
  status         company_module_status DEFAULT 'no_contratado',
  activated_at   date,
  billing_period billing_period,
  metrics        jsonb DEFAULT '[]',
  UNIQUE (company_id, module_id)
);

-- Tabla: applications (solicitudes checkout público)
CREATE TABLE IF NOT EXISTS public.applications (
  id               text PRIMARY KEY,
  company_id       uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  submitted_at     timestamptz DEFAULT now(),
  company_name     text,
  commercial_name  text,
  nit              text,
  city             text,
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  modules          text[],
  period           text,
  total_cop        bigint DEFAULT 0,
  payment_status   text,
  payment_gateway  text,
  status           application_status DEFAULT 'enviada',
  documents        jsonb DEFAULT '[]',
  history          jsonb DEFAULT '[]'
);

-- Tabla: inventory_items (Módulo Inventarios & Costos)
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  sku                 text,
  name                text NOT NULL,
  base_unit           text NOT NULL,
  unit_cost_per_base  numeric NOT NULL DEFAULT 0,
  group_name          text,
  supplier            text,
  stock               numeric DEFAULT 0,
  stock_min           numeric DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (company_id, sku)
);

-- Tabla: recipes (Módulo Costos)
CREATE TABLE IF NOT EXISTS public.recipes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  product     text NOT NULL,
  code        text,
  yield_qty   numeric DEFAULT 1,
  yield_unit  text DEFAULT 'und',
  margin      numeric DEFAULT 0.35,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Tabla: recipe_ingredients (Insumos de cada receta)
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id            uuid REFERENCES public.recipes(id) ON DELETE CASCADE NOT NULL,
  inventory_item_id    uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  name                 text NOT NULL,
  qty                  numeric NOT NULL DEFAULT 0,
  unit                 text NOT NULL,
  unit_cost_per_base   numeric NOT NULL DEFAULT 0
);

-- Tabla: sales (Módulo Ventas)
CREATE TABLE IF NOT EXISTS public.sales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  recipe_id       uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  product_name    text NOT NULL,
  qty             numeric NOT NULL DEFAULT 1,
  sale_price      numeric NOT NULL DEFAULT 0,
  total_revenue   numeric GENERATED ALWAYS AS (qty * sale_price) STORED,
  total_cost      numeric DEFAULT 0,
  profit          numeric DEFAULT 0,
  margin_actual   numeric DEFAULT 0,
  channel         text,
  notes           text,
  sold_at         timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- 3. FUNCIONES AUXILIARES (SECURITY DEFINER)
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.company_users WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_role_code()
RETURNS role_code
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.company_users WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_role_code() IN ('owner', 'admin'), false);
$$;

-- ─────────────────────────────────────────
-- 4. ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────

-- companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "companies_select" ON public.companies;
DROP POLICY IF EXISTS "companies_update" ON public.companies;
CREATE POLICY "companies_select" ON public.companies FOR SELECT
  USING (id = public.current_company_id() OR public.current_company_id() IS NULL);
CREATE POLICY "companies_update" ON public.companies FOR UPDATE
  USING (id = public.current_company_id() AND public.is_company_admin());

-- company_users
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_users_select" ON public.company_users;
DROP POLICY IF EXISTS "company_users_insert" ON public.company_users;
DROP POLICY IF EXISTS "company_users_update" ON public.company_users;
DROP POLICY IF EXISTS "company_users_delete" ON public.company_users;
CREATE POLICY "company_users_select" ON public.company_users FOR SELECT
  USING (company_id = public.current_company_id() OR auth_id = auth.uid());
CREATE POLICY "company_users_insert" ON public.company_users FOR INSERT
  WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin());
CREATE POLICY "company_users_update" ON public.company_users FOR UPDATE
  USING (company_id = public.current_company_id() AND public.is_company_admin());
CREATE POLICY "company_users_delete" ON public.company_users FOR DELETE
  USING (company_id = public.current_company_id() AND public.is_company_admin());

-- company_modules
ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_modules_select" ON public.company_modules;
DROP POLICY IF EXISTS "company_modules_update" ON public.company_modules;
CREATE POLICY "company_modules_select" ON public.company_modules FOR SELECT
  USING (company_id = public.current_company_id());
CREATE POLICY "company_modules_update" ON public.company_modules FOR UPDATE
  USING (company_id = public.current_company_id() AND public.is_company_admin());

-- applications
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "applications_select" ON public.applications;
DROP POLICY IF EXISTS "applications_insert" ON public.applications;
CREATE POLICY "applications_select" ON public.applications FOR SELECT
  USING (company_id = public.current_company_id() OR company_id IS NULL);
CREATE POLICY "applications_insert" ON public.applications FOR INSERT
  WITH CHECK (true);

-- inventory_items
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_items_select" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_insert" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_update" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_delete" ON public.inventory_items;
CREATE POLICY "inventory_items_select" ON public.inventory_items FOR SELECT
  USING (company_id = public.current_company_id() OR public.current_company_id() IS NULL);
CREATE POLICY "inventory_items_insert" ON public.inventory_items FOR INSERT
  WITH CHECK (company_id = public.current_company_id() OR public.current_company_id() IS NULL);
CREATE POLICY "inventory_items_update" ON public.inventory_items FOR UPDATE
  USING (company_id = public.current_company_id() OR public.current_company_id() IS NULL);
CREATE POLICY "inventory_items_delete" ON public.inventory_items FOR DELETE
  USING (company_id = public.current_company_id() OR public.current_company_id() IS NULL);

-- recipes
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recipes_select" ON public.recipes;
DROP POLICY IF EXISTS "recipes_insert" ON public.recipes;
DROP POLICY IF EXISTS "recipes_update" ON public.recipes;
DROP POLICY IF EXISTS "recipes_delete" ON public.recipes;
CREATE POLICY "recipes_select" ON public.recipes FOR SELECT
  USING (company_id = public.current_company_id() OR public.current_company_id() IS NULL);
CREATE POLICY "recipes_insert" ON public.recipes FOR INSERT
  WITH CHECK (company_id = public.current_company_id() OR public.current_company_id() IS NULL);
CREATE POLICY "recipes_update" ON public.recipes FOR UPDATE
  USING (company_id = public.current_company_id() OR public.current_company_id() IS NULL);
CREATE POLICY "recipes_delete" ON public.recipes FOR DELETE
  USING (company_id = public.current_company_id() OR public.current_company_id() IS NULL);

-- recipe_ingredients
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recipe_ingredients_select" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "recipe_ingredients_insert" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "recipe_ingredients_update" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "recipe_ingredients_delete" ON public.recipe_ingredients;
CREATE POLICY "recipe_ingredients_select" ON public.recipe_ingredients FOR SELECT
  USING (true);
CREATE POLICY "recipe_ingredients_insert" ON public.recipe_ingredients FOR INSERT
  WITH CHECK (true);
CREATE POLICY "recipe_ingredients_update" ON public.recipe_ingredients FOR UPDATE
  USING (true);
CREATE POLICY "recipe_ingredients_delete" ON public.recipe_ingredients FOR DELETE
  USING (true);

-- sales
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales_select" ON public.sales;
DROP POLICY IF EXISTS "sales_insert" ON public.sales;
DROP POLICY IF EXISTS "sales_update" ON public.sales;
DROP POLICY IF EXISTS "sales_delete" ON public.sales;
CREATE POLICY "sales_select" ON public.sales FOR SELECT
  USING (company_id = public.current_company_id() OR public.current_company_id() IS NULL);
CREATE POLICY "sales_insert" ON public.sales FOR INSERT
  WITH CHECK (company_id = public.current_company_id() OR public.current_company_id() IS NULL);
CREATE POLICY "sales_update" ON public.sales FOR UPDATE
  USING (company_id = public.current_company_id() OR public.current_company_id() IS NULL);
CREATE POLICY "sales_delete" ON public.sales FOR DELETE
  USING (company_id = public.current_company_id() OR public.current_company_id() IS NULL);

-- ─────────────────────────────────────────
-- 5. TRIGGERS Y FUNCIONES AUTOMÁTICAS
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_users (auth_id, email, name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'user',
    'Activo'
  )
  ON CONFLICT (auth_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS recipes_updated_at ON public.recipes;
CREATE TRIGGER recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
