// src/config/env.ts
import dotenv from 'dotenv';
dotenv.config();

interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  APP_URL: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_WHATSAPP_FROM: string;
  EXCHANGE_RATE_API_KEY: string;
  DEFAULT_CURRENCY: 'HNL' | 'USD';
  DEFAULT_TIMEZONE: string;
}

function validateEnv(): EnvConfig {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_WHATSAPP_FROM',
    'EXCHANGE_RATE_API_KEY',
    'APP_URL',
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `\n❌ Variables de entorno faltantes:\n` +
      missing.map((k) => `   → ${k}`).join('\n') +
      `\n\nCopiá .env.example a .env y completá los valores.\n`
    );
  }

  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '3000', 10),
    APP_URL: process.env.APP_URL!,
    DATABASE_URL: process.env.DATABASE_URL!,
    JWT_SECRET: process.env.JWT_SECRET!,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID!,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN!,
    TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM!,
    EXCHANGE_RATE_API_KEY: process.env.EXCHANGE_RATE_API_KEY!,
    DEFAULT_CURRENCY: (process.env.DEFAULT_CURRENCY as 'HNL' | 'USD') || 'HNL',
    DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE || 'America/Tegucigalpa',
  };
}

export const env = validateEnv();
