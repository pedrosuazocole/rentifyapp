# 🏠 Rentify App

Sistema de control de alquileres de propiedades para Honduras.  
Backend REST API construido con Node.js + TypeScript + Express + PostgreSQL + Prisma.

---

## ✨ Características

- **Multimoneda HNL / USD** con historial de tipo de cambio diario
- **Motor de mora automático** con días de gracia configurables
- **Notificaciones WhatsApp** vía Twilio (recordatorios, recibos, mora, renovaciones)
- **Recibos PDF** generados automáticamente
- **Cron jobs diarios** para notificaciones y actualización del tipo de cambio
- **Operaciones atómicas** (contratos, pagos) para consistencia total de datos
- **JWT + roles** (ADMIN, OWNER, VIEWER)

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Runtime | Node.js 18+ |
| Lenguaje | TypeScript 5 |
| Framework | Express 4 |
| ORM | Prisma 5 |
| Base de datos | PostgreSQL |
| Precisión financiera | big.js |
| Notificaciones | Twilio WhatsApp SDK |
| PDF | pdfkit |
| Tareas programadas | node-cron |
| Tipo de cambio | ExchangeRate-API |

---

## 🚀 Instalación Local

### Requisitos previos
- Node.js >= 18
- PostgreSQL corriendo localmente o en la nube
- Cuenta Twilio (para WhatsApp)
- API Key de ExchangeRate-API (gratuita)

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/rentify-app.git
cd rentify-app

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 4. Crear la base de datos y aplicar migraciones
npx prisma migrate dev --name init

# 5. Cargar datos iniciales (usuario admin de prueba)
npm run db:seed

# 6. Iniciar en modo desarrollo
npm run dev
```

El servidor estará disponible en: `http://localhost:3000`

---

## 🔑 Credenciales del seed

```
Email:      admin@rentify.hn
Contraseña: Admin1234!
```

---

## 📡 Endpoints de la API

### Autenticación
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/register` | Crear usuario (solo ADMIN) |
| GET | `/api/auth/me` | Perfil del usuario actual |
| PUT | `/api/auth/me` | Actualizar perfil |
| PUT | `/api/auth/change-password` | Cambiar contraseña |

### Propiedades
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/properties` | Listar propiedades |
| GET | `/api/properties/:id` | Ver propiedad |
| POST | `/api/properties` | Crear propiedad |
| PUT | `/api/properties/:id` | Actualizar propiedad |
| DELETE | `/api/properties/:id` | Desactivar propiedad |
| POST | `/api/properties/:id/units` | Agregar unidad |
| PUT | `/api/properties/:id/units/:unitId` | Actualizar unidad |

### Inquilinos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/tenants` | Listar (con búsqueda) |
| GET | `/api/tenants/:id` | Ver inquilino |
| POST | `/api/tenants` | Registrar inquilino |
| PUT | `/api/tenants/:id` | Actualizar inquilino |
| GET | `/api/tenants/:id/payments` | Historial de pagos |

### Contratos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/contracts` | Listar contratos |
| GET | `/api/contracts/expiring` | Por vencer (30 días) |
| GET | `/api/contracts/:id` | Ver contrato |
| POST | `/api/contracts` | Crear contrato |
| POST | `/api/contracts/:id/terminate` | Rescindir contrato |

### Pagos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/payments` | Listar pagos |
| GET | `/api/payments/report` | Reporte financiero |
| GET | `/api/payments/:id/receipt` | Descargar PDF recibo |
| POST | `/api/payments/generate` | Generar pagos del mes |
| POST | `/api/payments/:id/register` | Registrar pago |

### Tipo de Cambio
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/exchange-rates/today` | Tasa de hoy |
| GET | `/api/exchange-rates` | Historial |
| POST | `/api/exchange-rates/fetch` | Forzar actualización (ADMIN) |

---

## ☁️ Despliegue en Railway

1. Creá una cuenta en [railway.app](https://railway.app)
2. Creá un nuevo proyecto → **Deploy from GitHub repo**
3. Conectá tu repositorio de GitHub
4. Agregá un servicio **PostgreSQL** al proyecto
5. En Variables de entorno, copiá todo el contenido de `.env.example` y completá los valores
6. Railway detecta automáticamente el `npm run start` del `package.json`
7. La migración inicial se puede correr desde el panel: `npx prisma migrate deploy`

### Variables requeridas en Railway
```
DATABASE_URL        → (Railway la genera automáticamente con el servicio PostgreSQL)
JWT_SECRET          → Genera con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
APP_URL             → URL pública que Railway asigna a tu servicio
TWILIO_ACCOUNT_SID  → De tu consola de Twilio
TWILIO_AUTH_TOKEN   → De tu consola de Twilio
TWILIO_WHATSAPP_FROM → whatsapp:+14155238886 (sandbox) o tu número aprobado
EXCHANGE_RATE_API_KEY → De exchangerate-api.com (gratuita)
NODE_ENV            → production
```

---

## 🔄 Cron Jobs Automáticos

| Hora | Tarea |
|------|-------|
| 7:00 AM | Actualizar tipo de cambio HNL/USD |
| 8:00 AM | Recordatorios de pago (3 días antes) |
| 8:00 AM | Avisos de mora (1 día post período de gracia) |
| 8:00 AM | Alertas de renovación (30 días antes del fin) |
| 8:00 AM | Marcar pagos vencidos como LATE |

---

## 🔐 Seguridad

- Contraseñas hasheadas con bcrypt (salt rounds: 12)
- JWT con expiración configurable (default: 7 días)
- Helmet para headers de seguridad HTTP
- Validación de inputs con express-validator
- Prepared statements vía Prisma (sin SQL injection)
- Variables sensibles solo en `.env` (nunca en código)

---

## 📄 Licencia

MIT — Desarrollado para Honduras 🇭🇳
