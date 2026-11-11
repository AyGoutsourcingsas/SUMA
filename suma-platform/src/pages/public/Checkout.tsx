// ============================================================
// SUMA Platform — Checkout (Wompi)
// ============================================================
import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CreditCard, Building2, ChevronRight } from 'lucide-react';
import { Button, Field, Card, CardBody, CardHeader } from '@/components/ui';
import { MODULES_CONFIG, formatCOP } from '@/config/brand';

export default function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const moduleIds = (params.get('modulos') ?? '').split(',').filter(Boolean);
  const period = (params.get('periodo') ?? 'mensual') as 'mensual' | 'trimestral' | 'anual';

  const [step, setStep] = useState<'empresa' | 'pago'>('empresa');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    company_name: '',
    commercial_name: '',
    nit: '',
    city: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
  });

  const selectedModules = MODULES_CONFIG.filter((m) => moduleIds.includes(m.id));
  const getPrice = (mod: (typeof MODULES_CONFIG)[number]) => {
    if (period === 'mensual') return mod.price_monthly;
    if (period === 'trimestral') return mod.price_quarterly;
    return mod.price_annual;
  };
  const total = selectedModules.reduce((sum, mod) => sum + getPrice(mod), 0);

  const handleEmpresaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('pago');
  };

  const handleWompiPay = async () => {
    setLoading(true);
    try {
      // Crear la solicitud en el backend
      const res = await fetch('/.netlify/functions/create-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          modules: moduleIds,
          period,
          total_cop: total,
          payment_gateway: 'wompi',
        }),
      });
      const { application } = await res.json();

      // Redirigir a Wompi checkout
      const wompiUrl = `https://checkout.wompi.co/p/?public-key=${import.meta.env.VITE_WOMPI_PUBLIC_KEY}&currency=COP&amount-in-cents=${total * 100}&reference=${application.id}&redirect-url=${encodeURIComponent(window.location.origin + '/checkout/exito')}`;
      window.location.href = wompiUrl;
    } catch {
      alert('Error al procesar el pago. Inténtalo de nuevo.');
      setLoading(false);
    }
  };

  if (selectedModules.length === 0) {
    return (
      <div className="page-container text-center py-20">
        <p className="text-gray-500">No seleccionaste ningún módulo.</p>
        <Button className="mt-4" onClick={() => navigate('/precios')}>Ir a precios</Button>
      </div>
    );
  }

  return (
    <div className="page-container max-w-5xl">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Contratación de módulos</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">Completa los datos de tu empresa para activar SUMA.</p>

      {/* Stepper */}
      <div className="flex items-center gap-3 mb-8">
        {(['empresa', 'pago'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step === s || (s === 'empresa' && step === 'pago') ? 'bg-suma-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
              {i + 1}
            </div>
            <span className={`text-sm font-medium ${step === s ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>
              {s === 'empresa' ? 'Datos de empresa' : 'Pago'}
            </span>
            {i < 1 && <ChevronRight className="w-4 h-4 text-gray-400" />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form */}
        <div className="lg:col-span-2">
          {step === 'empresa' ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-suma-600" />
                  <h2 className="font-semibold text-gray-900 dark:text-white">Datos de tu empresa</h2>
                </div>
              </CardHeader>
              <CardBody>
                <form onSubmit={handleEmpresaSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Razón social" required value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="Empresa S.A.S." />
                    <Field label="Nombre comercial" value={form.commercial_name} onChange={(e) => setForm({ ...form, commercial_name: e.target.value })} placeholder="Mi Empresa" />
                    <Field label="NIT" required value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} placeholder="900.000.000-0" />
                    <Field label="Ciudad" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Bogotá" />
                    <Field label="Nombre de contacto" required value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="María García" />
                    <Field label="Correo de contacto" type="email" required value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="contacto@empresa.com" />
                    <Field label="Teléfono" type="tel" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="+57 300 000 0000" />
                  </div>
                  <Button type="submit" size="lg" className="w-full mt-2">
                    Continuar al pago
                  </Button>
                </form>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-suma-600" />
                  <h2 className="font-semibold text-gray-900 dark:text-white">Pago seguro con Wompi</h2>
                </div>
              </CardHeader>
              <CardBody>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 text-center mb-6">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Total a pagar</p>
                  <p className="text-4xl font-bold text-gray-900 dark:text-white">{formatCOP(total)}</p>
                  <p className="text-sm text-gray-500 mt-1">Pago único — período {period}</p>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 text-center">
                  Serás redirigido a la pasarela de pago seguro de Wompi (PSE, tarjeta débito/crédito, Nequi).
                </p>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setStep('empresa')} className="flex-1">
                    Volver
                  </Button>
                  <Button loading={loading} onClick={handleWompiPay} className="flex-1" size="lg">
                    Pagar con Wompi
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        {/* Resumen */}
        <div>
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-900 dark:text-white">Resumen</h2>
            </CardHeader>
            <CardBody className="space-y-3">
              {selectedModules.map((mod) => (
                <div key={mod.id} className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{mod.fullName}</p>
                    <p className="text-xs text-gray-500">{period}</p>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCOP(getPrice(mod))}</span>
                </div>
              ))}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-between">
                <span className="font-bold text-gray-900 dark:text-white">Total</span>
                <span className="font-bold text-suma-600 dark:text-suma-400">{formatCOP(total)}</span>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
