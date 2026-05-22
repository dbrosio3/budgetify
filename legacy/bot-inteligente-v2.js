// --- CONFIGURACIÓN INICIAL ---
const TELEGRAM_TOKEN = "YOUR_TELEGRAM_TOKEN";
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";
const WEBHOOK_URL = "YOUR_WEBHOOK_URL";
const MODEL_NAME = "gemini-2.5-flash"; // Modelo estable con visión - Free Tier
const MI_CHAT_ID = 0; // YOUR_CHAT_ID

// ============================================================
// PUNTO DE ENTRADA - doPost()
// ============================================================
function doPost(e) {
  const contents = JSON.parse(e.postData.contents);
  
  // 1. MANEJO DE BOTONES (cuando el usuario clickea Confirmar/Cancelar)
  if (contents.callback_query) {
    handleCallback(contents.callback_query);
    return;
  }

  // 2. VALIDACIÓN DE SEGURIDAD
  const chatId = contents.message.chat.id;
  if (chatId !== MI_CHAT_ID) {
    Logger.log("Intento de acceso no autorizado de: " + chatId);
    sendTelegramMsg(chatId, "⛔ No tenés permiso para usar este bot.");
    return;
  }

  try {
    // 3. DETERMINAR TIPO DE MENSAJE
    const message = contents.message;
    let result;
    let loadingMessageId = null;
    
    if (message.photo) {
      // 📸 MENSAJE CON IMAGEN - DEBUG MODE
      loadingMessageId = sendTelegramMsg(chatId, "📸 Paso 1/5: Iniciando análisis...");
      
      try {
        // Checkpoint 1: Descargar imagen
        actualizarMensaje(chatId, loadingMessageId, "📸 Paso 2/5: Descargando imagen de Telegram...");
        const photo = message.photo[message.photo.length - 1];
        const imageData = descargarImagenTelegram(photo.file_id);
        
        // Checkpoint 2: Preparar contexto
        actualizarMensaje(chatId, loadingMessageId, "📸 Paso 3/5: Preparando contexto...");
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const config = ss.getSheetByName("CONFIG");
        const cuentas = config.getRange("A2:A10").getValues().flat().filter(String);
        const categorias = config.getRange("B2:B15").getValues().flat().filter(String);
        const misDatos = obtenerDatosPersonales();
        
        // Checkpoint 3: Llamar a Gemini Vision
        actualizarMensaje(chatId, loadingMessageId, "📸 Paso 4/5: Analizando con IA (esto puede tardar)...");
        const caption = message.caption || "";
        const prompt = construirPromptVision(caption, cuentas, categorias, misDatos);
        const response = callGeminiVision(prompt, imageData);
        
        // Checkpoint 4: Parsear respuesta
        actualizarMensaje(chatId, loadingMessageId, "📸 Paso 5/5: Procesando resultados...");
        result = JSON.parse(response.replace(/```json|```/g, "").trim());
        
        // Agregar alertas si es necesario
        if (result.confianza === "BAJA" || result.campos_faltantes.length > 0) {
          result.alerta = `⚠️ Confianza ${result.confianza}. Campos dudosos: ${result.campos_faltantes.join(", ")}`;
        }
        if (result.razonamiento) {
          result.alerta = (result.alerta || "") + `\n\n💡 ${result.razonamiento}`;
        }
        
      } catch (imgError) {
        actualizarMensaje(chatId, loadingMessageId, 
          `❌ Error en procesamiento de imagen:\n${imgError.message}\n\nStack: ${imgError.stack}`);
        Logger.log("Error detallado: " + JSON.stringify(imgError));
        return;
      }
      
    } else if (message.text) {
      // 💬 MENSAJE DE TEXTO
      result = procesarConIA(message.text);
      
    } else {
      sendTelegramMsg(chatId, "Solo puedo procesar texto o imágenes de comprobantes.");
      return;
    }
    
    // 4. ENVIAR CONFIRMACIÓN (editando el mensaje de loading si existe)
    if (loadingMessageId) {
      enviarConfirmacionEditando(chatId, loadingMessageId, result);
    } else {
      enviarConfirmacion(chatId, result);
    }
    
  } catch (err) {
    Logger.log("Error completo: " + err.stack);
    sendTelegramMsg(chatId, "Error general: " + err.message + "\n\nStack: " + err.stack);
  }
}

