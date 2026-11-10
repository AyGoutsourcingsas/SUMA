// ============================================================
// SUMA Platform — OpsConsole (Consola interna de Operaciones de SUMA)
// ============================================================
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, Search, Filter, RefreshCw, CheckCircle,
  XCircle, Clock, Eye, AlertCircle, Building2, CreditCard,
  Layers, ArrowLeft
} from 'lucide-react';
import {
  Button, Card, CardHeader, CardBody, Badge, Modal,
  Alert, StatCard, Spinner
} from '@/components/ui';
import { supabase } from '@/services/supabase';
import { formatCOP, APP_STATUS_LABELS } from '@/config/brand';
import type { Application, ApplicationStatus } from '@/types/domain';

const ALL_STATUSES: ApplicationStatus[] = [
  'enviada',
  'pago_pendiente',
  'pago_recibido',
  'en_revision',
  'requiere_correccion',
  'aprobada',
  'rechazada',
  'cuenta_creada',
  'activa',
];

const STATUS_BADGES: Record<ApplicationStatus, 'blue' | 'yellow' | 'green' | 'red' | 'purple' | 'gray'> = {
  borrador: 'gray',
  enviada: 'blue',
  pago_pendiente: 'yellow',
  pago_recibido: 'green',
  en_revision: 'purple',
  requiere_correccion: 'yellow',
  aprobada: 'green',
  rechazada: 'red',
  cuenta_creada: 'purple',
  activa: 'green',
};

