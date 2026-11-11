# SUMA — Sistema de perfiles (roles)

SUMA maneja **3 perfiles**. El rol vive en `company_users.role` (enum `role_code`).

| Perfil | Valor en BD | Quién | Qué puede hacer |
|---|---|---|---|
| **Superadministrador** | `superadmin` | Equipo SUMA (tú) | Acceso **total**: ve **todas las empresas** y **todos los módulos** sin importar si están contratados. Pensado para revisar/QA cómo va quedando cada módulo. Puede crear/editar/eliminar en todos. |
| **Administrador** | `admin` / `owner` | Jefe de la empresa cliente | Gestiona **su** empresa: usuarios, configuración y los módulos **contratados** (activos o en prueba). Puede crear/editar/eliminar dentro de esos módulos. |
| **Usuario** | `user` | Empleado de la empresa | Solo **ejecuta y consulta** en los módulos de su empresa. No crea/edita/elimina, no importa Excel, no gestiona usuarios ni configuración. |

## Cómo se decide el superadmin

- Hay una tabla `public.superadmins(email)` con la lista de correos superadmin.
- Correo semilla: **alcarhumansresources@gmail.com** (migración `002`).
- Cuando un usuario con un correo de esa lista se registra, el trigger `handle_new_auth_user` le asigna automáticamente el rol `superadmin`.
- Si el usuario ya existía, la migración `002` lo promueve a `superadmin`.
- Para agregar más superadmins: `INSERT INTO public.superadmins (email) VALUES ('otro@correo.com');`

## Cómo entrar como superadmin (pasos)

> Requiere el proyecto Supabase configurado. No hay modo demo.

1. Crear un proyecto en Supabase y copiar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` al `.env`.
2. Aplicar las migraciones en orden (SQL Editor o `supabase db push`):
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_perfiles_superadmin.sql`
3. Registrar un usuario (signup) con el correo **alcarhumansresources@gmail.com**.
   - El trigger lo marcará como `superadmin` automáticamente.
4. Iniciar sesión en `/login`. Al entrar al `/portal` verás el badge **“Superadmin SUMA”** y **todos los módulos** en el sidebar.

## Dónde se aplican los permisos en el frontend

- `src/store/AppStore.tsx`:
  - `useIsSuperAdmin()` — ¿es superadmin?
  - `useIsAdmin()` — superadmin/owner/admin.
  - `useCanEdit()` — ¿puede crear/editar/eliminar? (bloquea al perfil `user`).
  - `useHasModule(id)` — superadmin siempre `true`; resto según contratación.
  - `useRoleLabel()` — etiqueta legible del perfil.
- `src/components/layout/index.tsx` — el sidebar muestra todos los módulos al superadmin.
- `src/pages/portal/PortalHome.tsx` — dashboard adaptado al superadmin.
- `src/pages/portal/modules/CostosModule.tsx` — botones de crear/editar/eliminar/importar solo para `useCanEdit()`.

## Backend (RLS)

En `002_perfiles_superadmin.sql`, todas las políticas incluyen `OR public.is_superadmin()`, de modo que el superadmin puede leer y escribir en todas las empresas. El resto sigue aislado por `company_id` (multi-tenant).
