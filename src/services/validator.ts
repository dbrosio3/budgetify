import { ValidationError } from "../utils/errors";
import { TransactionResult, TransactionData, ConfigData } from "../types";
import { Logger } from "../utils/logger";

/**
 * Parses a date string in various formats (DD/MM/YYYY or ISO format) to a Date object
 * @param fecha - Date string in DD/MM/YYYY format or ISO format (e.g., 2026-01-03T03:00:00.000Z)
 * @returns Date object or null if parsing fails
 */
export function parseDate(fecha: string): Date | null {
  if (!fecha || typeof fecha !== "string") {
    return null;
  }

  // Try ISO format first (e.g., 2026-01-03T03:00:00.000Z or 2026-01-03)
  const isoMatch = fecha.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?/);
  if (isoMatch) {
    const año = parseInt(isoMatch[1], 10);
    const mes = parseInt(isoMatch[2], 10);
    const dia = parseInt(isoMatch[3], 10);
    if (!isNaN(año) && !isNaN(mes) && !isNaN(dia)) {
      return new Date(año, mes - 1, dia);
    }
  }

  // Try DD/MM/YYYY format
  const partes = fecha.split("/");
  if (partes.length === 3) {
    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10);
    const año = parseInt(partes[2], 10);
    if (!isNaN(dia) && !isNaN(mes) && !isNaN(año)) {
      return new Date(año, mes - 1, dia);
    }
  }

  return null;
}

export class Validator {
  static validateGasto(data: TransactionData): void {
    if (!data.descripcion || data.descripcion.trim() === "") {
      throw new ValidationError("El campo 'descripcion' es requerido para un GASTO");
    }
    if (!data.monto || isNaN(data.monto) || data.monto <= 0) {
      throw new ValidationError(
        `El campo 'monto' debe ser un número positivo. Valor recibido: ${data.monto}`
      );
    }
    if (!data.cuenta || data.cuenta.trim() === "") {
      throw new ValidationError("El campo 'cuenta' es requerido para un GASTO");
    }
    if (!data.macro_categoria || data.macro_categoria.trim() === "") {
      throw new ValidationError("El campo 'macro_categoria' es requerido para un GASTO");
    }
    if (!data.subcategoria || data.subcategoria.trim() === "") {
      throw new ValidationError("El campo 'subcategoria' es requerido para un GASTO");
    }

    // Validate date
    this.validateDate(data.fecha);

    // Validate currency
    const monedasValidas = ["ARS", "USD", "EUR"];
    const moneda = data.moneda || "ARS";
    if (!monedasValidas.includes(moneda)) {
      throw new ValidationError(
        `Moneda inválida. Valores permitidos: ARS, USD, EUR. Recibido: ${moneda}`
      );
    }

    // Validate installments
    const cuotas = parseInt(String(data.cuotas || 1), 10);
    const nCuota = parseInt(String(data.n_cuota || 1), 10);
    if (isNaN(cuotas) || cuotas < 1) {
      throw new ValidationError(`El número de cuotas debe ser mayor a 0. Recibido: ${data.cuotas}`);
    }
    if (isNaN(nCuota) || nCuota < 1 || nCuota > cuotas) {
      throw new ValidationError(
        `El número de cuota debe estar entre 1 y ${cuotas}. Recibido: ${data.n_cuota}`
      );
    }
  }

  static validateIngreso(data: TransactionData): void {
    if (!data.fuente && !data.descripcion) {
      throw new ValidationError("El campo 'fuente' o 'descripcion' es requerido para un INGRESO");
    }
    if (!data.monto || isNaN(data.monto) || data.monto <= 0) {
      throw new ValidationError(
        `El campo 'monto' debe ser un número positivo. Valor recibido: ${data.monto}`
      );
    }
    if (!data.cuenta || data.cuenta.trim() === "") {
      throw new ValidationError("El campo 'cuenta' es requerido para un INGRESO");
    }

    this.validateDate(data.fecha);

    const monedasValidas = ["ARS", "USD", "EUR"];
    const monedaIng = data.moneda || "ARS";
    if (!monedasValidas.includes(monedaIng)) {
      throw new ValidationError(
        `Moneda inválida. Valores permitidos: ARS, USD, EUR. Recibido: ${monedaIng}`
      );
    }

    const cotizacion = parseFloat(String(data.cotizacion || 1));
    if (isNaN(cotizacion) || cotizacion <= 0) {
      throw new ValidationError(
        `La cotización debe ser un número positivo. Valor recibido: ${data.cotizacion}`
      );
    }
  }

  static validateTransferencia(data: TransactionData): void {
    if (!data.origen || data.origen.trim() === "") {
      throw new ValidationError("El campo 'origen' es requerido para una TRANSFERENCIA");
    }
    if (!data.destino || data.destino.trim() === "") {
      throw new ValidationError("El campo 'destino' es requerido para una TRANSFERENCIA");
    }
    if (!data.monto_salida || isNaN(data.monto_salida) || data.monto_salida <= 0) {
      throw new ValidationError(
        `El campo 'monto_salida' debe ser un número positivo. Valor recibido: ${data.monto_salida}`
      );
    }
    if (!data.monto_entrada || isNaN(data.monto_entrada) || data.monto_entrada <= 0) {
      throw new ValidationError(
        `El campo 'monto_entrada' debe ser un número positivo. Valor recibido: ${data.monto_entrada}`
      );
    }

    this.validateDate(data.fecha);
  }

