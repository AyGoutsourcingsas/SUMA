-- Crear empresa inicial demo / default si no existe
INSERT INTO public.companies (id, name, commercial_name, nit, city, plan, storage_used, users_count)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'MELTÉ WAX S.A.S.',
  'MELTÉ',
  '901.452.128-4',
  'Bogotá',
  'Plan Modular Completo',
  10485760,
  3
)
ON CONFLICT (nit) DO UPDATE SET
  commercial_name = EXCLUDED.commercial_name,
  city = EXCLUDED.city;

-- Crear el perfil Super Admin para alcarhumansresources@gmail.com
INSERT INTO public.company_users (
  id,
  company_id,
  name,
  email,
  role,
  role_label,
  status,
  permissions
)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Alan Giraldo (Super Admin)',
  'alcarhumansresources@gmail.com',
  'super_admin',
  'Super Administrador',
  'Activo',
  ARRAY['*']
)
ON CONFLICT (company_id, email) DO UPDATE SET
  role = 'super_admin',
  role_label = 'Super Administrador',
  permissions = ARRAY['*'];

-- Activar todos los módulos para la empresa
INSERT INTO public.company_modules (company_id, module_id, name, status, billing_period)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'costos', 'Costos y Recetas', 'activo', 'mensual'),
  ('00000000-0000-0000-0000-000000000001', 'inventarios', 'Inventarios', 'activo', 'mensual'),
  ('00000000-0000-0000-0000-000000000001', 'ventas', 'Ventas', 'activo', 'mensual'),
  ('00000000-0000-0000-0000-000000000001', 'rrhh', 'RRHH', 'activo', 'mensual'),
  ('00000000-0000-0000-0000-000000000001', 'productividad', 'Productividad', 'activo', 'mensual'),
  ('00000000-0000-0000-0000-000000000001', 'contabilidad', 'Contabilidad', 'activo', 'mensual')
ON CONFLICT (company_id, module_id) DO UPDATE SET
  status = 'activo';
