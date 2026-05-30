// src/utils/money.ts
// Operaciones financieras con precisión decimal usando aritmética de enteros.
// Evitamos big.js para no depender de tipos externos en producción.
import { Currency } from '../types';

// Convierte un valor a centavos (entero) para operar sin punto flotante
function toCents(val: number | string): bigint {
  const str = parseFloat(String(val)).toFixed(4);
  const [int, dec = '0000'] = str.split('.');
  return BigInt(int) * 10000n + BigInt(dec.padEnd(4, '0').slice(0, 4));
}

function fromCents(cents: bigint, decimals = 2): string {
  const divisor = 10n ** BigInt(decimals + 2); // 4 decimales internos → 2 externos
  const abs = cents < 0n ? -cents : cents;
  const sign = cents < 0n ? '-' : '';
  const intPart = abs / divisor;
  const remainder = abs % divisor;
  const decPart = remainder.toString().padStart(decimals + 2, '0').slice(0, decimals);
  return `${sign}${intPart}.${decPart}`;
}

export function convertUSDtoHNL(amountUSD: number | string, rate: number | string): string {
  const a = toCents(amountUSD);
  const r = toCents(rate);
  return fromCents(a * r);
}

export function convertHNLtoUSD(amountHNL: number | string, rate: number | string): string {
  const a = toCents(amountHNL);
  const r = toCents(rate);
  // Dividimos con 8 decimales de precisión interna
  return fromCents((a * 10000n * 10000n) / r);
}

export function calcLateFee(amount: number | string, percentRate: number | string): string {
  const a = toCents(amount);
  const p = toCents(percentRate);
  return fromCents((a * p) / 1000000n); // /100 en escala de centavos
}

export function addMoney(a: number | string, b: number | string): string {
  return fromCents(toCents(a) + toCents(b));
}

export function subtractMoney(a: number | string, b: number | string): string {
  return fromCents(toCents(a) - toCents(b));
}

export function formatMoney(amount: number | string, currency: Currency): string {
  const num = parseFloat(String(amount)) || 0;
  const formatted = num.toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'HNL' ? `L ${formatted}` : `$ ${formatted}`;
}

export function isValidAmount(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  const n = parseFloat(String(value));
  return !isNaN(n) && n >= 0;
}

export function isGreaterOrEqual(a: number | string, b: number | string): boolean {
  return parseFloat(String(a)) >= parseFloat(String(b));
}

export function toNumber(val: number | string | { toString(): string }): number {
  return parseFloat(parseFloat(String(val)).toFixed(4));
}