// ============================================================
// PROCESAMIENTO DE IMÁGENES CON GEMINI VISION
// ============================================================
function procesarImagen(message) {
  // DEPRECATED: Esta función ahora se ejecuta inline en doPost() para mejor debugging
  // Se mantiene por compatibilidad pero no se usa
  throw new Error("Esta función está deprecada. El procesamiento se hace en doPost()");
}

function construirPromptVision(caption, cuentas, categorias, misDatos) {
  return `Sos un experto en leer comprobantes de pago argentinos. 
  Analizá esta imagen y extraé TODOS los datos del ticket/factura/comprobante.
  ${caption ? `Contexto adicional del usuario: "${caption}"` : ''}
  Fecha actual: ${new Date().toLocaleDateString('es-AR')}
  
  Cuentas válidas: ${cuentas.join(", ")}
  Categorías válidas: ${categorias.join(", ")}
  
  🔑 DATOS DEL USUARIO (para identificar si es ingreso o egreso):
  - Nombre: ${misDatos.nombre}
  - Alias: ${misDatos.alias.join(", ")}
  ${misDatos.cbu ? `- CBU/CVU: ${misDatos.cbu}` : ''}
  ${misDatos.cuit ? `- CUIT/CUIL: ${misDatos.cuit}` : ''}
  
  Respondé ÚNICAMENTE un JSON (sin markdown) con:
  {
    "tipo": "GASTO" | "INGRESO" | "TRANSFERENCIA",
    "datos": {
      "fecha": "fecha del comprobante (formato DD/MM/YYYY)",
      "descripcion": "comercio o concepto (o nombre de quien transfiere si es ingreso)",
      "categoria": "categoría más apropiada de la lista",
      "cuenta": "cuenta usada (si está en el comprobante, sino inferila)",
      "monto": número sin símbolos,
      "moneda": "ARS" o "USD",
      "cuotas": número de cuotas si aplica,
      "n_cuota": número de cuota actual si aplica,
      "split": "Solo mío" o "Compartido 50/50" (solo para GASTO),
      "notas": "número de transacción, código, o info relevante",
      "fuente": "solo para INGRESO: de quién viene el dinero",
      "origen": "solo para TRANSFERENCIA: cuenta origen",
      "destino": "solo para TRANSFERENCIA: cuenta destino"
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
  - Para INGRESO usa el campo "fuente" en lugar de "descripcion" para el concepto`;
}

