# SUMA — Plataforma SaaS Empresarial Modular

**SUMA** es una plataforma SaaS empresarial modular diseñada específicamente para pymes en Colombia y América Latina.

Las empresas contratan módulos independientes según sus necesidades:
- 👥 **RRHH**: Gestión de personal, contratos y asistencia.
- 📋 **Productividad**: Tableros Kanban, tareas y metas.
- 📚 **Contabilidad**: Plan único de cuentas y reportes financieros.
- 📦 **Inventarios**: Control de stock, compras y costo por unidad base.
- 🧮 **Costos**: Fichas técnicas, cálculo automático de costo por insumo por regla de tres, margen y precio mínimo de venta (PVP). Incluye importador inteligente de Excel/CSV (.xlsx).
- 📈 **Ventas**: Registro de ventas por canales (WhatsApp, B2B, Ferias, etc.), cálculo de rentabilidad y ganancia neta.

---

## 🛠️ Stack Técnico

- **Frontend**: React + TypeScript + Vite
- **Estilos**: Tailwind CSS (soporte tema claro y oscuro)
- **Backend / BaaS**: Supabase (PostgreSQL, Auth, RLS multi-tenant estricto por `company_id`)
- **Pasarela de Pagos**: Wompi (COP). Integrado con checkout y webhooks validados con firma SHA-256.
- **Despliegue**: Netlify + Netlify Functions
- **Iconografía**: Lucide React
- **Idioma**: Español colombiano (COP)

---

## 📂 Estructura del Proyecto

```
suma-platform/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── eslint.config.js
├── netlify.toml
├── .env.example
├── netlify/
│   └── functions/
│       ├── create-application.ts
│       └── wompi-webhook.ts
├── public/
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  # Esquema completo + RLS + Triggers
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── components/
    │   ├── layout/       # PublicLayout, PortalLayout, etc.
    │   ├── ui/           # Button, Card, Modal, Field, Badge, StatCard
    │   └── costos/       # ExcelImporterModal (parser SheetJS con mapeo)
    ├── config/           # brand.ts (formato COP, fórmulas de costo/margen)
    ├── data/             # mocks.ts (fallback demostrativo)
    ├── pages/
    │   ├── public/       # Home, Services, Pricing, Checkout, Login, etc.
    │   ├── portal/       # PortalHome, CompanySettings, ModuleWorkspace
    │   │   └── modules/  # CostosModule, InventariosModule, VentasModule
    │   └── ops/          # OpsConsole (panel interno de operaciones SUMA)
    ├── services/         # Supabase client, Auth, Data Provider real
    ├── store/            # AppStore (contexto global, tema, sesión)
    └── types/            # domain.ts
```

---

## 🚀 Puesta en Marcha Local

```bash
cd suma-platform
npm install
npm run dev
```

Copia `.env.example` a `.env` y añade tus credenciales de Supabase y Wompi.

---

## 🗄️ Base de Datos (Supabase)

Aplica el archivo de migración ubicado en `supabase/migrations/001_initial_schema.sql` en el SQL Editor de tu proyecto Supabase. Habilita RLS multi-tenant automático para todas las empresas.
