// src/services/exchange-rate.service.ts
//
// Obtiene la tasa de cambio HNL/USD de fuentes públicas que funcionan
// desde Railway (sin bloqueo por datacenter).
//
// FUENTES EN CASCADA:
//  1. Banpaís (banpais.hn/divisas/barradolar.php) — tasa de VENTA real,
//     publicada por el banco. Página HTML simple (sin JavaScript), así
//     que no debería tener el mismo bloqueo por IP de datacenter que
//     sufrieron Ficohsa y el BCH en intentos anteriores. Si Banpaís
//     bloquea a Railway o cambia su página, cae automáticamente a la
//     fuente 2.
//  2. ExchangeRate-API (v6.exchangerate-api.com) — requiere
//     EXCHANGE_RATE_API_KEY en Railway Variables. Da la tasa MEDIA de
//     mercado (no distingue compra/venta), así que se le suma un
//     margen (ver EXCHANGE_RATE_VENTA_SPREAD más abajo) para
//     aproximarla a una venta real mientras Banpaís no esté disponible.
//  3. Frankfurter (api.frankfurter.app) — 100% gratis, sin key, mismo
//     tratamiento de margen que la fuente 2.
//
//  El botón "Editar manualmente" siempre tiene prioridad — usalo
//  cualquier día que el número automático no coincida con el banco.
import axios from 'axios';
import { prisma } from '../config/database';
import { env } from '../config/env';

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; RentifyApp/1.0)',
  'Accept': 'application/json',
};

// Headers tipo navegador real — reduce la chance de que Banpaís bloquee
// la petición por parecer un bot/script.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-HN,es;q=0.9',
};

// Margen que se suma a la tasa media (fuentes 2 y 3) para aproximar la
// tasa de VENTA cuando Banpaís no está disponible.
// Configurable en Railway → Variables → EXCHANGE_RATE_VENTA_SPREAD
function getVentaSpread(): number {
  const raw = process.env.EXCHANGE_RATE_VENTA_SPREAD;
  const parsed = raw ? parseFloat(raw) : NaN;
  return !isNaN(parsed) && parsed >= 0 && parsed <= 2 ? parsed : 0.15;
}

function validar(n: number): boolean {
  return !isNaN(n) && n >= 15 && n <= 50;
}

export class ExchangeRateService {
  /**
   * Scraping de la tasa real de Banpaís desde su página pública de
   * divisas (la misma que usan para el widget embebido en otros sitios).
   * Devuelve { compra, venta } o null si no se pudo extraer.
   */
  static async fetchFromBanpais(): Promise<{ compra: number; venta: number } | null> {
    try {
      const { data: html } = await axios.get<string>(
        'https://www.banpais.hn/divisas/barradolar.php',
        { timeout: 8000, headers: BROWSER_HEADERS, responseType: 'text' }
      );

      // Anclar por el NOMBRE DEL ARCHIVO del ícono (dolar.svg / euro.svg)
      // en vez de la palabra "EURO" como texto — el nombre de archivo es
      // un marcador inequívoco que no puede aparecer antes de tiempo en
      // el <title> o metadatos de la página, a diferencia de la palabra
      // "EURO" suelta.
      const dolarIdx = html.search(/dolar\.svg/i);
      const euroIdx  = html.search(/euro\.svg/i);

      let dolarSection: string;
      if (dolarIdx === -1) {
        // No se encontró el ícono — la página pudo haber cambiado.
        dolarSection = '';
      } else if (euroIdx !== -1 && euroIdx > dolarIdx) {
        // Caso esperado: dólar aparece primero, euro después.
        dolarSection = html.slice(dolarIdx, euroIdx);
      } else if (euroIdx !== -1 && euroIdx < dolarIdx) {
        // Orden invertido en el HTML real — tomar desde el ícono del
        // dólar hasta el final (no debería haber más secciones después).
        dolarSection = html.slice(dolarIdx);
      } else {
        // No se encontró euro.svg — limitar ventana para no barrer toda la página.
        dolarSection = html.slice(dolarIdx, dolarIdx + 1500);
      }

      const compraMatch = dolarSection.match(/Compra[^0-9]{0,25}(\d{2}\.\d{2,4})/i);
      const ventaMatch  = dolarSection.match(/Venta[^0-9]{0,25}(\d{2}\.\d{2,4})/i);

      const compra = compraMatch ? parseFloat(compraMatch[1]) : NaN;
      const venta  = ventaMatch  ? parseFloat(ventaMatch[1])  : NaN;

      // Validación extra: el margen compra-venta del DÓLAR en Honduras es
      // típicamente < 0.5 HNL. El del EURO ronda 4-5 HNL. Si el margen es
      // demasiado grande, es señal de que agarramos los números del euro
      // por error — se descarta en vez de guardar un dato incorrecto.
      const margenRazonable = validar(compra) && validar(venta) && venta >= compra && (venta - compra) <= 1.0;

      if (margenRazonable) {
        return { compra, venta };
      }
      console.warn(`⚠️ Banpaís: no se pudo extraer un valor válido del dólar (compra=${compra}, venta=${venta}).`);
      return null;
    } catch (e) {
      console.warn('⚠️ Banpaís no disponible desde este servidor:', (e as Error).message);
      return null;
    }
  }

