import { TransactionResult } from "../types";
import { Logger } from "../utils/logger";
import { randomUUID } from "crypto";

interface StoredOperation {
  data: TransactionResult;
  expiresAt: number;
  chatId?: number; // Track which chat this operation belongs to
}

class PendingOperationsManager {
  private storage: Map<string, StoredOperation> = new Map();
  private lastPendingByChat: Map<number, string> = new Map(); // chatId -> operationId
  private readonly TTL_MS = 30 * 60 * 1000; // 30 minutes

  createOperation(data: TransactionResult, chatId?: number): string {
    const operationId = randomUUID();
    this.storage.set(operationId, {
      data,
      expiresAt: Date.now() + this.TTL_MS,
      chatId,
    });

    // Track the last pending operation for this chat
    if (chatId) {
      this.lastPendingByChat.set(chatId, operationId);
    }

    Logger.log(`Created pending operation: ${operationId}${chatId ? ` for chat ${chatId}` : ""}`);
    return operationId;
  }

  getOperation(operationId: string): TransactionResult | null {
    const stored = this.storage.get(operationId);

    if (!stored) {
      return null;
    }

    // Check if expired
    if (Date.now() > stored.expiresAt) {
      this.storage.delete(operationId);
      return null;
    }

    return stored.data;
  }

  deleteOperation(operationId: string): void {
    const operation = this.storage.get(operationId);
    this.storage.delete(operationId);

    // Remove from chat tracking if it was the last pending
    if (operation?.chatId) {
      const lastOpId = this.lastPendingByChat.get(operation.chatId);
      if (lastOpId === operationId) {
        this.lastPendingByChat.delete(operation.chatId);
      }
    }

    Logger.log(`Deleted pending operation: ${operationId}`);
  }

  getLastPendingOperation(chatId: number): TransactionResult | null {
    const operationId = this.lastPendingByChat.get(chatId);
    if (!operationId) {
      return null;
    }

    return this.getOperation(operationId);
  }

  updateLastPendingOperation(chatId: number, newData: TransactionResult): string | null {
    const operationId = this.lastPendingByChat.get(chatId);
    if (!operationId) {
      // No existing pending operation, create a new one
      return this.createOperation(newData, chatId);
    }

    // Update existing operation
    const existing = this.storage.get(operationId);
    if (existing && Date.now() < existing.expiresAt) {
      existing.data = newData;
      existing.expiresAt = Date.now() + this.TTL_MS; // Reset expiration
      Logger.log(`Updated pending operation: ${operationId} for chat ${chatId}`);
      return operationId;
    } else {
      // Operation expired, create new one
      this.lastPendingByChat.delete(chatId);
      return this.createOperation(newData, chatId);
    }
  }

  // Cleanup expired operations periodically
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, stored] of this.storage.entries()) {
      if (now > stored.expiresAt) {
        this.storage.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      Logger.log(`Cleaned up ${cleaned} expired pending operations`);
    }
  }
}

// Singleton instance
export const pendingOperations = new PendingOperationsManager();

// Run cleanup every 10 minutes
setInterval(
  () => {
    pendingOperations.cleanup();
  },
  10 * 60 * 1000
);
