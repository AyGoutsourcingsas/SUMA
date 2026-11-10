// ============================================================
// SUMA Platform — Login
// ============================================================
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button, Field, Alert, Logo } from '@/components/ui';
import { signIn } from '@/services/auth';
import { getCurrentUser, getCurrentCompany, getCompanyModules } from '@/services/auth';
import { useAppStore } from '@/store/AppStore';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { dispatch } = useAppStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      const [user, company, modules] = await Promise.all([
        getCurrentUser(),
        getCurrentCompany(),
        getCompanyModules(),
      ]);
      dispatch({ type: 'SET_USER', payload: user });
      dispatch({ type: 'SET_COMPANY', payload: company });
      dispatch({ type: 'SET_MODULES', payload: modules });
      navigate('/portal');
    } catch (err) {
      setError('Correo o contraseña incorrectos. Verifica tus datos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Panel izquierdo — decorativo */}
      <div className="hidden lg:flex lg:w-1/2 hero-gradient items-center justify-center p-12">
        <div className="text-white max-w-md">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-6">
            <span className="text-white font-bold text-3xl">S</span>
          </div>
          <h1 className="text-4xl font-bold mb-4">Bienvenido a SUMA</h1>
          <p className="text-blue-100 text-lg">
            Tu plataforma empresarial modular para gestionar RRHH, Contabilidad,
            Inventarios, Costos y más desde un solo lugar.
          </p>
          <div className="mt-8 space-y-3">
            {['Multi-empresa con RLS', 'Módulos independientes', 'Hecho para Colombia'].map((f) => (
              <div key={f} className="flex items-center gap-3 text-blue-100">
                <div className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-xs">✓</div>
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex items-center justify-center p-6 bg-white dark:bg-gray-950">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8 lg:hidden">
            <Logo size="lg" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Ingresa a tu cuenta</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            ¿Sin cuenta?{' '}
            <Link to="/precios" className="text-suma-600 dark:text-suma-400 hover:underline font-medium">
              Contratar módulos
            </Link>
          </p>

          {error && <Alert type="error" className="mb-4">{error}</Alert>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Field
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.com"
              required
              autoComplete="email"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Contraseña <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-suma-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" className="text-sm text-suma-600 hover:underline">
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <Button type="submit" loading={loading} className="w-full" size="lg" leftIcon={<LogIn className="w-4 h-4" />}>
              Ingresar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
