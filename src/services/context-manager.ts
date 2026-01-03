import { ConversationContext } from "../types";
import { Logger } from "../utils/logger";

// In-memory storage with TTL (can be replaced with Redis)
interface StoredContext {
  data: ConversationContext;
  expiresAt: number;
}

class ContextManager {
  private storage: Map<string, StoredContext> = new Map();
  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  getContext(chatId: number): ConversationContext | null {
    const key = `last_context_${chatId}`;
    const stored = this.storage.get(key);

    if (!stored) {
      return null;
    }

    // Check if expired
    if (Date.now() > stored.expiresAt) {
      this.storage.delete(key);
      return null;
    }

    return stored.data;
  }

  setContext(chatId: number, context: ConversationContext): void {
    const key = `last_context_${chatId}`;
    this.storage.set(key, {
      data: context,
      expiresAt: Date.now() + this.TTL_MS,
    });
    Logger.log(`Context saved for chat ${chatId}`);
  }

  clearContext(chatId: number): void {
    const key = `last_context_${chatId}`;
    this.storage.delete(key);
    Logger.log(`Context cleared for chat ${chatId}`);
  }

  // Cleanup expired entries periodically
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
      Logger.log(`Cleaned up ${cleaned} expired context entries`);
    }
  }
}

// Singleton instance
export const contextManager = new ContextManager();

// Run cleanup every hour
setInterval(
  () => {
    contextManager.cleanup();
  },
  60 * 60 * 1000
);
