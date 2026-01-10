import {
  CategoryMap,
  PersonalData,
  ConversationContext,
  TransactionResult,
  ConversationMessage,
  ClarificationQuestion,
  MONEDA_OPTIONS,
  SPLIT_OPTIONS,
} from "../types";

/**
 * Formats a list of options as numbered choices for the AI prompt
 * Returns: "1: Option1, 2: Option2, 3: Option3"
 */
function formatNumberedOptions(options: readonly string[]): string {
  return options.map((opt, i) => `${i + 1}: ${opt}`).join(", ");
}

/**
 * Extracts text without emoji
 */
function extractTextWithoutEmoji(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "")
    .trim();
}

export class PromptBuilder {
  static buildVisionPrompt(
    caption: string,
    cuentas: string[],
    _macroCategorias: string[],
    _subcategorias: string[],
    categoriasMap: CategoryMap,
    misDatos: PersonalData
  ): string {
    // Create numbered accounts list
    const cuentasNumeradas = formatNumberedOptions(cuentas);

    // Create numbered categories with subcategories
    const macroKeys = Object.keys(categoriasMap);
    let descripcionCategorias = "📋 CATEGORÍAS (usá el NÚMERO correspondiente):\n\n";
    descripcionCategorias += `MACRO-CATEGORÍAS: ${formatNumberedOptions(macroKeys)}\n\n`;
    descripcionCategorias += "SUBCATEGORÍAS por macro:\n";
    macroKeys.forEach((macro, macroIndex) => {
      const subs = categoriasMap[macro].map((s) => extractTextWithoutEmoji(s));
      descripcionCategorias += `  Si macro=${macroIndex + 1} (${macro}): ${formatNumberedOptions(subs)}\n`;
    });

    // Numbered moneda and split options
    const monedaNumerada = formatNumberedOptions(MONEDA_OPTIONS);
    const splitNumerado = formatNumberedOptions(SPLIT_OPTIONS);

    return `Analizá esta imagen de comprobante y extraé los datos.
${caption ? `Contexto del usuario: "${caption}"` : ""}
Fecha de hoy (solo para referencia): ${new Date().toLocaleDateString("es-AR")}

🏦 CUENTAS: ${cuentasNumeradas}

${descripcionCategorias}

💰 MONEDA: ${monedaNumerada}
🔄 SPLIT: ${splitNumerado}

🔑 MIS DATOS (para determinar si es ingreso/egreso):
- Nombre: ${misDatos.nombre}
- Alias: ${misDatos.alias.join(", ")}
${misDatos.cbu ? `- CBU/CVU: ${misDatos.cbu}` : ""}

⚠️ REGLAS CRÍTICAS:
1. Los campos cuenta, macro_categoria, subcategoria, moneda, split DEBEN ser NÚMEROS ENTEROS. NUNCA uses null, strings, ni texto. Si no estás seguro, usá 1 como default.
2. ⚠️ FECHA: Usá SIEMPRE la fecha del comprobante, NO la fecha de hoy. Buscá la fecha en el ticket/factura.

📋 EJEMPLO DE RESPUESTA CORRECTA:
{
  "tipo": "GASTO",
  "datos": {
    "fecha": "07/01/2026",
    "descripcion": "Supermercado Carrefour",
    "macro_categoria": 3,
    "subcategoria": 2,
    "cuenta": 1,
    "monto": 15000,
    "moneda": 1,
    "cuotas": 1,
    "n_cuota": 1,
    "split": 2,
    "notas": "Ticket #12345"
  },
  "confianza": "ALTA",
  "campos_faltantes": [],
  "razonamiento": "Compra en supermercado pagada con tarjeta"
}

❌ INCORRECTO: "cuenta": null, "macro_categoria": "ALIMENTACIÓN", "moneda": "USD"
✅ CORRECTO: "cuenta": 1, "macro_categoria": 3, "moneda": 2

Respondé SOLO con JSON válido (sin markdown):
{
  "tipo": "GASTO" | "INGRESO" | "TRANSFERENCIA",
  "datos": {
    "fecha": "DD/MM/YYYY (del comprobante, NO de hoy)",
    "descripcion": "texto",
    "macro_categoria": INTEGER,
    "subcategoria": INTEGER,
    "cuenta": INTEGER,
    "monto": NUMBER,
    "moneda": INTEGER (1-3),
    "cuotas": INTEGER,
    "n_cuota": INTEGER,
    "split": INTEGER (1-2),
    "notas": "texto"
  },
  "confianza": "ALTA" | "MEDIA" | "BAJA",
  "campos_faltantes": [],
  "razonamiento": "texto corto"
}

REGLAS:
- GASTO = dinero sale de mis cuentas (compras, pagos)
- INGRESO = dinero entra a mis cuentas (cobros, transferencias recibidas)
- TRANSFERENCIA = movimiento entre mis propias cuentas
- Fecha: SIEMPRE la del comprobante (buscar en el ticket), NUNCA usar fecha de hoy
- Monto: sin separadores de miles, punto decimal (1234.56)
- Si no hay cuotas, poné cuotas=1 y n_cuota=1
- Split: 1=Solo mío, 2=Compartido 50/50`;
  }

