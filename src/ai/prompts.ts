import { CategoryMap, PersonalData, ConversationContext, TransactionResult } from "../types";

export class PromptBuilder {
  static buildVisionPrompt(
    caption: string,
    cuentas: string[],
    _macroCategorias: string[],
    _subcategorias: string[],
    categoriasMap: CategoryMap,
    misDatos: PersonalData
  ): string {
    // Create category description
    let descripcionCategorias = "📋 CATEGORÍAS DISPONIBLES (DEBÉS USAR ALGUNA DE ESTAS OBLIGATORIAMENTE):\n";
    for (const macro in categoriasMap) {
      descripcionCategorias += `\n${macro}:\n`;
      categoriasMap[macro].forEach((sub) => {
        // Extract text without emoji for display
        const subSinEmoji = sub.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "").trim();
        descripcionCategorias += `  • ${subSinEmoji}\n`;
      });
    }
    descripcionCategorias += "\n⚠️ REGLAS CRÍTICAS SOBRE CATEGORÍAS:\n";
    descripcionCategorias +=
      "1. macro_categoria: DEBÉS usar EXACTAMENTE una de las macro-categorías listadas arriba (sin emoji).\n";
    descripcionCategorias +=
      "2. subcategoria: DEBÉS usar EXACTAMENTE una de las subcategorías que corresponda a la macro elegida.\n";
    descripcionCategorias +=
      "3. NUNCA inventes categorías. NUNCA uses texto libre que no esté en la lista.\n";
    descripcionCategorias +=
      "4. Si ninguna de las categorías es apripiada utilizar macro-categoria: 'REGALOS/OTROS' / subcategoria: 'Otros' como default.\n";

