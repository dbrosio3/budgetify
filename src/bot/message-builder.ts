import { TransactionResult, ConversationContext } from "../types";

/**
 * Escapes special Markdown characters to prevent Telegram parsing errors.
 * For basic Markdown mode, these characters need escaping: _ * ` [
 */
function escapeMarkdown(text: string | undefined): string {
  if (!text) return "";
  return text.replace(/([_*`[])/g, "\\$1");
}

export class MessageBuilder {
  static buildConfirmationMessage(data: TransactionResult): string {
    let mensaje = "";
    const d = data.datos;

    // Escape markdown in AI-generated fields to prevent Telegram parsing errors
    const alertaConfianza = data.alerta ? `\n\n${escapeMarkdown(data.alerta)}` : "";
    const descripcion = escapeMarkdown(d.descripcion);
    const notas = escapeMarkdown(d.notas);
    const fuente = escapeMarkdown(d.fuente || d.descripcion);

    if (data.tipo === "GASTO") {
      mensaje =
        `🤔 *¿Confirmás este gasto?*\n\n` +
        `📝 *Descripción:* ${descripcion}\n` +
        `💵 *Monto:* $${d.monto} ${d.moneda || "ARS"}\n` +
        `📅 *Fecha:* ${d.fecha || "Hoy"}\n` +
        `🏦 *Cuenta:* ${d.cuenta}\n` +
        `🏷️ *Categoría:* ${d.macro_categoria}\n` +
        `🔖 *Subcategoría:* ${d.subcategoria}\n` +
        `🔄 *Split:* ${d.split || "Solo mío"}` +
        (d.cuotas && d.cuotas > 1 ? `\n💳 *Cuotas:* ${d.cuotas} (cuota ${d.n_cuota || 1})` : "") +
        (notas ? `\n📋 *Notas:* ${notas}` : "") +
        alertaConfianza;
    } else if (data.tipo === "INGRESO") {
      mensaje =
        `🤔 *¿Confirmás este ingreso?*\n\n` +
        `💰 *Fuente:* ${fuente}\n` +
        `💵 *Monto:* $${d.monto} ${d.moneda || "ARS"}\n` +
        `📅 *Fecha:* ${d.fecha || "Hoy"}\n` +
        `🏦 *Cuenta:* ${d.cuenta}` +
        (notas ? `\n📋 *Notas:* ${notas}` : "") +
        alertaConfianza;
    } else if (data.tipo === "TRANSFERENCIA") {
      mensaje =
        `🤔 *¿Confirmás esta transferencia?*\n\n` +
        `📤 *Origen:* ${d.origen} (-$${d.monto_salida})\n` +
        `📥 *Destino:* ${d.destino} (+$${d.monto_entrada})` +
        (d.comision ? `\n💸 *Comisión:* $${d.comision}` : "") +
        alertaConfianza;
    }

    // Add context indicator if using context
    if (data.usa_contexto) {
      mensaje += `\n\n💭 *Usando contexto del último registro confirmado*`;
    }

    return mensaje;
  }

  static buildContextSummary(context: ConversationContext): string {
    const d = context.datos;
    if (context.tipo === "GASTO") {
      return (
        `📝 ${d.descripcion} - $${d.monto}\n` +
        `🏷️ ${d.macro_categoria} → ${d.subcategoria}\n` +
        `📅 ${d.fecha || "Hoy"}\n` +
        `🏦 ${d.cuenta}`
      );
    } else if (context.tipo === "INGRESO") {
      return `💰 ${d.fuente || d.descripcion} - $${d.monto}\n📅 ${d.fecha || "Hoy"}\n🏦 ${d.cuenta}`;
    } else {
      return `🔄 ${d.origen} → ${d.destino}\n📅 ${d.fecha || "Hoy"}`;
    }
  }
}
