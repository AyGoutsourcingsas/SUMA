-- ============================================================
-- SUMA Platform — Migración 002: Sistema de 3 perfiles
-- superadmin (SUMA/tú) · admin (jefe de empresa) · user (tareas)
-- Idempotente y segura ante re-ejecución.
-- ============================================================

-- ─────────────────────────────────────────
-- 1. Añadir 'superadmin' al enum role_code
--    (ALTER TYPE ... ADD VALUE no admite IF NOT EXISTS en versiones
--     viejas; lo envolvemos para que sea idempotente)
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'role_code' AND e.enumlabel = 'superadmin'
  ) THEN
    ALTER TYPE role_code ADD VALUE 'superadmin';
  END IF;
END $$;

-- ─────────────────────────────────────────
-- 2. Lista de correos superadmin de SUMA
--    (tabla, para poder agregar más adelante sin tocar código)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.superadmins (
  email      text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

-- Semilla: tu correo
INSERT INTO public.superadmins (email)
VALUES ('alcarhumansresources@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- ─────────────────────────────────────────
-- 3. Helper: ¿el usuario autenticado es superadmin?
--    Se apoya en la tabla superadmins (por correo del JWT).
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_users cu
    WHERE cu.auth_id = auth.uid()
      AND (cu.role = 'superadmin'
           OR cu.email IN (SELECT email FROM public.superadmins))
  )
  OR EXISTS (
    SELECT 1 FROM public.superadmins s
    WHERE s.email = (auth.jwt() ->> 'email')
  );
$$;

-- ─────────────────────────────────────────
-- 4. Trigger de alta de usuario: si el correo está en superadmins,
--    se le asigna el rol 'superadmin'. Reemplaza al handler anterior.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean;
BEGIN
  v_is_super := EXISTS (
    SELECT 1 FROM public.superadmins s WHERE s.email = NEW.email
  );

  INSERT INTO public.company_users (auth_id, email, name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    CASE WHEN v_is_super THEN 'superadmin'::role_code ELSE 'user'::role_code END,
    'Activo'
  )
  ON CONFLICT (auth_id) DO UPDATE
    SET role = CASE WHEN v_is_super THEN 'superadmin'::role_code ELSE public.company_users.role END;

  RETURN NEW;
END;
$$;

-- Promover a superadmin cualquier usuario YA existente cuyo correo esté
-- en la lista (por si te registraste antes de aplicar esta migración).
UPDATE public.company_users cu
SET role = 'superadmin'
WHERE cu.email IN (SELECT email FROM public.superadmins)
  AND cu.role <> 'superadmin';

-- ─────────────────────────────────────────
-- 5. is_company_admin ahora considera superadmin
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_company_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_role_code() IN ('owner', 'admin', 'superadmin'),
    false
  ) OR public.is_superadmin();
$$;

-- ─────────────────────────────────────────
-- 6. RLS: el superadmin ve y gestiona TODO (todas las empresas,
--    todos los módulos). Añadimos is_superadmin() a las políticas.
-- ─────────────────────────────────────────

-- superadmins: solo superadmins pueden leer/escribir la lista
ALTER TABLE public.superadmins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "superadmins_all" ON public.superadmins;
CREATE POLICY "superadmins_all" ON public.superadmins FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- companies
DROP POLICY IF EXISTS "companies_select" ON public.companies;
DROP POLICY IF EXISTS "companies_update" ON public.companies;
CREATE POLICY "companies_select" ON public.companies FOR SELECT
  USING (id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY "companies_update" ON public.companies FOR UPDATE
  USING ((id = public.current_company_id() AND public.is_company_admin()) OR public.is_superadmin());

-- company_users
DROP POLICY IF EXISTS "company_users_select" ON public.company_users;
DROP POLICY IF EXISTS "company_users_insert" ON public.company_users;
DROP POLICY IF EXISTS "company_users_update" ON public.company_users;
DROP POLICY IF EXISTS "company_users_delete" ON public.company_users;
CREATE POLICY "company_users_select" ON public.company_users FOR SELECT
  USING (company_id = public.current_company_id() OR auth_id = auth.uid() OR public.is_superadmin());
CREATE POLICY "company_users_insert" ON public.company_users FOR INSERT
  WITH CHECK ((company_id = public.current_company_id() AND public.is_company_admin()) OR public.is_superadmin());
CREATE POLICY "company_users_update" ON public.company_users FOR UPDATE
  USING ((company_id = public.current_company_id() AND public.is_company_admin()) OR public.is_superadmin());
CREATE POLICY "company_users_delete" ON public.company_users FOR DELETE
  USING ((company_id = public.current_company_id() AND public.is_company_admin()) OR public.is_superadmin());

-- company_modules
DROP POLICY IF EXISTS "company_modules_select" ON public.company_modules;
DROP POLICY IF EXISTS "company_modules_update" ON public.company_modules;
CREATE POLICY "company_modules_select" ON public.company_modules FOR SELECT
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY "company_modules_update" ON public.company_modules FOR UPDATE
  USING ((company_id = public.current_company_id() AND public.is_company_admin()) OR public.is_superadmin());

-- applications
DROP POLICY IF EXISTS "applications_select" ON public.applications;
CREATE POLICY "applications_select" ON public.applications FOR SELECT
  USING (company_id = public.current_company_id() OR company_id IS NULL OR public.is_superadmin());

-- inventory_items
DROP POLICY IF EXISTS "inventory_items_select" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_insert" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_update" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_delete" ON public.inventory_items;
CREATE POLICY "inventory_items_select" ON public.inventory_items FOR SELECT
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY "inventory_items_insert" ON public.inventory_items FOR INSERT
  WITH CHECK (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY "inventory_items_update" ON public.inventory_items FOR UPDATE
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY "inventory_items_delete" ON public.inventory_items FOR DELETE
  USING ((company_id = public.current_company_id() AND public.is_company_admin()) OR public.is_superadmin());

-- recipes
DROP POLICY IF EXISTS "recipes_select" ON public.recipes;
DROP POLICY IF EXISTS "recipes_insert" ON public.recipes;
DROP POLICY IF EXISTS "recipes_update" ON public.recipes;
DROP POLICY IF EXISTS "recipes_delete" ON public.recipes;
CREATE POLICY "recipes_select" ON public.recipes FOR SELECT
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY "recipes_insert" ON public.recipes FOR INSERT
  WITH CHECK (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY "recipes_update" ON public.recipes FOR UPDATE
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY "recipes_delete" ON public.recipes FOR DELETE
  USING ((company_id = public.current_company_id() AND public.is_company_admin()) OR public.is_superadmin());

-- sales
DROP POLICY IF EXISTS "sales_select" ON public.sales;
DROP POLICY IF EXISTS "sales_insert" ON public.sales;
DROP POLICY IF EXISTS "sales_update" ON public.sales;
DROP POLICY IF EXISTS "sales_delete" ON public.sales;
CREATE POLICY "sales_select" ON public.sales FOR SELECT
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY "sales_insert" ON public.sales FOR INSERT
  WITH CHECK (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY "sales_update" ON public.sales FOR UPDATE
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY "sales_delete" ON public.sales FOR DELETE
  USING ((company_id = public.current_company_id() AND public.is_company_admin()) OR public.is_superadmin());
