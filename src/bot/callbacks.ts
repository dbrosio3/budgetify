import { TelegramCallbackQuery, TransactionResult } from "../types";
import { TelegramClient } from "./telegram";
import { SheetsClient } from "../sheets/client";
import { Validator } from "../services/validator";
import { pendingOperations } from "../services/pending-operations";
import { contextManager } from "../services/context-manager";
import { sessionManager } from "../services/session-manager";
import { ConversationHandler } from "../services/conversation-handler";
import { ClarificationBuilder } from "./clarification-builder";
import { MessageBuilder } from "./message-builder";
import { Logger } from "../utils/logger";

export class CallbackHandlers {
  private conversationHandler: ConversationHandler | null = null;

  constructor(
    private telegramClient: TelegramClient,
    private sheetsClient: SheetsClient
  ) {}

  setConversationHandler(handler: ConversationHandler): void {
    this.conversationHandler = handler;
  }

  async handleCallback(callback: TelegramCallbackQuery): Promise<void> {
    const chatId = callback.message.chat.id;
    const messageId = callback.message.message_id;
    const data = callback.data;

    if (data.startsWith("conf_")) {
      await this.handleConfirm(callback.id, chatId, messageId, data);
    } else if (data.startsWith("cancel_")) {
      await this.handleCancel(callback.id, chatId, messageId, data);
    } else if (data.startsWith("cl_")) {
      await this.handleClarification(callback.id, chatId, messageId, data);
    }
  }

  private async handleConfirm(
    callbackId: string,
    chatId: number,
    messageId: number,
    data: string
  ): Promise<void> {
    const operationId = data.replace("conf_", "");
    const storedData = pendingOperations.getOperation(operationId);

    if (!storedData) {
      await this.telegramClient.editMessage(
        chatId,
        messageId,
        "⏱️ Esta operación expiró. Enviá de nuevo el mensaje."
      );
      await this.telegramClient.answerCallbackQuery(callbackId, "Operación expirada");
      return;
    }

    try {
      Logger.log("Attempting to write data: " + JSON.stringify(storedData));

      // Validate transaction
      Validator.validateTransaction(storedData);

      // Write to sheet
      if (storedData.tipo === "GASTO") {
        await this.sheetsClient.writeGasto(storedData.datos);
      } else if (storedData.tipo === "INGRESO") {
        await this.sheetsClient.writeIngreso(storedData.datos);
      } else if (storedData.tipo === "TRANSFERENCIA") {
        await this.sheetsClient.writeTransferencia(storedData.datos);
      }

      // Delete pending operation
      pendingOperations.deleteOperation(operationId);

      // Save context (legacy)
      contextManager.setContext(chatId, {
        tipo: storedData.tipo,
        datos: storedData.datos,
      });

      // Save to session manager and delete session (explicit termination)
      await sessionManager.saveLastConfirmed(chatId, storedData);
      await sessionManager.deleteSession(chatId);

      // Send confirmation message
      const resumen = this.generateResumen(storedData);
      await this.telegramClient.editMessage(
        chatId,
        messageId,
        "✅ *¡Anotado perfectamente!*\n\n" + resumen
      );
      await this.telegramClient.answerCallbackQuery(callbackId, "✓ Guardado");
    } catch (error) {
      Logger.error("ERROR writing to sheet from callback", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.telegramClient.editMessage(
        chatId,
        messageId,
        "❌ *Error al guardar*\n\n" + errorMessage + "\n\nRevisá los logs para más detalles."
      );
      await this.telegramClient.answerCallbackQuery(callbackId, "Error: " + errorMessage);
    }
  }

  private async handleCancel(
    callbackId: string,
    chatId: number,
    messageId: number,
    data: string
  ): Promise<void> {
    const operationId = data.replace("cancel_", "");
    pendingOperations.deleteOperation(operationId);

    // Delete session (explicit termination)
    await sessionManager.deleteSession(chatId);

    await this.telegramClient.editMessage(
      chatId,
      messageId,
      "🗑️ *Operación cancelada*\n\nNo se guardó nada."
    );
    await this.telegramClient.answerCallbackQuery(callbackId, "Cancelado");
  }

  private async handleClarification(
    callbackId: string,
    chatId: number,
    messageId: number,
    data: string
  ): Promise<void> {
    if (!this.conversationHandler) {
      Logger.warn("ConversationHandler not set for clarification callback");
      await this.telegramClient.answerCallbackQuery(callbackId, "Error interno");
      return;
    }

    const parsed = ClarificationBuilder.parseCallbackData(data);
    if (!parsed) {
      Logger.warn(`Invalid clarification callback data: ${data}`);
      await this.telegramClient.answerCallbackQuery(callbackId, "Error");
      return;
    }

    const session = await sessionManager.getSession(chatId);
    if (!session || !session.pendingQuestions) {
      await this.telegramClient.answerCallbackQuery(
        callbackId,
        "Sesión expirada"
      );
      await this.telegramClient.editMessage(
        chatId,
        messageId,
        "⏱️ Tu sesión expiró. Por favor, empezá de nuevo."
      );
      return;
    }

    // Find the question being answered
    const question = ClarificationBuilder.findQuestionByPrefix(
      session.pendingQuestions,
      parsed.questionIdPrefix
    );

    if (!question) {
      Logger.warn(`Question not found for prefix: ${parsed.questionIdPrefix}`);
      await this.telegramClient.answerCallbackQuery(callbackId, "Error");
      return;
    }

    // Process the clarification response
    const result = await this.conversationHandler.handleClarificationButtonResponse(
      chatId,
      question.id,
      parsed.value
    );

    await this.telegramClient.answerCallbackQuery(
      callbackId,
      `✓ ${parsed.value}`
    );

    // Handle the result
    if (result.type === "transaction" && result.response?.responseType === "transaction") {
      // We have a complete transaction now, show confirmation
      const confirmMessage = MessageBuilder.buildConfirmationMessage(
        result.response.transaction
      );
      const keyboard = ClarificationBuilder.buildConfirmCancelKeyboard(
        session.lastOperationId || session.sessionId
      );

      await this.telegramClient.editMessage(chatId, messageId, confirmMessage, keyboard);
    } else if (result.type === "clarification" && result.response?.responseType === "clarification") {
      // Still need more clarification
      const { text, keyboard } = ClarificationBuilder.buildClarificationMessage(
        result.response
      );
      await this.telegramClient.editMessage(chatId, messageId, text, keyboard || undefined);
    } else if (result.type === "error") {
      await this.telegramClient.editMessage(
        chatId,
        messageId,
        `❌ ${result.message || "Ocurrió un error"}`
      );
    }
  }

  private generateResumen(data: TransactionResult): string {
    const d = data.datos;
    if (data.tipo === "GASTO") {
      return `📝 ${d.descripcion} - $${d.monto}\n🏷️ ${d.macro_categoria} → ${d.subcategoria}`;
    } else if (data.tipo === "INGRESO") {
      return `💰 ${d.fuente || d.descripcion} - $${d.monto}`;
    } else {
      return `🔄 ${d.origen} → ${d.destino}`;
    }
  }
}

