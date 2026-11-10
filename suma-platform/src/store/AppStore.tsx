// ============================================================
// SUMA Platform — Estado global (AppStore)
// ============================================================
import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { Company, CompanyUser, CompanyModule } from '@/types/domain';

interface AppState {
  user: CompanyUser | null;
  company: Company | null;
  modules: CompanyModule[];
  theme: 'light' | 'dark';
  isLoading: boolean;
  error: string | null;
}

type AppAction =
  | { type: 'SET_USER'; payload: CompanyUser | null }
  | { type: 'SET_COMPANY'; payload: Company | null }
  | { type: 'SET_MODULES'; payload: CompanyModule[] }
  | { type: 'SET_THEME'; payload: 'light' | 'dark' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET' };

const initialState: AppState = {
  user: null,
  company: null,
  modules: [],
  theme: (localStorage.getItem('suma-theme') as 'light' | 'dark') ?? 'light',
  isLoading: true,
  error: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_COMPANY':
      return { ...state, company: action.payload };
    case 'SET_MODULES':
      return { ...state, modules: action.payload };
    case 'SET_THEME':
      localStorage.setItem('suma-theme', action.payload);
      if (action.payload === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return { ...state, theme: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'RESET':
      return { ...initialState, theme: state.theme, isLoading: false };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Aplicar tema inicial
  if (state.theme === 'dark') {
    document.documentElement.classList.add('dark');
  }

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppStore debe usarse dentro de <AppProvider>');
  return ctx;
}

export function useIsAdmin() {
  const { state } = useAppStore();
  return state.user?.role === 'owner' || state.user?.role === 'admin';
}

export function useHasModule(moduleId: string) {
  const { state } = useAppStore();
  return state.modules.some(
    (m) => m.module_id === moduleId && (m.status === 'activo' || m.status === 'en_prueba')
  );
}
