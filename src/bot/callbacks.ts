import { TelegramCallbackQuery, TransactionResult } from "../types";
import { TelegramClient } from "./telegram";
import { SheetsClient } from "../sheets/client";
import { Validator } from "../services/validator";
import { pendingOperations } from "../services/pending-operations";
import { contextManager } from "../services/context-manager";
import { Logger } from "../utils/logger";

export class CallbackHandlers {
  constructor(
    private telegramClient: TelegramClient,
    private sheetsClient: SheetsClient
  ) {}

  async handleCallback(callback: TelegramCallbackQuery): Promise<void> {
    const chatId = callback.message.chat.id;
    const messageId = callback.message.message_id;
    const data = callback.data;

    if (data.startsWith("conf_")) {
      await this.handleConfirm(callback.id, chatId, messageId, data);
    } else if (data.startsWith("cancel_")) {
      await this.handleCancel(callback.id, chatId, messageId, data);
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

      // Save context
      contextManager.setContext(chatId, {
        tipo: storedData.tipo,
        datos: storedData.datos,
      });

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

    await this.telegramClient.editMessage(
      chatId,
      messageId,
      "🗑️ *Operación cancelada*\n\nNo se guardó nada."
    );
    await this.telegramClient.answerCallbackQuery(callbackId, "Cancelado");
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
