import express, { Request, Response } from "express";
import { config } from "./config";
import { Logger } from "./utils/logger";
import { TelegramUpdate, TransactionResult } from "./types";
import { TelegramClient } from "./bot/telegram";
import { MessageHandlers } from "./bot/handlers";
import { CallbackHandlers } from "./bot/callbacks";
import { createAIClient } from "./ai/client";
import { SheetsClient } from "./sheets/client";
import { ImageProcessor } from "./services/image-processor";
import { AudioProcessor } from "./services/audio-processor";
import { pendingOperations } from "./services/pending-operations";
import { contextManager } from "./services/context-manager";
import { MessageBuilder } from "./bot/message-builder";

const app = express();
app.use(express.json());

// Initialize clients
const telegramClient = new TelegramClient();
const aiClient = createAIClient();
const sheetsClient = new SheetsClient();
const imageProcessor = new ImageProcessor(telegramClient);
const audioProcessor = new AudioProcessor(telegramClient);

// Initialize handlers
const messageHandlers = new MessageHandlers(aiClient, sheetsClient, imageProcessor, audioProcessor);
const callbackHandlers = new CallbackHandlers(telegramClient, sheetsClient);

// Helper to check if result is modifying pending operation
function isModifyingPending(result: TransactionResult, chatId: number): boolean {
  const existingPending = pendingOperations.getLastPendingOperation(chatId);
  if (!existingPending) return false;

  // If usa_contexto is true, it's likely a modification
  if (result.usa_contexto) return true;

  // If it's the same type and has similar data, it's likely a modification
  if (result.tipo === existingPending.tipo) {
    // Check if critical fields match (like monto for GASTO)
    if (result.tipo === "GASTO" && result.datos.monto === existingPending.datos.monto) {
      return true;
    }
    if (result.tipo === "INGRESO" && result.datos.monto === existingPending.datos.monto) {
      return true;
    }
    if (
      result.tipo === "TRANSFERENCIA" &&
      result.datos.monto_salida === existingPending.datos.monto_salida
    ) {
      return true;
    }
  }

  return false;
}

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Webhook endpoint
app.post("/webhook", async (req: Request, res: Response) => {
  try {
    const update = req.body as TelegramUpdate;

    // Handle callback queries
    if (update.callback_query) {
      void callbackHandlers.handleCallback(update.callback_query).catch((error: unknown) => {
        Logger.error("Error handling callback", error instanceof Error ? error : null);
      });
      res.status(200).send("OK");
      return;
    }

    // Handle messages
    if (!update.message) {
      res.status(200).send("OK");
      return;
    }

    const message = update.message;
    const chatId = message.chat.id;

    // Security check
    if (chatId !== config.telegram.chatId) {
      Logger.log(`Unauthorized access attempt from: ${chatId}`);
      await telegramClient.sendMessage(chatId, "⛔ No tenés permiso para usar este bot.");
      res.status(200).send("OK");
      return;
    }

    // Handle commands
    if (message.text) {
      if (message.text.startsWith("/nuevo") || message.text.startsWith("/reset")) {
        contextManager.clearContext(chatId);
        await telegramClient.sendMessage(
          chatId,
          "🔄 *Contexto limpiado*\n\nEmpezando conversación nueva."
        );
        res.status(200).send("OK");
        return;
      }

      if (message.text.startsWith("/contexto")) {
        const contextoPrevio = contextManager.getContext(chatId);
        if (contextoPrevio) {
          const resumen = MessageBuilder.buildContextSummary(contextoPrevio);
          await telegramClient.sendMessage(
            chatId,
            `📋 *Último registro confirmado:*\n\n${resumen}`
          );
        } else {
          await telegramClient.sendMessage(
            chatId,
            "📋 No hay contexto previo. Empezá una nueva conversación."
          );
        }
        res.status(200).send("OK");
        return;
      }
    }

    let result: TransactionResult | undefined;
    let loadingMessageId: number | null = null;

    try {
      if (message.photo) {
        // Handle image message
        loadingMessageId = await telegramClient.sendMessage(
          chatId,
          "📸 Paso 1/5: Iniciando análisis..."
        );
        await telegramClient.editMessage(
          chatId,
          loadingMessageId!,
          "📸 Paso 2/5: Descargando imagen de Telegram..."
        );

        result = await messageHandlers.handleImageMessage(message);

        await telegramClient.editMessage(
          chatId,
          loadingMessageId!,
          "📸 Paso 3/5: Preparando contexto..."
        );
        await telegramClient.editMessage(
          chatId,
          loadingMessageId!,
          "📸 Paso 4/5: Analizando con IA (esto puede tardar)..."
        );
        await telegramClient.editMessage(
          chatId,
          loadingMessageId!,
          "📸 Paso 5/5: Procesando resultados..."
        );
      } else if (message.voice || message.audio) {
        // Handle audio message
        loadingMessageId = await telegramClient.sendMessage(
          chatId,
          "🎤 Paso 1/4: Transcribiendo audio..."
        );
        await telegramClient.editMessage(
          chatId,
          loadingMessageId!,
          "🎤 Paso 2/4: Descargando audio de Telegram..."
        );

        const audioFile = message.voice || message.audio!;
        const audioData = await audioProcessor.downloadAudio(audioFile.file_id);

        await telegramClient.editMessage(
          chatId,
          loadingMessageId!,
          "🎤 Paso 3/4: Transcribiendo con IA (esto puede tardar)..."
        );
        const textoTranscrito = await aiClient.transcribeAudio(audioData);

        if (!textoTranscrito || textoTranscrito.trim() === "") {
          throw new Error(
            "No se pudo transcribir el audio. Asegurate de que el audio sea claro y esté en español."
          );
        }

        // Show transcription
        await telegramClient.editMessage(
          chatId,
          loadingMessageId!,
          `🎤 *Transcripción:*\n\n"${textoTranscrito}"\n\nProcesando...`
        );

        // Process transcribed text
        result = await messageHandlers.handleTextMessage({ ...message, text: textoTranscrito });
      } else if (message.text) {
        // Handle text message
        loadingMessageId = await telegramClient.sendMessage(chatId, "💬 Procesando...");
        result = await messageHandlers.handleTextMessage(message);
      } else {
        await telegramClient.sendMessage(
          chatId,
          "❌ Solo puedo procesar texto, imágenes de comprobantes o audios."
        );
        res.status(200).send("OK");
        return;
      }

      // Check if there's a pending operation and if this is a modification
      if (!result) {
        throw new Error("No result from message handler");
      }
      const isModification = isModifyingPending(result, chatId);
      let operationId: string;

      if (isModification) {
        // This is a modification of the pending operation, update it
        const updatedId = pendingOperations.updateLastPendingOperation(chatId, result);
        operationId = updatedId || pendingOperations.createOperation(result, chatId);
      } else {
        // New transaction, create new pending operation
        operationId = pendingOperations.createOperation(result, chatId);
      }

      // Create keyboard
      const keyboard = {
        inline_keyboard: [
          [
            { text: "✅ Confirmar", callback_data: `conf_${operationId}` },
            { text: "🗑️ Cancelar", callback_data: `cancel_${operationId}` },
          ],
        ],
      };

      // Send confirmation message
      const confirmationMessage = MessageBuilder.buildConfirmationMessage(result);
      if (loadingMessageId) {
        await telegramClient.editMessage(chatId, loadingMessageId, confirmationMessage, keyboard);
      } else {
        await telegramClient.sendMessage(chatId, confirmationMessage, keyboard);
      }

      res.status(200).send("OK");
    } catch (error) {
      Logger.error("Error processing message", error instanceof Error ? error : null);

      let errorText = "❌ Error en procesamiento";

      if (error instanceof Error) {
        // Handle Gemini API rate limit errors
        if (
          error.message.includes("429") ||
          error.message.includes("RESOURCE_EXHAUSTED") ||
          error.message.includes("quota")
        ) {
          const retryMatch = error.message.match(/retry in ([\d.]+)s/i);
          const retrySeconds = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : null;

          if (retrySeconds) {
            errorText = `⚠️ *Límite de cuota alcanzado*\n\nHas excedido el límite diario de la API de Gemini (20 solicitudes/día en el plan gratuito).\n\nPor favor, intentá de nuevo en ${retrySeconds} segundos.\n\n💡 *Sugerencia:* Considerá actualizar a un plan de pago para aumentar el límite.`;
          } else {
            errorText = `⚠️ *Límite de cuota alcanzado*\n\nHas excedido el límite diario de la API de Gemini (20 solicitudes/día en el plan gratuito).\n\nPor favor, intentá mañana o actualizá tu plan.`;
          }
        } else {
          // For other errors, show a truncated, safe message
          const safeMessage = error.message.substring(0, 200).replace(/[*_`[\]]/g, "");
          errorText = `❌ Error:\n${safeMessage}`;
        }
      }

      // Telegram messages have a 4096 character limit, ensure we don't exceed it
      if (errorText.length > 4000) {
        errorText = errorText.substring(0, 4000) + "...";
      }

      try {
        if (loadingMessageId) {
          await telegramClient.editMessage(chatId, loadingMessageId, errorText);
        } else {
          await telegramClient.sendMessage(chatId, errorText);
        }
      } catch (telegramError) {
        // If editing fails, try sending a new message
        Logger.error(
          "Error sending error message to Telegram",
          telegramError instanceof Error ? telegramError : null
        );
        try {
          await telegramClient.sendMessage(
            chatId,
            "❌ Ocurrió un error al procesar tu mensaje. Por favor, intentá de nuevo."
          );
        } catch (finalError) {
          Logger.error(
            "Failed to send fallback error message",
            finalError instanceof Error ? finalError : null
          );
        }
      }

      res.status(200).send("OK");
    }
  } catch (error) {
    Logger.error("Error in webhook handler", error instanceof Error ? error : null);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
const PORT = config.server.port;
app.listen(PORT, () => {
  Logger.log(`Server running on port ${PORT}`);
  Logger.log(`Webhook URL: ${config.telegram.webhookUrl}/webhook`);
});

// Set webhook on startup (optional, can be done manually)
if (config.telegram.webhookUrl) {
  telegramClient.setWebhook(`${config.telegram.webhookUrl}/webhook`).catch((error: unknown) => {
    Logger.error("Failed to set webhook", error instanceof Error ? error : null);
  });
}