  static buildTextPrompt(
    text: string,
    cuentas: string[],
    categoriasMap: CategoryMap,
    contextoPrevio: ConversationContext | null,
    operacionPendiente: TransactionResult | null = null
  ): string {
    // Create numbered accounts list
    const cuentasNumeradas = formatNumberedOptions(cuentas);

    // Create numbered categories with subcategories
    const macroKeys = Object.keys(categoriasMap);
    let descripcionCategorias = "📋 CATEGORÍAS (respondé con NÚMEROS):\n\n";
    descripcionCategorias += `MACRO-CATEGORÍAS: ${formatNumberedOptions(macroKeys)}\n\n`;
    descripcionCategorias += "SUBCATEGORÍAS por macro:\n";
    macroKeys.forEach((macro, macroIndex) => {
      const subs = categoriasMap[macro].map((s) => extractTextWithoutEmoji(s));
      descripcionCategorias += `  Si macro=${macroIndex + 1} (${macro}): ${formatNumberedOptions(subs)}\n`;
    });

    // Numbered moneda and split options
    const monedaNumerada = formatNumberedOptions(MONEDA_OPTIONS);
    const splitNumerado = formatNumberedOptions(SPLIT_OPTIONS);

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

    return `Extraé datos financieros del mensaje. Respondé SOLO con JSON válido.

Usuario dice: "${text}"
Fecha de hoy (solo para referencia): ${new Date().toLocaleDateString("es-AR")}

🏦 CUENTAS: ${cuentasNumeradas}

${descripcionCategorias}

💰 MONEDA: ${monedaNumerada}
🔄 SPLIT: ${splitNumerado}
${contextoTexto}

⚠️ REGLAS CRÍTICAS:
1. Los campos cuenta, macro_categoria, subcategoria, moneda, split DEBEN ser NÚMEROS ENTEROS. NUNCA uses null, strings, ni texto. Si no estás seguro, usá 1 como default.
2. ⚠️ FECHA: Si el usuario menciona "hoy", "ayer", o fechas relativas, calculá la fecha real. Si menciona una fecha específica, usala. Si no menciona fecha, dejá el campo vacío "".

📋 EJEMPLO DE RESPUESTA CORRECTA:
{
  "tipo": "GASTO",
  "datos": {
    "fecha": "10/01/2026",
    "descripcion": "Almuerzo con amigos",
    "macro_categoria": 1,
    "subcategoria": 3,
    "cuenta": 2,
    "monto": 5000,
    "moneda": 1,
    "cuotas": 1,
    "n_cuota": 1,
    "split": 2,
    "notas": ""
  },
  "usa_contexto": false
}

❌ INCORRECTO: "cuenta": null, "macro_categoria": "ALIMENTACIÓN", "split": "Solo mío"
✅ CORRECTO: "cuenta": 1, "macro_categoria": 3, "split": 1

Respondé SOLO con JSON (sin markdown ni texto adicional):
{
  "tipo": "GASTO" | "INGRESO" | "TRANSFERENCIA",
  "datos": {
    "fecha": "DD/MM/YYYY (calculá si dice hoy/ayer)" o "",
    "descripcion": "texto",
    "macro_categoria": INTEGER,
    "subcategoria": INTEGER,
    "cuenta": INTEGER,
    "monto": NUMBER,
    "moneda": INTEGER (1=ARS, 2=USD, 3=EUR),
    "cuotas": INTEGER,
    "n_cuota": INTEGER,
    "split": INTEGER (1=Solo mío, 2=Compartido),
    "notas": ""
  },
  "usa_contexto": true/false
}

REGLAS:
- Si hay OPERACIÓN PENDIENTE arriba, el usuario la está modificando. Mantené campos no mencionados.
- Si el usuario menciona categoría por nombre, buscá el número en la lista.
- Fecha: "hoy" → usa fecha de hoy, "ayer" → resta 1 día, fecha específica → usá esa, sin fecha → ""
- INGRESO: usá fuente en vez de descripcion, agregá cotizacion si moneda != ARS
- TRANSFERENCIA: usá origen, destino (números de cuenta), monto_salida, monto_entrada`;
  }

