// ============================================================
// SUMA Platform — Layout público
// ============================================================
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Menu, X, Moon, Sun } from 'lucide-react';
import { Logo, Button } from '@/components/ui';
import { useAppStore } from '@/store/AppStore';
import { BRAND } from '@/config/brand';

const NAV_LINKS = [
  { label: 'Inicio', href: '/' },
  { label: 'Servicios', href: '/servicios' },
  { label: 'Precios', href: '/precios' },
  { label: 'Nosotros', href: '/nosotros' },
  { label: 'Contacto', href: '/contacto' },
];

function PublicHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { state, dispatch } = useAppStore();
  const location = useLocation();

  const toggleTheme = () => {
    dispatch({ type: 'SET_THEME', payload: state.theme === 'dark' ? 'light' : 'dark' });
  };

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/">
            <Logo size="md" />
          </Link>

          {/* Nav desktop */}
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === link.href
                    ? 'text-suma-600 dark:text-suma-400'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
            >
              {state.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <Link to="/login">
              <Button variant="ghost" size="sm">Ingresar</Button>
            </Link>
            <Link to="/precios" className="hidden md:block">
              <Button size="sm">Contratar</Button>
            </Link>

            {/* Mobile toggle */}
            <button
              className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-200 dark:border-gray-800 py-4 space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <Link to="/precios">
                <Button className="w-full" size="sm">Contratar módulos</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="bg-gray-900 dark:bg-gray-950 text-gray-400 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-suma-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">S</span>
              </div>
              <span className="text-white font-bold text-lg">SUMA</span>
            </div>
            <p className="text-sm">{BRAND.tagline}</p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Plataforma</h4>
            <ul className="space-y-2 text-sm">
              {['RRHH', 'Productividad', 'Inventarios', 'Costos', 'Ventas'].map((m) => (
                <li key={m}>
                  <Link to="/servicios" className="hover:text-white transition-colors">{m}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Empresa</h4>
            <ul className="space-y-2 text-sm">
              {[
                { label: 'Nosotros', href: '/nosotros' },
                { label: 'Precios', href: '/precios' },
                { label: 'Contacto', href: '/contacto' },
              ].map((l) => (
                <li key={l.href}>
                  <Link to={l.href} className="hover:text-white transition-colors">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Contacto</h4>
            <ul className="space-y-2 text-sm">
              <li>{BRAND.email}</li>
              <li>{BRAND.phone}</li>
              <li>Colombia</li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-gray-800 text-center text-xs">
          © {new Date().getFullYear()} SUMA Plataforma. Todos los derechos reservados.
          Hecho con ❤️ en Colombia.
        </div>
      </div>
    </footer>
  );
}

export function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
      <PublicHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}

// ─────────────────────────────────────────
// Portal Layout (autenticado)
// ─────────────────────────────────────────
import {
  LayoutDashboard, Users, CheckSquare,
  Package, Calculator, TrendingUp, Settings,
  LogOut, Bell, Building2,
} from 'lucide-react';
import { useAppStore as _useAppStore, useIsSuperAdmin, useRoleLabel } from '@/store/AppStore';
import { signOut, listCompanies } from '@/services/auth';
import { useNavigate } from 'react-router-dom';
import { MODULES_CONFIG } from '@/config/brand';
import type { ModuleId, Company } from '@/types/domain';

const MODULE_ICONS: Record<ModuleId, React.ReactNode> = {
  rrhh: <Users className="w-5 h-5" />,
  productividad: <CheckSquare className="w-5 h-5" />,
  inventarios: <Package className="w-5 h-5" />,
  costos: <Calculator className="w-5 h-5" />,
  ventas: <TrendingUp className="w-5 h-5" />,
};

const MODULE_NAMES: Record<ModuleId, string> = {
  rrhh: 'RRHH',
  productividad: 'Productividad',
  inventarios: 'Inventarios',
  costos: 'Costos',
  ventas: 'Ventas',
};

export function PortalLayout() {
  const { state, dispatch } = _useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isSuperAdmin = useIsSuperAdmin();
  const roleLabel = useRoleLabel();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Superadmin: ve TODOS los módulos (revisión/QA), sin importar contratación.
  // Resto: solo módulos activos o en prueba de su empresa.
  const navModules: { module_id: ModuleId; name: string }[] = isSuperAdmin
    ? MODULES_CONFIG.map((mc) => ({ module_id: mc.id, name: mc.name }))
    : state.modules
        .filter((m) => m.status === 'activo' || m.status === 'en_prueba')
        .map((m) => ({ module_id: m.module_id as ModuleId, name: m.name }));

  const handleSignOut = async () => {
    await signOut();
    dispatch({ type: 'RESET' });
    navigate('/login');
  };

  const toggleTheme = () => {
    dispatch({ type: 'SET_THEME', payload: state.theme === 'dark' ? 'light' : 'dark' });
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-16'} flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-200`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-gray-200 dark:border-gray-800">
          {sidebarOpen ? (
            <Logo size="sm" />
          ) : (
            <div className="w-8 h-8 bg-suma-600 rounded-lg flex items-center justify-center mx-auto">
              <span className="text-white font-bold text-sm">S</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          <NavItem
            href="/portal"
            icon={<LayoutDashboard className="w-5 h-5" />}
            label="Inicio"
            collapsed={!sidebarOpen}
            active={location.pathname === '/portal'}
          />

          {navModules.length > 0 && (
            <>
              {sidebarOpen && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 pt-4 pb-1">
                  {isSuperAdmin ? 'Módulos · Revisión SUMA' : 'Módulos'}
                </p>
              )}
              {navModules.map((mod) => (
                <NavItem
                  key={mod.module_id}
                  href={`/portal/modulos/${mod.module_id}`}
                  icon={MODULE_ICONS[mod.module_id as ModuleId]}
                  label={MODULE_NAMES[mod.module_id as ModuleId] ?? mod.name}
                  collapsed={!sidebarOpen}
                  active={location.pathname.startsWith(`/portal/modulos/${mod.module_id}`)}
                />
              ))}
            </>
          )}

          {sidebarOpen && (
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 pt-4 pb-1">
              Empresa
            </p>
          )}
          <NavItem
            href="/portal/configuracion"
            icon={<Settings className="w-5 h-5" />}
            label="Configuración"
            collapsed={!sidebarOpen}
            active={location.pathname === '/portal/configuracion'}
          />
        </nav>

        {/* Footer sidebar */}
        <div className="border-t border-gray-200 dark:border-gray-800 p-3 space-y-1">
          {sidebarOpen && state.company && (
            <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
              <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
                  {state.company.commercial_name ?? state.company.name}
                </p>
                <p className="text-xs text-gray-400">{state.company.plan}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {sidebarOpen && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 gap-4 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Selector de empresa activa (solo superadmin) */}
          {isSuperAdmin && <CompanySwitcher />}

          <div className="flex-1" />

          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {state.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors relative">
            <Bell className="w-4 h-4" />
          </button>

          {state.user && (
            <div className="flex items-center gap-2 pl-3 border-l border-gray-200 dark:border-gray-700">
              <div className="w-8 h-8 rounded-full bg-suma-600 flex items-center justify-center">
                <span className="text-white text-sm font-semibold">
                  {state.user.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                  {state.user.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {roleLabel}
                </p>
              </div>
            </div>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({
  href,
  icon,
  label,
  collapsed,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <Link
      to={href}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-suma-50 dark:bg-suma-950 text-suma-700 dark:text-suma-300'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

// ─────────────────────────────────────────
// Selector de empresa activa (solo superadmin)
// El superadmin no tiene empresa propia: elige en cuál trabajar.
// Guarda la elección en el AppStore (state.company) y en localStorage.
// ─────────────────────────────────────────
function CompanySwitcher() {
  const { state, dispatch } = _useAppStore();
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    let cancelled = false;
    listCompanies().then((list) => {
      if (cancelled) return;
      setCompanies(list);
      // Restaurar la última empresa elegida si no hay una activa
      if (!state.company && list.length > 0) {
        const savedId = localStorage.getItem('suma-active-company');
        const chosen = list.find((c) => c.id === savedId) ?? list[0];
        dispatch({ type: 'SET_COMPANY', payload: chosen });
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (companies.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Building2 className="w-4 h-4 text-suma-500" />
      <select
        value={state.company?.id ?? ''}
        onChange={(e) => {
          const c = companies.find((x) => x.id === e.target.value) ?? null;
          if (c) localStorage.setItem('suma-active-company', c.id);
          dispatch({ type: 'SET_COMPANY', payload: c });
        }}
        className="max-w-[200px] px-2 py-1.5 rounded-lg border border-suma-300 dark:border-suma-700 text-sm bg-suma-50 dark:bg-suma-950 text-suma-800 dark:text-suma-200 font-medium focus:outline-none focus:ring-2 focus:ring-suma-500"
        title="Empresa activa (superadmin)"
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>{c.commercial_name ?? c.name}</option>
        ))}
      </select>
    </div>
  );
}