  /**
   * Tasa de HOY. Si el registro ya viene de fuente válida, lo devuelve
   * sin volver a consultar. Si viene de una fuente vieja, lo actualiza.
   */
  static async getTodayRate(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.exchangeRate.findUnique({ where: { date: today } });
    const fuentesValidas = ['Banpaís', 'ExchangeRate-API', 'Frankfurter', 'Manual'];
    if (existing && fuentesValidas.includes(existing.source)) {
      return parseFloat(existing.rate.toString());
    }

    return await this.fetchAndSave();
  }

  /**
   * Descarga la tasa actual (Banpaís primero, con respaldo en cascada)
   * y guarda en BD:
   *   - rate       → tasa de VENTA — la que usa todo el sistema.
   *   - rateCompra → tasa de compra (real de Banpaís, o media de mercado
   *                  si se usó una fuente de respaldo), solo informativa.
   */
  static async fetchAndSave(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── Fuente 1: Banpaís (tasa de venta REAL) ──────────────────────
    const banpais = await this.fetchFromBanpais();
    if (banpais) {
      await prisma.exchangeRate.upsert({
        where: { date: today },
        update: { rate: banpais.venta, rateCompra: banpais.compra, source: 'Banpaís' },
        create: { date: today, rate: banpais.venta, rateCompra: banpais.compra, source: 'Banpaís' },
      });
      console.log(`💱 Tasa Banpaís: compra L ${banpais.compra} · venta L ${banpais.venta}`);
      return banpais.venta;
    }

    const spread = getVentaSpread();

    // ── Fuente 2: ExchangeRate-API (respaldo, tasa media + margen) ──
    const apiKey = env.EXCHANGE_RATE_API_KEY?.trim();
    if (apiKey) {
      try {
        const { data } = await axios.get(
          `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`,
          { timeout: 10000, headers: AXIOS_HEADERS }
        );
        const hnl = data?.conversion_rates?.HNL ?? data?.rates?.HNL;
        if (hnl && validar(Number(hnl))) {
          const media = Number(hnl);
          const venta = parseFloat((media + spread).toFixed(4));
          await prisma.exchangeRate.upsert({
            where: { date: today },
            update: { rate: venta, rateCompra: media, source: 'ExchangeRate-API' },
            create: { date: today, rate: venta, rateCompra: media, source: 'ExchangeRate-API' },
          });
          console.log(`💱 Tasa ExchangeRate-API: media L ${media} + spread ${spread} = venta L ${venta}`);
          return venta;
        }
      } catch (e1) {
        console.warn('⚠️ ExchangeRate-API falló:', (e1 as Error).message);
      }
    }

    // ── Fuente 3: Frankfurter (ECB, sin key) ───────────────────────
    try {
      const { data } = await axios.get(
        'https://api.frankfurter.app/latest?from=USD&to=HNL',
        { timeout: 10000, headers: AXIOS_HEADERS }
      );
      const hnl = data?.rates?.HNL;
      if (hnl && validar(Number(hnl))) {
        const media = Number(hnl);
        const venta = parseFloat((media + spread).toFixed(4));
        await prisma.exchangeRate.upsert({
          where: { date: today },
          update: { rate: venta, rateCompra: media, source: 'Frankfurter' },
          create: { date: today, rate: venta, rateCompra: media, source: 'Frankfurter' },
        });
        console.log(`💱 Tasa Frankfurter: media L ${media} + spread ${spread} = venta L ${venta}`);
        return venta;
      }
    } catch (e2) {
      console.warn('⚠️ Frankfurter falló:', (e2 as Error).message);
    }

    // ── Fallback: última tasa en BD ─────────────────────────────────
    const latest = await prisma.exchangeRate.findFirst({ orderBy: { date: 'desc' } });
    if (latest) {
      console.log(`💱 Usando última tasa conocida: L ${latest.rate} (${latest.source})`);
      return parseFloat(latest.rate.toString());
    }

    throw new Error(
      'No se pudo obtener la tasa de cambio. ' +
      'Ingresála manualmente desde Configuración → Tipo de Cambio, ' +
      'o asegurate de tener EXCHANGE_RATE_API_KEY configurada en Railway.'
    );
  }

  /**
   * Tasa de una fecha específica — para fijar la conversión al día
   * en que se emitió la factura o se registró el pago.
   */
  static async getRateForDate(date: Date): Promise<number> {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    const rate = await prisma.exchangeRate.findFirst({
      where: { date: { lte: d } },
      orderBy: { date: 'desc' },
    });

    if (rate) return parseFloat(rate.rate.toString());
    return await this.fetchAndSave();
  }

  /** Historial de tasas con paginación */
  static async getHistory(page = 1, limit = 30) {
    const skip = (page - 1) * limit;
    const [rates, total] = await Promise.all([
      prisma.exchangeRate.findMany({ orderBy: { date: 'desc' }, skip, take: limit }),
      prisma.exchangeRate.count(),
    ]);
    return { rates, total };
  }
}