  static buildConversationalPrompt(
    messages: ConversationMessage[],
    currentInput: string,
    cuentas: string[],
    categoriasMap: CategoryMap,
    pendingQuestions?: ClarificationQuestion[],
    partialTransaction?: Partial<TransactionResult>
  ): string {
    // Create numbered accounts list
    const cuentasNumeradas = formatNumberedOptions(cuentas);

    // Create numbered categories with subcategories
    const macroKeys = Object.keys(categoriasMap);
    let descripcionCategorias = "📋 CATEGORÍAS (respondé con NÚMEROS):\n\n";
    descripcionCategorias += `MACRO-CATEGORÍAS: ${formatNumberedOptions(macroKeys)}\n\n`;
    descripcionCategorias += "SUBCATEGORÍAS por macro:\n";
    macroKeys.forEach((macro, macroIndex) => {
      const subs = categoriasMap[macro].map((s) => extractTextWithoutEmoji(s));
      descripcionCategorias += `  Si macro=${macroIndex + 1} (${macro}): ${formatNumberedOptions(subs)}\n`;
    });

    // Numbered moneda and split options
    const monedaNumerada = formatNumberedOptions(MONEDA_OPTIONS);
    const splitNumerado = formatNumberedOptions(SPLIT_OPTIONS);

    // Build conversation history
    const historyText =
      messages.length > 0
        ? messages
            .slice(-10) // Keep last 10 messages for context
            .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
            .join("\n")
        : "(Sin historial previo)";

    // Build pending questions context
    let pendingQuestionsText = "";
    if (pendingQuestions && pendingQuestions.length > 0) {
      pendingQuestionsText =
        "\n\n⚠️ PREGUNTAS PENDIENTES QUE EL USUARIO PODRÍA ESTAR RESPONDIENDO:\n" +
        pendingQuestions.map((q) => `- ${q.field}: "${q.questionText}"`).join("\n") +
        "\n\nSi el mensaje del usuario parece responder alguna de estas preguntas, " +
        "integrá la respuesta en la transacción.";
    }

    // Build partial transaction context
    let partialTransactionText = "";
    if (partialTransaction) {
      partialTransactionText =
        "\n\n📝 TRANSACCIÓN EN CONSTRUCCIÓN:\n" +
        `Tipo: ${partialTransaction.tipo || "(no definido)"}\n` +
        `Datos parciales: ${JSON.stringify(partialTransaction.datos || {}, null, 2)}\n` +
        "\nIntegrá la nueva información del usuario con estos datos.";
    }

    return `Sos un asistente financiero conversacional. Tu objetivo es ayudar al usuario a registrar transacciones.

HISTORIAL DE CONVERSACIÓN:
${historyText}

MENSAJE ACTUAL DEL USUARIO: "${currentInput}"
Fecha de hoy: ${new Date().toLocaleDateString("es-AR")}

🏦 CUENTAS DISPONIBLES: ${cuentasNumeradas}

${descripcionCategorias}

💰 MONEDA: ${monedaNumerada}
🔄 SPLIT: ${splitNumerado}
${pendingQuestionsText}
${partialTransactionText}

📋 INSTRUCCIONES DE RESPUESTA:

Respondé con JSON en UNO de estos formatos:

FORMATO 1 - Transacción completa (tenés confianza ALTA en todos los campos críticos):
{
  "responseType": "transaction",
  "transaction": {
    "tipo": "GASTO" | "INGRESO" | "TRANSFERENCIA",
    "datos": {
      "fecha": "DD/MM/YYYY",
      "descripcion": "texto",
      "macro_categoria": INTEGER,
      "subcategoria": INTEGER,
      "cuenta": INTEGER,
      "monto": NUMBER,
      "moneda": INTEGER,
      "cuotas": 1,
      "n_cuota": 1,
      "split": INTEGER
    },
    "confianza": "ALTA"
  }
}

FORMATO 2 - Necesitás clarificación (falta información crítica como monto, cuenta, o categoría):
{
  "responseType": "clarification",
  "partialTransaction": {
    "tipo": "GASTO",
    "datos": { /* campos que sí pudiste identificar */ }
  },
  "message": "Entendido! [resumen de lo que entendiste]. Necesito algunos datos:",
  "questions": [
    {
      "field": "cuenta",
      "questionText": "¿Desde qué cuenta?",
      "questionType": "select",
      "options": ["Mercado Pago", "Banco Santander", "Efectivo"],
      "confidence": "BAJA"
    },
    {
      "field": "monto",
      "questionText": "¿Cuál fue el monto?",
      "questionType": "text",
      "confidence": "BAJA"
    }
  ]
}

FORMATO 3 - Error o no entendiste:
{
  "responseType": "error",
  "errorMessage": "No pude entender tu mensaje",
  "suggestions": ["Intenta decir algo como 'Gasté 500 en supermercado'"]
}

🎯 REGLAS CRÍTICAS:

1. CUÁNDO PEDIR CLARIFICACIÓN:
   - Si falta el MONTO → SIEMPRE pedir clarificación
   - Si falta la CUENTA y hay múltiples opciones → pedir clarificación
   - Si no está claro si es GASTO, INGRESO, o TRANSFERENCIA → pedir clarificación
   - Si la categoría es muy ambigua → pedir clarificación

2. CUÁNDO DEVOLVER TRANSACCIÓN:
   - Si tenés monto, tipo, y podés inferir razonablemente cuenta y categoría → transacción
   - Si el usuario está respondiendo preguntas pendientes y ahora tenés toda la info → transacción

3. PREGUNTAS:
   - Máximo 3 preguntas por respuesta
   - Usá questionType: "select" para campos con opciones fijas (cuenta, categoría)
   - Usá questionType: "text" para campos abiertos (monto, descripción)
   - Las options de "select" deben ser los NOMBRES legibles, no números

4. CAMPOS NUMÉRICOS en datos de transacción:
   - cuenta, macro_categoria, subcategoria, moneda, split DEBEN ser INTEGERS (1, 2, 3...)
   - Nunca uses null, strings, ni texto para estos campos

5. El campo "message" en clarification debe ser amigable y en español rioplatense.

Respondé SOLO con JSON válido (sin markdown ni texto adicional):`;
  }
}
