// src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { errorHandler } from './middlewares/error.middleware';
import { registerJobs } from './jobs/notification.job';

// Routers
import authRouter from './modules/auth/auth.routes';
import propertiesRouter from './modules/properties/properties.routes';
import tenantsRouter from './modules/tenants/tenants.routes';
import contractsRouter from './modules/contracts/contracts.routes';
import paymentsRouter from './modules/payments/payments.routes';
import exchangeRatesRouter from './modules/exchange-rates/exchange-rates.routes';

const app = express();

// ─── Seguridad ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: env.NODE_ENV === 'production' ? env.APP_URL : '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Archivos estáticos del frontend ─────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ─── Health check ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Rentify App',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// ─── Rutas de la API ──────────────────────────────────────────────
app.use('/api/auth',           authRouter);
app.use('/api/properties',     propertiesRouter);
app.use('/api/tenants',        tenantsRouter);
app.use('/api/contracts',      contractsRouter);
app.use('/api/payments',       paymentsRouter);
app.use('/api/exchange-rates', exchangeRatesRouter);

// ─── SPA fallback: todas las rutas no-API sirven index.html ──────
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─── Manejo centralizado de errores ──────────────────────────────
app.use(errorHandler);

// ─── Arrancar servidor ────────────────────────────────────────────
const server = app.listen(env.PORT, () => {
  console.log('\n🏠 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   RENTIFY APP — Sistema de Control de Alquileres');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🌐 URL:       http://localhost:${env.PORT}`);
  console.log(`📋 Ambiente:  ${env.NODE_ENV}`);
  console.log(`💰 Moneda:    ${env.DEFAULT_CURRENCY}`);
  console.log(`⏰ Zona:      ${env.DEFAULT_TIMEZONE}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (env.NODE_ENV !== 'test') {
    registerJobs();
  }
});

process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM recibido. Cerrando servidor...');
  server.close(() => process.exit(0));
});

export default app;
