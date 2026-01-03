import { TransactionResult, ConversationContext } from "../types";

export class MessageBuilder {
  static buildConfirmationMessage(data: TransactionResult): string {
    let mensaje = "";
    const d = data.datos;

    // Show confidence alert if exists
    const alertaConfianza = data.alerta ? `\n\n${data.alerta}` : "";

    if (data.tipo === "GASTO") {
      mensaje =
        `🤔 *¿Confirmás este gasto?*\n\n` +
        `📝 *Descripción:* ${d.descripcion}\n` +
        `💵 *Monto:* $${d.monto} ${d.moneda || "ARS"}\n` +
        `📅 *Fecha:* ${d.fecha || "Hoy"}\n` +
        `🏦 *Cuenta:* ${d.cuenta}\n` +
        `🏷️ *Categoría:* ${d.macro_categoria}\n` +
        `🔖 *Subcategoría:* ${d.subcategoria}\n` +
        `🔄 *Split:* ${d.split || "Solo mío"}` +
        (d.cuotas && d.cuotas > 1 ? `\n💳 *Cuotas:* ${d.cuotas} (cuota ${d.n_cuota || 1})` : "") +
        (d.notas ? `\n📋 *Notas:* ${d.notas}` : "") +
        alertaConfianza;
    } else if (data.tipo === "INGRESO") {
      mensaje =
        `🤔 *¿Confirmás este ingreso?*\n\n` +
        `💰 *Fuente:* ${d.fuente || d.descripcion}\n` +
        `💵 *Monto:* $${d.monto} ${d.moneda || "ARS"}\n` +
        `📅 *Fecha:* ${d.fecha || "Hoy"}\n` +
        `🏦 *Cuenta:* ${d.cuenta}` +
        (d.notas ? `\n📋 *Notas:* ${d.notas}` : "") +
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
