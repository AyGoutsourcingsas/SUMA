// ============================================================
// SUMA Platform — App.tsx — Router principal
// ============================================================
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { PublicLayout, PortalLayout } from '@/components/layout';
import { LoadingScreen } from '@/components/ui';
import { useAppStore } from '@/store/AppStore';
import { supabase } from '@/services/supabase';
import { getCurrentUser, getCurrentCompany, getCompanyModules } from '@/services/auth';

// Páginas públicas
import Home from '@/pages/public/Home';
import Services from '@/pages/public/Services';
import Pricing from '@/pages/public/Pricing';
import About from '@/pages/public/About';
import Contact from '@/pages/public/Contact';
import Login from '@/pages/public/Login';
import Checkout from '@/pages/public/Checkout';
import CheckoutSuccess from '@/pages/public/CheckoutSuccess';

// Portal
import PortalHome from '@/pages/portal/PortalHome';
import CompanySettings from '@/pages/portal/CompanySettings';
import ModuleWorkspace from '@/pages/portal/ModuleWorkspace';

// Módulos específicos
import CostosModule from '@/pages/portal/modules/CostosModule';
import InventariosModule from '@/pages/portal/modules/InventariosModule';
import VentasModule from '@/pages/portal/modules/VentasModule';

// Ops
import OpsConsole from '@/pages/ops/OpsConsole';

// Guard de ruta privada
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { state } = useAppStore();
  if (state.isLoading) return <LoadingScreen />;
  if (!state.user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function OpsRoute({ children }: { children: React.ReactNode }) {
  const { state } = useAppStore();
  if (state.isLoading) return <LoadingScreen />;
  // Ops usa service_role; aquí solo protegemos básicamente
  if (!state.user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { state, dispatch } = useAppStore();

  // Inicializar sesión al montar
  useEffect(() => {
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        try {
          const [user, company, modules] = await Promise.all([
            getCurrentUser(),
            getCurrentCompany(),
            getCompanyModules(),
          ]);
          dispatch({ type: 'SET_USER', payload: user });
          dispatch({ type: 'SET_COMPANY', payload: company });
          dispatch({ type: 'SET_MODULES', payload: modules });
        } catch {
          dispatch({ type: 'RESET' });
        }
      }

      dispatch({ type: 'SET_LOADING', payload: false });
    };

    initSession();

    // Escuchar cambios de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          const [user, company, modules] = await Promise.all([
            getCurrentUser(),
            getCurrentCompany(),
            getCompanyModules(),
          ]);
          dispatch({ type: 'SET_USER', payload: user });
          dispatch({ type: 'SET_COMPANY', payload: company });
          dispatch({ type: 'SET_MODULES', payload: modules });
        } else if (event === 'SIGNED_OUT') {
          dispatch({ type: 'RESET' });
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [dispatch]);

  if (state.isLoading) return <LoadingScreen />;

  return (
    <BrowserRouter>
      <Routes>
        {/* ─── Rutas Públicas ─── */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/servicios" element={<Services />} />
          <Route path="/precios" element={<Pricing />} />
          <Route path="/nosotros" element={<About />} />
          <Route path="/contacto" element={<Contact />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/checkout/exito" element={<CheckoutSuccess />} />
          <Route path="/login" element={<Login />} />
        </Route>

        {/* ─── Portal (autenticado) ─── */}
        <Route
          path="/portal"
          element={
            <PrivateRoute>
              <PortalLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<PortalHome />} />
          <Route path="configuracion" element={<CompanySettings />} />
          <Route path="modulos/:moduleId" element={<ModuleWorkspace />} />
          <Route path="modulos/costos/*" element={<CostosModule />} />
          <Route path="modulos/inventarios/*" element={<InventariosModule />} />
          <Route path="modulos/ventas/*" element={<VentasModule />} />
        </Route>

        {/* ─── Consola interna Ops ─── */}
        <Route
          path="/ops"
          element={
            <OpsRoute>
              <OpsConsole />
            </OpsRoute>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
