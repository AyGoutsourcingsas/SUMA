-- ============================================================
-- SUMA ERP — Migración 010: Arreglar enforce_company_id
-- El trigger bloqueaba operaciones legítimas de funciones internas
-- (SECURITY DEFINER / SQL directo sin usuario autenticado), como el
-- seed de empresas. Ahora: si NO hay usuario autenticado (auth.uid()
-- es null) se confía en el company_id provisto (contexto servidor).
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_company_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_current uuid; v_uid uuid;
BEGIN
  v_uid := auth.uid();

  -- Contexto servidor / SQL directo (sin usuario autenticado):
  -- confiar en el company_id que viene; si falta, no se puede derivar.
  IF v_uid IS NULL THEN
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'Falta company_id (operación sin usuario autenticado).';
    END IF;
    RETURN NEW;
  END IF;

  v_current := public.current_company_id();

  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_current;
  END IF;

  IF public.is_superadmin() THEN
    -- superadmin: debe especificar empresa (la elige en la app)
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'Superadmin debe seleccionar una empresa para crear registros.';
    END IF;
  ELSE
    -- usuario normal: solo su empresa
    IF v_current IS NULL THEN
      RAISE EXCEPTION 'Usuario sin empresa asignada: no puede crear registros.';
    END IF;
    NEW.company_id := v_current;
  END IF;

  RETURN NEW;
END $$;

-- Re-sembrar empresas existentes (ahora el seed ya no choca con el trigger)
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM public.seed_company_defaults(c.id);
  END LOOP;
END $$;