function descargarImagenTelegram(fileId) {
  // 1. Obtener file_path de Telegram
  const getFileUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`;
  const fileInfo = UrlFetchApp.fetch(getFileUrl);
  const filePath = JSON.parse(fileInfo.getContentText()).result.file_path;
  
  // 2. Descargar la imagen
  const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
  const imageBlob = UrlFetchApp.fetch(downloadUrl).getBlob();
  
  // 3. Convertir a base64
  const base64Image = Utilities.base64Encode(imageBlob.getBytes());
  
  // 4. Detectar MIME type correcto desde la extensión del archivo
  let mimeType = "image/jpeg"; // Default
  
  if (filePath.toLowerCase().endsWith('.png')) {
    mimeType = "image/png";
  } else if (filePath.toLowerCase().endsWith('.jpg') || filePath.toLowerCase().endsWith('.jpeg')) {
    mimeType = "image/jpeg";
  } else if (filePath.toLowerCase().endsWith('.webp')) {
    mimeType = "image/webp";
  } else if (filePath.toLowerCase().endsWith('.gif')) {
    mimeType = "image/gif";
  }
  
  // Telegram comprime las fotos a JPEG casi siempre, así que si no detectamos nada, usamos JPEG
  Logger.log(`Archivo descargado: ${filePath} → MIME type detectado: ${mimeType}`);
  
  return {
    data: base64Image,
    mimeType: mimeType
  };
}

// ============================================================
// PROCESAMIENTO DE TEXTO CON GEMINI (igual que antes)
// ============================================================
function procesarConIA(text) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = ss.getSheetByName("CONFIG");
  const cuentas = config.getRange("A2:A10").getValues().flat().filter(String);
  const categorias = config.getRange("B2:B15").getValues().flat().filter(String);

  const prompt = `Actúa como un extractor de datos financieros. 
  Usuario dice: "${text}". Hoy es ${new Date().toLocaleDateString('es-AR')}.
  Responde ÚNICAMENTE un JSON puro (sin markdown) con este formato:
  {
    "tipo": "GASTO" | "INGRESO" | "TRANSFERENCIA",
    "datos": { ... }
  }
  Cuentas: ${cuentas.join(", ")}. Categorías: ${categorias.join(", ")}.
  Si es GASTO, mapea a estas 13 columnas: {fecha, descripcion, categoria, cuenta, monto, cuotas, n_cuota, moneda, split, link, notas}.
  Importante: split debe ser "Solo mío" o "Compartido 50/50". Si no hay cuotas, usa 1.`;

  const response = callGemini(prompt);
  const result = JSON.parse(response.replace(/```json|```/g, "").trim());
  
  return result;
}

// ============================================================
// OBTENER DATOS PERSONALES PARA IDENTIFICACIÓN
// ============================================================
function obtenerDatosPersonales() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Intentar leer de una pestaña "MIS_DATOS" (si existe)
  let sheet = ss.getSheetByName("MIS_DATOS");
  
  if (!sheet) {
    // Si no existe, usar valores por defecto (el usuario los debe configurar)
    Logger.log("⚠️ No existe la pestaña MIS_DATOS. Usando valores por defecto.");
    return {
      nombre: "TU NOMBRE COMPLETO", // REEMPLAZÁ ESTO
      alias: ["tu.alias.mp", "tu.cvu"], // REEMPLAZÁ ESTO
      cbu: "", // Opcional
      cuit: "" // Opcional
    };
  }
  
  // Leer datos de la pestaña MIS_DATOS (estructura esperada en la documentación abajo)
  const datos = {
    nombre: sheet.getRange("B2").getValue() || "Usuario",
    alias: sheet.getRange("B3").getValue().split(",").map(a => a.trim()).filter(String),
    cbu: sheet.getRange("B4").getValue() || "",
    cuit: sheet.getRange("B5").getValue() || ""
  };
  
  return datos;
}

// ============================================================
// ENVIAR MENSAJE DE CONFIRMACIÓN CON BOTONES
// ============================================================
function enviarConfirmacion(chatId, data) {
  const operationId = Utilities.getUuid();
  
  // Guardar datos temporalmente
  const props = PropertiesService.getScriptProperties();
  props.setProperty(operationId, JSON.stringify(data));
  
  // Crear botones inline
  const keyboard = {
    inline_keyboard: [[
      { text: "✅ Confirmar", callback_data: "conf_" + operationId },
      { text: "🗑️ Cancelar", callback_data: "cancel_" + operationId }
    ]]
  };

  const mensaje = construirMensajeConfirmacion(data);
  sendTelegramMsg(chatId, mensaje, keyboard);
}

// NUEVA: Editar mensaje existente con la confirmación
function enviarConfirmacionEditando(chatId, messageId, data) {
  const operationId = Utilities.getUuid();
  
  // Guardar datos temporalmente
  const props = PropertiesService.getScriptProperties();
  props.setProperty(operationId, JSON.stringify(data));
  
  // Crear botones inline
  const keyboard = {
    inline_keyboard: [[
      { text: "✅ Confirmar", callback_data: "conf_" + operationId },
      { text: "🗑️ Cancelar", callback_data: "cancel_" + operationId }
    ]]
  };

  const mensaje = construirMensajeConfirmacion(data);
  
  // Editar el mensaje de "Analizando..." con el resultado
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`;
  const payload = {
    chat_id: chatId.toString(),
    message_id: messageId,
    text: mensaje,
    parse_mode: "Markdown",
    reply_markup: JSON.stringify(keyboard)
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  UrlFetchApp.fetch(url, options);
}

// Construir el mensaje de confirmación (extraído para reutilizar)
function construirMensajeConfirmacion(data) {
  let mensaje = "";
  const d = data.datos;
  
  // Mostrar alerta de confianza si existe
  const alertaConfianza = data.alerta ? `\n\n${data.alerta}` : "";
  
  if (data.tipo === "GASTO") {
    mensaje = `🤔 *¿Confirmás este gasto?*\n\n` +
              `📝 *Descripción:* ${d.descripcion}\n` +
              `💵 *Monto:* $${d.monto} ${d.moneda || 'ARS'}\n` +
              `📅 *Fecha:* ${d.fecha || 'Hoy'}\n` +
              `🏦 *Cuenta:* ${d.cuenta}\n` +
              `📁 *Categoría:* ${d.categoria}\n` +
              `🔄 *Split:* ${d.split || 'Solo mío'}` +
              (d.cuotas > 1 ? `\n💳 *Cuotas:* ${d.cuotas} (cuota ${d.n_cuota || 1})` : '') +
              (d.notas ? `\n📋 *Notas:* ${d.notas}` : '') +
              alertaConfianza;
  } else if (data.tipo === "INGRESO") {
    mensaje = `🤔 *¿Confirmás este ingreso?*\n\n` +
              `💰 *Fuente:* ${d.fuente || d.descripcion}\n` +
              `💵 *Monto:* $${d.monto} ${d.moneda || 'ARS'}\n` +
              `📅 *Fecha:* ${d.fecha || 'Hoy'}\n` +
              `🏦 *Cuenta:* ${d.cuenta}` +
              (d.notas ? `\n📋 *Notas:* ${d.notas}` : '') +
              alertaConfianza;
  } else if (data.tipo === "TRANSFERENCIA") {
    mensaje = `🤔 *¿Confirmás esta transferencia?*\n\n` +
              `📤 *Origen:* ${d.origen} (-$${d.monto_salida})\n` +
              `📥 *Destino:* ${d.destino} (+$${d.monto_entrada})` +
              (d.comision ? `\n💸 *Comisión:* $${d.comision}` : '') +
              alertaConfianza;
  }

  return mensaje;  // ← RETORNAR el mensaje, no enviarlo
}

// ============================================================
// MANEJAR CLICK EN BOTONES
// ============================================================
function handleCallback(callback) {
  const chatId = callback.message.chat.id;
  const messageId = callback.message.message_id;
  const data = callback.data;

  if (chatId !== MI_CHAT_ID) {
    answerCallback(callback.id, "⛔ No autorizado");
    return;
  }

  if (data.startsWith("conf_")) {
    const operationId = data.replace("conf_", "");
    const props = PropertiesService.getScriptProperties();
    const storedData = props.getProperty(operationId);
    
    if (!storedData) {
      actualizarMensaje(chatId, messageId, "⏱️ Esta operación expiró. Enviá de nuevo el mensaje.");
      answerCallback(callback.id, "Operación expirada");
      return;
    }
    
    const jsonData = JSON.parse(storedData);
    escribirEnSheet(jsonData);
    
    props.deleteProperty(operationId);
    
    actualizarMensaje(chatId, messageId, "✅ *¡Anotado perfectamente!*\n\n" + 
                      generarResumen(jsonData));
    answerCallback(callback.id, "✓ Guardado");
    
  } else if (data.startsWith("cancel_")) {
    const operationId = data.replace("cancel_", "");
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty(operationId);
    
    actualizarMensaje(chatId, messageId, "🗑️ *Operación cancelada*\n\nNo se guardó nada.");
    answerCallback(callback.id, "Cancelado");
  }
}

// ============================================================
// ESCRIBIR EN GOOGLE SHEETS
// ============================================================
function escribirEnSheet(result) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (result.tipo === "GASTO") {
    const sheet = ss.getSheetByName("GASTOS");
    const d = result.datos;
    
    // Parsear fecha si viene como string
    let fecha = d.fecha || new Date();
    if (typeof fecha === 'string') {
      const partes = fecha.split('/');
      if (partes.length === 3) {
        fecha = new Date(partes[2], partes[1] - 1, partes[0]); // año, mes-1, día
      }
    }
    
    sheet.appendRow([
      fecha, 
      d.descripcion, 
      d.categoria, 
      d.cuenta, 
      d.monto, 
      d.cuotas || 1, 
      d.n_cuota || 1, 
      "", // Col H: Imp. Mensual (fórmula)
      d.moneda || "ARS", 
      d.split || "Solo mío", 
      "", // Col K: A Splitwise (fórmula)
      d.link || "", 
      d.notas || ""
    ]);
    
  } else if (result.tipo === "INGRESO") {
    const sheet = ss.getSheetByName("INGRESOS");
    const d = result.datos;
    
    let fecha = d.fecha || new Date();
    if (typeof fecha === 'string') {
      const partes = fecha.split('/');
      if (partes.length === 3) {
        fecha = new Date(partes[2], partes[1] - 1, partes[0]);
      }
    }
    
    sheet.appendRow([
      fecha, 
      d.fuente || d.descripcion, // Usar "fuente" si existe, sino "descripcion"
      d.cuenta, 
      d.monto, 
      d.moneda || "ARS", 
      d.cotizacion || 1
    ]);
    
  } else if (result.tipo === "TRANSFERENCIA") {
    const sheet = ss.getSheetByName("TRANSFERENCIAS");
    const d = result.datos;
    
    let fecha = d.fecha || new Date();
    if (typeof fecha === 'string') {
      const partes = fecha.split('/');
      if (partes.length === 3) {
        fecha = new Date(partes[2], partes[1] - 1, partes[0]);
      }
    }
    
    sheet.appendRow([
      fecha, 
      d.origen, 
      d.monto_salida, 
      d.destino, 
      d.monto_entrada, 
      d.comision || 0
    ]);
  }
}

