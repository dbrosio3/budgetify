import Redis from "ioredis";
import { randomUUID } from "crypto";
import { config } from "../config";
import { Logger } from "../utils/logger";
import type {
  ConversationSession,
  SessionState,
  ConversationMessage,
  ClarificationQuestion,
  TransactionResult,
} from "../types";

const SESSION_TTL = 60 * 60; // 1 hour in seconds
const LOCK_TTL = 30; // 30 seconds for distributed lock

class SessionManager {
  private redis: Redis;
  private isConnected: boolean = false;

  constructor() {
    this.redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          Logger.error("Redis connection failed after 3 retries");
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });

    this.redis.on("connect", () => {
      this.isConnected = true;
      Logger.log("Redis connected");
    });

    this.redis.on("error", (err) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      Logger.error(`Redis error: ${errorMessage}`, err instanceof Error ? err : null);
    });

    this.redis.on("close", () => {
      this.isConnected = false;
      Logger.warn("Redis connection closed");
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      try {
        await this.redis.connect();
        // Verify connection with a ping
        await this.redis.ping();
        Logger.log("Redis connected successfully");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(
          `Failed to connect to Redis at ${config.redis.url}. ` +
            `Make sure Redis is running. Error: ${errorMessage}`
        );
        throw new Error(
          `Redis connection failed: ${errorMessage}. ` +
            `Please ensure Redis is running at ${config.redis.url}`
        );
      }
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  private sessionKey(chatId: number): string {
    return `session:${chatId}`;
  }

  private lockKey(chatId: number): string {
    return `session:lock:${chatId}`;
  }

  private lastConfirmedKey(chatId: number): string {
    return `last_confirmed:${chatId}`;
  }

  async getSession(chatId: number): Promise<ConversationSession | null> {
    const key = this.sessionKey(chatId);
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    const session = JSON.parse(data) as ConversationSession;
    // Refresh TTL on access
    await this.redis.expire(key, SESSION_TTL);
    return session;
  }

  async getOrCreateSession(chatId: number): Promise<ConversationSession> {
    const existing = await this.getSession(chatId);
    if (existing) {
      return existing;
    }

    const session: ConversationSession = {
      sessionId: randomUUID(),
      chatId,
      state: "idle",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL * 1000,
      messages: [],
    };

    await this.saveSession(session);
    return session;
  }

  async saveSession(session: ConversationSession): Promise<void> {
    session.updatedAt = Date.now();
    session.expiresAt = Date.now() + SESSION_TTL * 1000;

    const key = this.sessionKey(session.chatId);
    await this.redis.setex(key, SESSION_TTL, JSON.stringify(session));
  }

  async updateState(chatId: number, state: SessionState): Promise<void> {
    const session = await this.getOrCreateSession(chatId);
    session.state = state;
    await this.saveSession(session);
  }

  async addMessage(chatId: number, message: ConversationMessage): Promise<void> {
    const session = await this.getOrCreateSession(chatId);
    session.messages.push(message);

    // Keep only last 20 messages to prevent session bloat
    if (session.messages.length > 20) {
      session.messages = session.messages.slice(-20);
    }

    await this.saveSession(session);
  }

  async setCurrentTransaction(
    chatId: number,
    transaction: Partial<TransactionResult>
  ): Promise<void> {
    const session = await this.getOrCreateSession(chatId);
    session.currentTransaction = transaction;
    await this.saveSession(session);
  }

  async setPendingQuestions(
    chatId: number,
    questions: ClarificationQuestion[]
  ): Promise<void> {
    const session = await this.getOrCreateSession(chatId);
    session.pendingQuestions = questions;
    await this.saveSession(session);
  }

  async setLastQuestionMessageId(chatId: number, messageId: number): Promise<void> {
    const session = await this.getOrCreateSession(chatId);
    session.lastQuestionMessageId = messageId;
    await this.saveSession(session);
  }

  async setLastOperationId(chatId: number, operationId: string): Promise<void> {
    const session = await this.getOrCreateSession(chatId);
    session.lastOperationId = operationId;
    await this.saveSession(session);
  }

  async deleteSession(chatId: number): Promise<void> {
    const key = this.sessionKey(chatId);
    await this.redis.del(key);
    Logger.log(`Session deleted for chat ${chatId}`);
  }

  async saveLastConfirmed(
    chatId: number,
    transaction: TransactionResult
  ): Promise<void> {
    const key = this.lastConfirmedKey(chatId);
    const ttl = 24 * 60 * 60; // 24 hours
    await this.redis.setex(
      key,
      ttl,
      JSON.stringify({
        tipo: transaction.tipo,
        datos: transaction.datos,
      })
    );
  }

  async getLastConfirmed(
    chatId: number
  ): Promise<{ tipo: string; datos: TransactionResult["datos"] } | null> {
    const key = this.lastConfirmedKey(chatId);
    const data = await this.redis.get(key);
    if (!data) {
      return null;
    }
    return JSON.parse(data);
  }

  async clearLastConfirmed(chatId: number): Promise<void> {
    const key = this.lastConfirmedKey(chatId);
    await this.redis.del(key);
  }

  async acquireLock(chatId: number): Promise<boolean> {
    const key = this.lockKey(chatId);
    const result = await this.redis.set(key, "1", "EX", LOCK_TTL, "NX");
    return result === "OK";
  }

  async releaseLock(chatId: number): Promise<void> {
    const key = this.lockKey(chatId);
    await this.redis.del(key);
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
    this.isConnected = false;
    Logger.log("Redis disconnected");
  }
}

export const sessionManager = new SessionManager();