export default function OpsConsole() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [updating, setUpdating] = useState(false);

  const loadApplications = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setApplications(data || []);
    } catch {
      // Mock para prueba local
      setApplications([
        {
          id: 'SUMA-2026-8942',
          submitted_at: new Date().toISOString(),
          company_name: 'MELTÉ WAX S.A.S.',
          commercial_name: 'MELTÉ',
          nit: '901.452.128-4',
          city: 'Bogotá',
          contact_name: 'Alan Giraldo',
          contact_email: 'meltewaxm@gmail.com',
          contact_phone: '3054281157',
          modules: ['costos', 'inventarios', 'ventas'],
          period: 'mensual',
          total_cop: 227000,
          payment_status: 'aprobado',
          payment_gateway: 'wompi',
          status: 'pago_recibido',
          documents: [],
          history: [
            { timestamp: new Date().toISOString(), event: 'Solicitud creada con Wompi' },
            { timestamp: new Date().toISOString(), event: 'Pago de $227.000 aprobado' }
          ],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  const handleUpdateStatus = async (newStatus: ApplicationStatus) => {
    if (!selectedApp) return;
    setUpdating(true);
    try {
      const historyEntry = {
        timestamp: new Date().toISOString(),
        event: `Estado cambiado a: ${APP_STATUS_LABELS[newStatus] || newStatus}`,
      };

      const updatedHistory = [...(selectedApp.history || []), historyEntry];

      const { error } = await supabase
        .from('applications')
        .update({
          status: newStatus,
          history: updatedHistory,
        })
        .eq('id', selectedApp.id);

      if (error) throw error;

      setSelectedApp({
        ...selectedApp,
        status: newStatus,
        history: updatedHistory,
      });

      loadApplications();
    } catch (err: any) {
      alert('Error al actualizar estado: ' + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const filtered = applications.filter((app) => {
    const term = search.toLowerCase();
    const matchSearch =
      app.id.toLowerCase().includes(term) ||
      app.company_name.toLowerCase().includes(term) ||
      (app.commercial_name || '').toLowerCase().includes(term) ||
      app.nit.toLowerCase().includes(term) ||
      app.contact_email.toLowerCase().includes(term);

    const matchStatus = !statusFilter || app.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalCOP = applications
    .filter((a) => a.payment_status === 'aprobado')
    .reduce((acc, a) => acc + (a.total_cop || 0), 0);

  const pendingApps = applications.filter(
    (a) => a.status === 'enviada' || a.status === 'en_revision' || a.status === 'pago_recibido'
  ).length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Top bar de Ops */}
      <header className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Link to="/portal" className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center font-bold text-sm">
            OPS
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">SUMA Ops Console</h1>
            <p className="text-xs text-gray-400">Panel interno de operaciones y activación</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={loadApplications} leftIcon={<RefreshCw className="w-4 h-4" />}>
          Recargar
        </Button>
      </header>

      <div className="page-container py-8">
        {/* Metricas Ops */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard
            title="Solicitudes Pendientes"
            value={pendingApps}
            subtitle="Por revisar o activar"
            icon={<Clock className="w-5 h-5" />}
            color="orange"
          />
          <StatCard
            title="Total Solicitudes"
            value={applications.length}
            subtitle="Histórico de clientes"
            icon={<Building2 className="w-5 h-5" />}
            color="blue"
          />
          <StatCard
            title="Recaudación Aprobada"
            value={formatCOP(totalCOP)}
            subtitle="Vía pasarela Wompi"
            icon={<CreditCard className="w-5 h-5" />}
            color="green"
          />
        </div>

        {/* Barra de Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por ID, empresa, NIT o correo..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
          >
            <option value="">Todos los estados</option>
            {ALL_STATUSES.map((st) => (
              <option key={st} value={st}>
                {APP_STATUS_LABELS[st] || st}
              </option>
            ))}
          </select>
        </div>

        {/* Tabla de Aplicaciones */}
        <Card>
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No se encontraron solicitudes con los filtros aplicados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="suma-table">
                <thead>
                  <tr>
                    <th>ID Solicitud</th>
                    <th>Empresa & NIT</th>
                    <th>Contacto</th>
                    <th>Módulos</th>
                    <th>Total COP</th>
                    <th>Pago</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((app) => (
                    <tr key={app.id}>
                      <td className="font-mono text-xs font-bold text-suma-600 dark:text-suma-400">
                        {app.id}
                      </td>
                      <td>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {app.commercial_name || app.company_name}
                        </p>
                        <p className="text-xs text-gray-500 font-mono">NIT: {app.nit}</p>
                      </td>
                      <td>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">{app.contact_name}</p>
                        <p className="text-xs text-gray-500">{app.contact_email}</p>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {app.modules.map((m) => (
                            <span key={m} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-[10px] rounded uppercase font-semibold text-gray-700 dark:text-gray-300">
                              {m}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCOP(app.total_cop || 0)}
                      </td>
                      <td>
                        <Badge variant={app.payment_status === 'aprobado' ? 'green' : 'yellow'}>
                          {app.payment_status || 'pendiente'}
                        </Badge>
                      </td>
                      <td>
                        <Badge variant={STATUS_BADGES[app.status] || 'gray'}>
                          {APP_STATUS_LABELS[app.status] || app.status}
                        </Badge>
                      </td>
                      <td>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => setSelectedApp(app)}
                          leftIcon={<Eye className="w-3.5 h-3.5" />}
                        >
                          Gestionar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Modal Detalle & Cambio de Estado */}
      <Modal
        isOpen={!!selectedApp}
        onClose={() => setSelectedApp(null)}
        title={`Solicitud ${selectedApp?.id}`}
        size="xl"
      >
        {selectedApp && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl text-sm">
              <div>
                <p className="text-xs text-gray-500">Razón Social</p>
                <p className="font-semibold text-gray-900 dark:text-white">{selectedApp.company_name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Nombre Comercial</p>
                <p className="font-semibold text-gray-900 dark:text-white">{selectedApp.commercial_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">NIT</p>
                <p className="font-mono text-gray-900 dark:text-white">{selectedApp.nit}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Ciudad</p>
                <p className="text-gray-900 dark:text-white">{selectedApp.city || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Contacto</p>
                <p className="text-gray-900 dark:text-white">{selectedApp.contact_name} ({selectedApp.contact_phone || 'Sin tel'})</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Correo Electrónico</p>
                <p className="text-gray-900 dark:text-white">{selectedApp.contact_email}</p>
              </div>
            </div>

            {/* Módulos y cobro */}
            <div className="border border-gray-200 dark:border-gray-800 p-4 rounded-xl flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-500 font-semibold mb-1">Módulos Solicitados</p>
                <div className="flex gap-2">
                  {selectedApp.modules.map((m) => (
                    <Badge key={m} variant="blue">{m.toUpperCase()}</Badge>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 font-semibold">Total a Cobrar</p>
                <p className="text-xl font-mono font-bold text-gray-900 dark:text-white">
                  {formatCOP(selectedApp.total_cop)}
                </p>
              </div>
            </div>

            {/* Cambio de Estado */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Actualizar Estado de la Solicitud
              </label>
              <div className="flex flex-wrap gap-2">
                {ALL_STATUSES.map((st) => (
                  <button
                    key={st}
                    disabled={updating || selectedApp.status === st}
                    onClick={() => handleUpdateStatus(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      selectedApp.status === st
                        ? 'bg-suma-600 text-white ring-2 ring-suma-300'
                        : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {APP_STATUS_LABELS[st] || st}
                  </button>
                ))}
              </div>
            </div>

            {/* Historial */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Historial de Eventos
              </h4>
              <div className="space-y-2 max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-xs">
                {selectedApp.history && selectedApp.history.length > 0 ? (
                  selectedApp.history.map((h, i) => (
                    <div key={i} className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>• {h.event}</span>
                      <span className="font-mono text-[10px] text-gray-400">
                        {new Date(h.timestamp).toLocaleTimeString('es-CO')}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400">Sin eventos registrados.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setSelectedApp(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