// ============================================================
// LLAMADAS A GEMINI
// ============================================================
function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(res.getContentText());

  if (res.getResponseCode() !== 200) {
    throw new Error(`Gemini API Error: ${json.error.message}`);
  }
  
  return json.candidates[0].content.parts[0].text;
}

function callGeminiVision(prompt, imageData) {
  const url = `https://generativelanguage.googleapis.com/v1/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
  
  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: imageData.mimeType,
            data: imageData.data
          }
        }
      ]
    }]
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(res.getContentText());

  if (res.getResponseCode() !== 200) {
    throw new Error(`Gemini Vision Error: ${JSON.stringify(json.error)}`);
  }
  
  return json.candidates[0].content.parts[0].text;
}

// ============================================================
// UTILIDADES DE TELEGRAM
// ============================================================
function sendTelegramMsg(chatId, text, keyboard = null) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const payload = {
    chat_id: chatId.toString(),
    text: text,
    parse_mode: "Markdown"
  };
  
  if (keyboard) {
    payload.reply_markup = JSON.stringify(keyboard);
  }
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());
  
  // Retornar el message_id para poder editarlo después
  return result.result ? result.result.message_id : null;
}

function actualizarMensaje(chatId, messageId, newText) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`;
  const payload = {
    chat_id: chatId.toString(),
    message_id: messageId,
    text: newText,
    parse_mode: "Markdown"
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  UrlFetchApp.fetch(url, options);
}

function answerCallback(callbackId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`;
  const payload = {
    callback_query_id: callbackId,
    text: text
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  UrlFetchApp.fetch(url, options);
}

function generarResumen(data) {
  const d = data.datos;
  if (data.tipo === "GASTO") {
    return `📝 ${d.descripcion} - $${d.monto}`;
  } else if (data.tipo === "INGRESO") {
    return `💰 ${d.fuente} - $${d.monto}`;
  } else {
    return `🔄 ${d.origen} → ${d.destino}`;
  }
}

// ============================================================
// CONFIGURACIÓN DE PESTAÑA "MIS_DATOS" (IMPORTANTE)
// ============================================================
/*
Para que el bot pueda identificar correctamente INGRESOS vs EGRESOS,
creá una pestaña llamada "MIS_DATOS" en tu spreadsheet con esta estructura:

    A                 B
1   Campo             Valor
2   Nombre            Juan Pérez
3   Alias             mi.alias.mp, juan.banco.uy
4   CBU/CVU           0170000000000000000001
5   CUIT/CUIL         20-12345678-9

NOTAS:
- Los alias van separados por comas (sin espacios extras)
- CBU/CVU y CUIT son opcionales, pero mejoran la precisión
- El nombre debe coincidir con cómo aparece en los comprobantes

Si no creás esta pestaña, el bot usará valores por defecto
(los cuales debés reemplazar en la función obtenerDatosPersonales()).
*/

// FUNCIÓN PARA ACTIVAR EL BOT (Ejecutar una sola vez)
function setWebhook() {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${WEBHOOK_URL}`;
  const res = UrlFetchApp.fetch(url);
  Logger.log(res.getContentText());
}