    return `Sos un experto en leer comprobantes de pago argentinos. 
Analizá esta imagen y extraé TODOS los datos del ticket/factura/comprobante.
${caption ? `Contexto adicional del usuario: "${caption}"` : ""}
Fecha actual: ${new Date().toLocaleDateString("es-AR")}

Cuentas válidas: ${cuentas.join(", ")}

${descripcionCategorias}

🔑 DATOS DEL USUARIO (para identificar si es ingreso o egreso):
- Nombre: ${misDatos.nombre}
- Alias: ${misDatos.alias.join(", ")}
${misDatos.cbu ? `- CBU/CVU: ${misDatos.cbu}` : ""}
${misDatos.cuit ? `- CUIT/CUIL: ${misDatos.cuit}` : ""}

Respondé ÚNICAMENTE un JSON (sin markdown) con:
{
  "tipo": "GASTO" | "INGRESO" | "TRANSFERENCIA",
  "datos": {
    "fecha": "fecha del comprobante (formato DD/MM/YYYY o ISO YYYY-MM-DD)",
    "descripcion": "comercio o concepto (o nombre de quien transfiere si es ingreso)",
    "macro_categoria": "UNA de las macro-categorías listadas arriba (EXACTAMENTE como aparece, sin emoji). NUNCA uses texto libre.",
    "subcategoria": "UNA de las subcategorías listadas para la macro elegida (texto SIN emoji). NUNCA uses texto libre.",
    "cuenta": "cuenta usada (si está en el comprobante, sino inferila)",
    "monto": número sin símbolos,
    "moneda": "ARS" o "USD" o "EUR",
    "cuotas": número de cuotas si aplica,
    "n_cuota": número de cuota actual si aplica,
    "split": "Solo mío" o "Compartido 50/50" (solo para GASTO),
    "notas": "número de transacción, código, o info relevante",
    "fuente": "solo para INGRESO: de quién viene el dinero",
    "origen": "solo para TRANSFERENCIA: cuenta origen",
    "destino": "solo para TRANSFERENCIA: cuenta destino",
    "monto_salida": "solo para TRANSFERENCIA",
    "monto_entrada": "solo para TRANSFERENCIA"
  },
  "confianza": "ALTA" | "MEDIA" | "BAJA",
  "campos_faltantes": ["lista de campos que no pudiste identificar"],
  "razonamiento": "explicá brevemente por qué determinaste que es GASTO/INGRESO/TRANSFERENCIA"
}

🎯 REGLAS PARA DETERMINAR TIPO:

**INGRESO** = El dinero ENTRA a mis cuentas:
- Mi nombre/alias/CBU aparece como DESTINATARIO/RECEPTOR
- El comprobante dice "Recibiste", "Te transfirieron", "Ingreso", "Acreditación"
- Aparezco como vendedor en una factura
- Ejemplos: transferencias recibidas, cobro de sueldo, reintegros, ventas

**GASTO** = El dinero SALE de mis cuentas:
- Mi nombre/alias/CBU aparece como ORIGEN/PAGADOR
- El comprobante dice "Pagaste", "Compraste", "Débito", "Enviaste"
- Tickets de compra en comercios
- Facturas donde soy el cliente
- Ejemplos: compras, pagos de servicios, transferencias enviadas

**TRANSFERENCIA** = Movimiento entre MIS cuentas:
- Tanto origen como destino son cuentas mías
- Ej: de Mercado Pago a Banco

⚠️ Si NO podés determinar con certeza si es ingreso o gasto (ej: no aparece mi nombre en ningún lado), 
asumí que es GASTO por defecto, pero poné confianza "MEDIA" o "BAJA".

REGLAS CRÍTICAS DE FORMATO:
- Si el monto tiene punto como separador de miles, eliminalo (ej: 1.500 → 1500)
- Si tiene coma decimal, convertí a punto (ej: 1.234,56 → 1234.56)
- La fecha debe ser la del comprobante, NO la de hoy
- Para split: compras en supermercado/restaurante → "Compartido 50/50"
- Para split: servicios personales/ropa/individual → "Solo mío"
- Si no hay cuotas, poné 1 en ambos campos
- Para INGRESO usa el campo "fuente" en lugar de "descripcion" para el concepto
- IMPORTANTE: macro_categoria NO debe incluir emoji (ej: "ALIMENTACIÓN", no "🍽️ ALIMENTACIÓN")
- La subcategoria debe corresponder a la macro_categoria elegida`;
  }

  static buildTextPrompt(
    text: string,
    cuentas: string[],
    categoriasMap: CategoryMap,
    contextoPrevio: ConversationContext | null,
    operacionPendiente: TransactionResult | null = null
  ): string {
    // Create category description
    let descripcionCategorias = "📋 CATEGORÍAS DISPONIBLES (DEBÉS USAR SOLO ESTAS):\n";
    for (const macro in categoriasMap) {
      descripcionCategorias += `\n${macro}:\n`;
      categoriasMap[macro].forEach((sub) => {
        // Extract text without emoji for display
        const subSinEmoji = sub.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "").trim();
        descripcionCategorias += `  • ${subSinEmoji}\n`;
      });
    }
    descripcionCategorias += "\n⚠️ REGLAS CRÍTICAS SOBRE CATEGORÍAS:\n";
    descripcionCategorias +=
      "1. macro_categoria: DEBÉS usar EXACTAMENTE una de las macro-categorías listadas arriba (sin emoji).\n";
    descripcionCategorias +=
      "2. subcategoria: DEBÉS usar EXACTAMENTE una de las subcategorías que corresponda a la macro elegida.\n";
    descripcionCategorias +=
      "3. Si el usuario dice algo como 'regalo', 'otros', o cualquier texto, NO lo uses directamente.\n";
    descripcionCategorias +=
      "   En su lugar, buscá en la lista de categorías disponibles y elegí la MÁS APROPIADA.\n";
    descripcionCategorias +=
      "4. Hacé coincidencias parciales inteligentes: si el usuario dice 'peluquería', matcheá con 'Peluquería/Barbería' de la lista.\n";
    descripcionCategorias +=
      "5. Si no encontrás una categoría apropiada, usá la primera subcategoría de la macro más cercana.\n";
    descripcionCategorias +=
      "6. NUNCA inventes categorías. NUNCA uses el texto literal que el usuario menciona si no está en la lista.\n";

    // Build context text if exists
    let contextoTexto = "";

    // Priority: pending operation > confirmed context
    if (operacionPendiente) {
      const op: TransactionResult = operacionPendiente;
      const datos = op.datos;
      contextoTexto =
        `\n\n⚠️ OPERACIÓN PENDIENTE DE CONFIRMACIÓN:\n` +
        `Hay un ${op.tipo} pendiente que el usuario aún NO ha confirmado:\n` +
        (op.tipo === "GASTO"
          ? `- Descripción: ${datos.descripcion || "(pendiente)"}\n` +
            `- Monto: $${datos.monto || 0} ${datos.moneda || "ARS"}\n` +
            `- Fecha: ${datos.fecha || "Hoy"}\n` +
            `- Cuenta: ${datos.cuenta || "(pendiente)"}\n` +
            `- Categoría: ${datos.macro_categoria || "(pendiente)"} → ${datos.subcategoria || "(pendiente)"}\n` +
            `- Split: ${datos.split || "Solo mío"}\n`
          : op.tipo === "INGRESO"
            ? `- Fuente: ${datos.fuente || datos.descripcion || "(pendiente)"}\n` +
              `- Monto: $${datos.monto || 0} ${datos.moneda || "ARS"}\n` +
              `- Cuenta: ${datos.cuenta || "(pendiente)"}\n`
            : `- Origen: ${datos.origen || "(pendiente)"} → Destino: ${datos.destino || "(pendiente)"}\n` +
              `- Monto salida: $${datos.monto_salida || 0}\n` +
              `- Monto entrada: $${datos.monto_entrada || 0}\n`) +
        `\n🎯 IMPORTANTE: El usuario está MODIFICANDO esta operación pendiente. ` +
        `Si dice cosas como "pone categoría X", "cambia la descripción a Y", "agrega esto", ` +
        `devolvé los datos de la operación pendiente con las modificaciones solicitadas. ` +
        `MANTENÉ todos los campos que el usuario NO menciona (especialmente el monto si ya estaba definido). ` +
        `Si el usuario dice "poné categoría TRANSPORTE, Combustible", mantené el monto y otros campos, solo cambiá la categoría.\n` +
        `Si el mensaje es claramente un NUEVO gasto/ingreso/transferencia (no relacionado), ignorá esta operación pendiente y creá una nueva.`;
    } else if (contextoPrevio) {
      const ctx = contextoPrevio.datos;
      contextoTexto =
        `\n\n📋 CONTEXTO DE LA CONVERSACIÓN ANTERIOR:\n` +
        `El usuario acaba de confirmar un ${contextoPrevio.tipo}:\n` +
        (contextoPrevio.tipo === "GASTO"
          ? `- Descripción: ${ctx.descripcion}\n` +
            `- Monto: $${ctx.monto} ${ctx.moneda || "ARS"}\n` +
            `- Fecha: ${ctx.fecha || "Hoy"}\n` +
            `- Cuenta: ${ctx.cuenta}\n` +
            `- Categoría: ${ctx.macro_categoria} → ${ctx.subcategoria}\n` +
            `- Split: ${ctx.split || "Solo mío"}\n`
          : contextoPrevio.tipo === "INGRESO"
            ? `- Fuente: ${ctx.fuente || ctx.descripcion}\n` +
              `- Monto: $${ctx.monto} ${ctx.moneda || "ARS"}\n` +
              `- Cuenta: ${ctx.cuenta}\n`
            : `- Origen: ${ctx.origen} → Destino: ${ctx.destino}\n` +
              `- Monto salida: $${ctx.monto_salida}\n` +
              `- Monto entrada: $${ctx.monto_entrada}\n`) +
        `\nEl usuario puede estar haciendo referencia a este registro anterior. ` +
        `Si dice cosas como "era compartido", "cambia la fecha", "agrega esto también", ` +
        `interpretá el mensaje en contexto del registro anterior.\n` +
        `Si el mensaje es claramente un NUEVO gasto/ingreso/transferencia, ignorá el contexto y creá uno nuevo.`;
    }

    return `Eres un extractor de datos financieros. Tu única tarea es devolver JSON válido. NUNCA respondas con texto natural.

Usuario dice: "${text}". Hoy es ${new Date().toLocaleDateString("es-AR")}.

Cuentas disponibles: ${cuentas.join(", ")}

${descripcionCategorias}

${contextoTexto}

REGLAS CRÍTICAS:
1. SIEMPRE responde SOLO con JSON válido. NUNCA agregues texto antes o después del JSON.
2. Si el mensaje NO contiene una transacción completa (ej: "espera", "te confirmo", "déjame pensar"), devolvé un JSON con los campos que puedas inferir y deja los demás vacíos o con valores por defecto.
3. Si el usuario está modificando el registro anterior (ej: "era compartido", "cambia la fecha a ayer"), devolvé los datos del registro anterior con las modificaciones solicitadas y poné "usa_contexto": true.

Formato JSON requerido (responde SOLO esto, sin texto adicional):
{
  "tipo": "GASTO" | "INGRESO" | "TRANSFERENCIA",
  "datos": {
    "fecha": "DD/MM/YYYY o YYYY-MM-DD (formato ISO)" o "" si no se puede inferir,
    "descripcion": "..." o "" si no está claro,
    "macro_categoria": "UNA de las macro-categorías listadas arriba (EXACTAMENTE como aparece, sin emoji). NUNCA uses texto libre del usuario.",
    "subcategoria": "UNA de las subcategorías listadas para la macro elegida (texto SIN emoji). NUNCA uses texto libre del usuario. Si el usuario menciona algo, buscá la subcategoría más apropiada en la lista.",
    "cuenta": "..." o "" si no está claro,
    "monto": número o 0 si no está claro,
    "cuotas": 1 si no aplica,
    "n_cuota": 1 si no aplica,
    "moneda": "ARS" | "USD" | "EUR" (default: "ARS"),
    "split": "Solo mío" | "Compartido 50/50" (default: "Solo mío"),
    "link": "",
    "notas": ""
  },
  "usa_contexto": true/false
}

Si es GASTO: Completa todos los campos posibles. Si faltan datos críticos (monto, descripcion), usa valores por defecto razonables.
🚨 CRÍTICO para CATEGORÍAS:
- macro_categoria: DEBÉS elegir EXACTAMENTE una de las macro-categorías listadas arriba. Si el usuario dice "regalo" o "otros", buscá en la lista la categoría más apropiada (probablemente "OTROS" si existe, o la primera disponible).
- subcategoria: DEBÉS elegir EXACTAMENTE una de las subcategorías que corresponda a la macro elegida. Si el usuario menciona algo que no está en la lista, hacé coincidencias parciales inteligentes (ej: 'peluquería' → 'Peluquería/Barbería', 'super' → 'Supermercado').
- NUNCA uses el texto literal que el usuario menciona si no está en la lista de categorías disponibles.
- Si seleccionaste una macro_categoria, SIEMPRE debés seleccionar también una subcategoria correspondiente de esa macro.
Si es INGRESO: usa {fecha, fuente, cuenta, monto, moneda, cotizacion}.
Si es TRANSFERENCIA: usa {fecha, origen, destino, monto_salida, monto_entrada}.

⚠️ CRÍTICO: Si hay una OPERACIÓN PENDIENTE arriba, el usuario está MODIFICÁNDOLA. 
- MANTENÉ todos los campos que el usuario NO menciona explícitamente
- Si el usuario dice "pone categoría X", mantené el monto, cuenta, fecha, descripción, etc. Solo cambiá la categoría
- Si el usuario dice "cambia la descripción a Y", mantené todo lo demás (monto, cuenta, categoría, etc.), solo cambiá la descripción
- NUNCA pongas monto en 0 o campos vacíos a menos que el usuario explícitamente lo pida
- Si el usuario dice "poné categoría TRANSPORTE, Combustible y en descripción poné que no me acuerdo", mantené el monto original y solo cambiá categoría y descripción

IMPORTANTE: Responde SOLO con el JSON. No agregues explicaciones, comentarios ni texto adicional.`;
  }
}
