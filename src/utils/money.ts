// src/utils/money.ts
// Todas las operaciones financieras pasan por aquí.
// big.js garantiza precisión decimal exacta (sin errores de punto flotante).
import Big from 'big.js';
import { Currency } from '../types';

Big.DP = 4;
Big.RM = 1; // ROUND_HALF_UP — estándar financiero

export function convertUSDtoHNL(amountUSD: number | string, rate: number | string): string {
  return new Big(amountUSD).times(new Big(rate)).toFixed(2);
}

export function convertHNLtoUSD(amountHNL: number | string, rate: number | string): string {
  return new Big(amountHNL).div(new Big(rate)).toFixed(2);
}

export function calcLateFee(amount: number | string, percentRate: number | string): string {
  return new Big(amount).times(new Big(percentRate)).div(100).toFixed(2);
}

export function addMoney(a: number | string, b: number | string): string {
  return new Big(a).plus(new Big(b)).toFixed(2);
}

export function subtractMoney(a: number | string, b: number | string): string {
  return new Big(a).minus(new Big(b)).toFixed(2);
}

export function formatMoney(amount: number | string, currency: Currency): string {
  const num = parseFloat(new Big(amount).toFixed(2));
  const formatted = num.toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'HNL' ? `L ${formatted}` : `$ ${formatted}`;
}

export function isValidAmount(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  try {
    return new Big(String(value)).gte(0);
  } catch {
    return false;
  }
}

export function isGreaterOrEqual(a: number | string, b: number | string): boolean {
  return new Big(a).gte(new Big(b));
}

export function toNumber(val: number | string | { toString(): string }): number {
  return parseFloat(new Big(val.toString()).toFixed(4));
}