  static validateTransaction(result: TransactionResult): void {
    if (result.tipo === "GASTO") {
      this.validateGasto(result.datos);
    } else if (result.tipo === "INGRESO") {
      this.validateIngreso(result.datos);
    } else if (result.tipo === "TRANSFERENCIA") {
      this.validateTransferencia(result.datos);
    } else {
      // TypeScript should never reach here, but handle it for runtime safety
      const tipo: string = result.tipo;
      throw new ValidationError(`Tipo de operación desconocido: ${tipo}`);
    }
  }

  private static validateDate(fecha?: string | Date): void {
    if (!fecha) return; // Optional field

    let date: Date;
    if (typeof fecha === "string") {
      const parsedDate = parseDate(fecha);
      if (!parsedDate) {
        throw new ValidationError(
          `Formato de fecha inválido. Esperado: DD/MM/YYYY o formato ISO (YYYY-MM-DD). Recibido: ${fecha}`
        );
      }
      date = parsedDate;
    } else {
      date = fecha;
    }

    const fechaMin = new Date(2020, 0, 1);
    const fechaMax = new Date();
    if (date < fechaMin || date > fechaMax) {
      throw new ValidationError(
        `La fecha debe estar entre 2020 y hoy. Fecha recibida: ${date.toLocaleDateString("es-AR")}`
      );
    }
  }
}

import { MONEDA_OPTIONS, SPLIT_OPTIONS } from "../types";

/**
 * Helper to extract text without emoji
 */
function extractTextWithoutEmoji(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "")
    .trim();
}

/**
 * Maps a 1-indexed number to a value from an options array.
 * Returns the value at index (num - 1), or the first option as fallback.
 */
function mapIndexToValue<T extends string>(
  index: number | string | undefined,
  options: readonly T[]
): T {
  if (options.length === 0) throw new Error("Options array cannot be empty");

  const num = typeof index === "string" ? parseInt(index, 10) : index;

  if (num === undefined || num === null || isNaN(num) || num < 1 || num > options.length) {
    return options[0]; // Fallback to first option
  }

  return options[num - 1];
}

/**
 * Maps numbered AI response fields to actual string values.
 * The AI returns indices (1-indexed) for cuenta, macro_categoria, subcategoria, moneda, split.
 * This function converts those indices back to the actual string values.
 *
 * @param result - The transaction result from AI (with numbered fields)
 * @param config - The config data containing valid accounts, categories, etc.
 * @returns The mapped transaction result with string values
 */
export function mapTransactionIndices(
  result: TransactionResult,
  config: ConfigData
): TransactionResult {
  const datos = { ...result.datos };
  const macroKeys = Object.keys(config.categoriasMap);

  // Map cuenta (account) - for GASTO and INGRESO
  if (result.tipo === "GASTO" || result.tipo === "INGRESO") {
    const cuentaIndex = datos.cuenta as unknown as number;
    datos.cuenta = mapIndexToValue(cuentaIndex, config.cuentas);
    Logger.log(`Mapped cuenta: ${cuentaIndex} → "${datos.cuenta}"`);
  }

  // Map macro_categoria and subcategoria - for GASTO
  if (result.tipo === "GASTO") {
    const macroIndex = datos.macro_categoria as unknown as number;
    datos.macro_categoria = mapIndexToValue(macroIndex, macroKeys);
    Logger.log(`Mapped macro_categoria: ${macroIndex} → "${datos.macro_categoria}"`);

    // Get subcategories for the selected macro
    const validSubcategorias = config.categoriasMap[datos.macro_categoria] || [];
    const subcatIndex = datos.subcategoria as unknown as number;
    const rawSubcat = mapIndexToValue(subcatIndex, validSubcategorias);
    datos.subcategoria = extractTextWithoutEmoji(rawSubcat);
    Logger.log(`Mapped subcategoria: ${subcatIndex} → "${datos.subcategoria}"`);

    // Map moneda
    const monedaIndex = datos.moneda as unknown as number;
    datos.moneda = mapIndexToValue(monedaIndex, MONEDA_OPTIONS);
    Logger.log(`Mapped moneda: ${monedaIndex} → "${datos.moneda}"`);

    // Map split
    const splitIndex = datos.split as unknown as number;
    datos.split = mapIndexToValue(splitIndex, SPLIT_OPTIONS);
    Logger.log(`Mapped split: ${splitIndex} → "${datos.split}"`);
  }

  // Map INGRESO moneda
  if (result.tipo === "INGRESO") {
    const monedaIndex = datos.moneda as unknown as number;
    datos.moneda = mapIndexToValue(monedaIndex, MONEDA_OPTIONS);
    Logger.log(`Mapped moneda: ${monedaIndex} → "${datos.moneda}"`);
  }

  // Map TRANSFERENCIA origen/destino
  if (result.tipo === "TRANSFERENCIA") {
    const origenIndex = datos.origen as unknown as number;
    if (origenIndex !== undefined) {
      datos.origen = mapIndexToValue(origenIndex, config.cuentas);
      Logger.log(`Mapped origen: ${origenIndex} → "${datos.origen}"`);
    }

    const destinoIndex = datos.destino as unknown as number;
    if (destinoIndex !== undefined) {
      datos.destino = mapIndexToValue(destinoIndex, config.cuentas);
      Logger.log(`Mapped destino: ${destinoIndex} → "${datos.destino}"`);
    }
  }

  return {
    ...result,
    datos,
  };
}
