import { randomUUID } from "crypto";
import { sessionManager } from "./session-manager";
import { MessageHandlers } from "../bot/handlers";
import { Logger } from "../utils/logger";
import type {
  ConversationSession,
  ConversationMessage,
  AIResponse,
  TransactionResult,
} from "../types";

export interface ConversationResult {
  type: "transaction" | "clarification" | "error" | "session_deleted";
  session: ConversationSession | null;
  response?: AIResponse;
  message?: string;
}

export class ConversationHandler {
  constructor(private messageHandlers: MessageHandlers) {}

  async handleMessage(
    chatId: number,
    text: string,
    messageType: "text" | "image" | "audio" = "text"
  ): Promise<ConversationResult> {
    // Try to acquire lock to prevent race conditions
    const locked = await sessionManager.acquireLock(chatId);
    if (!locked) {
      Logger.warn(`Could not acquire lock for chat ${chatId}`);
      return {
        type: "error",
        session: null,
        message: "Estoy procesando tu mensaje anterior. Esperá un momento.",
      };
    }

    try {
      const session = await sessionManager.getOrCreateSession(chatId);

      // Add user message to history
      const userMessage: ConversationMessage = {
        id: randomUUID(),
        timestamp: Date.now(),
        role: "user",
        content: text,
        messageType,
      };
      await sessionManager.addMessage(chatId, userMessage);

      // Update session state to processing
      await sessionManager.updateState(chatId, "processing");

      // Handle based on current session state
      return await this.processMessage(session, text, chatId);
    } finally {
      await sessionManager.releaseLock(chatId);
    }
  }

  private async processMessage(
    _session: ConversationSession,
    text: string,
    chatId: number
  ): Promise<ConversationResult> {
    // Get fresh session with the new message
    const freshSession = await sessionManager.getOrCreateSession(chatId);

    // Check if this looks like a new transaction when we're awaiting clarification
    if (
      freshSession.state === "awaiting_clarification" &&
      this.looksLikeNewTransaction(text)
    ) {
      Logger.log(`New transaction detected, resetting session for chat ${chatId}`);
      await sessionManager.deleteSession(chatId);
      const newSession = await sessionManager.getOrCreateSession(chatId);
      return this.processNewMessage(newSession, text, chatId);
    }

    // Process based on state
    switch (freshSession.state) {
      case "idle":
      case "processing":
        return this.processNewMessage(freshSession, text, chatId);

      case "awaiting_clarification":
        return this.processClarificationAnswer(freshSession, text, chatId);

      case "awaiting_confirmation":
        // If user sends a message while awaiting confirmation, treat as modification
        return this.processModification(freshSession, text, chatId);

      default:
        return this.processNewMessage(freshSession, text, chatId);
    }
  }

  private async processNewMessage(
    session: ConversationSession,
    text: string,
    chatId: number
  ): Promise<ConversationResult> {
    try {
      const aiResponse = await this.messageHandlers.handleConversationalMessage(
        text,
        chatId,
        session.messages,
        undefined,
        undefined
      );

      return this.handleAIResponse(session, aiResponse, chatId);
    } catch (error) {
      Logger.error("Error processing new message", error);
      await sessionManager.updateState(chatId, "idle");
      return {
        type: "error",
        session: await sessionManager.getSession(chatId),
        message:
          error instanceof Error
            ? error.message
            : "Ocurrió un error procesando tu mensaje.",
      };
    }
  }

  private async processClarificationAnswer(
    session: ConversationSession,
    text: string,
    chatId: number
  ): Promise<ConversationResult> {
    try {
      const aiResponse = await this.messageHandlers.handleConversationalMessage(
        text,
        chatId,
        session.messages,
        session.pendingQuestions,
        session.currentTransaction
      );

      return this.handleAIResponse(session, aiResponse, chatId);
    } catch (error) {
      Logger.error("Error processing clarification answer", error);
      await sessionManager.updateState(chatId, "idle");
      return {
        type: "error",
        session: await sessionManager.getSession(chatId),
        message:
          error instanceof Error
            ? error.message
            : "Ocurrió un error procesando tu respuesta.",
      };
    }
  }

  private async processModification(
    session: ConversationSession,
    text: string,
    chatId: number
  ): Promise<ConversationResult> {
    // When awaiting confirmation, treat the message as additional context
    try {
      const aiResponse = await this.messageHandlers.handleConversationalMessage(
        text,
        chatId,
        session.messages,
        undefined,
        session.currentTransaction
      );

      return this.handleAIResponse(session, aiResponse, chatId);
    } catch (error) {
      Logger.error("Error processing modification", error);
      return {
        type: "error",
        session: await sessionManager.getSession(chatId),
        message:
          error instanceof Error
            ? error.message
            : "Ocurrió un error procesando tu modificación.",
      };
    }
  }

  private async handleAIResponse(
    _session: ConversationSession,
    aiResponse: AIResponse,
    chatId: number
  ): Promise<ConversationResult> {
    // Add assistant message to history
    const assistantMessage: ConversationMessage = {
      id: randomUUID(),
      timestamp: Date.now(),
      role: "assistant",
      content: this.summarizeAIResponse(aiResponse),
    };
    await sessionManager.addMessage(chatId, assistantMessage);

    switch (aiResponse.responseType) {
      case "transaction":
        // Store the transaction and move to awaiting confirmation
        await sessionManager.setCurrentTransaction(chatId, aiResponse.transaction);
        await sessionManager.updateState(chatId, "awaiting_confirmation");

        // If there are follow-up questions, also store those
        if (aiResponse.questions && aiResponse.questions.length > 0) {
          await sessionManager.setPendingQuestions(chatId, aiResponse.questions);
        } else {
          await sessionManager.setPendingQuestions(chatId, []);
        }

        return {
          type: "transaction",
          session: await sessionManager.getSession(chatId),
          response: aiResponse,
        };

      case "clarification":
        // Store partial transaction and pending questions
        if (aiResponse.partialTransaction) {
          await sessionManager.setCurrentTransaction(chatId, aiResponse.partialTransaction);
        }
        await sessionManager.setPendingQuestions(chatId, aiResponse.questions);
        await sessionManager.updateState(chatId, "awaiting_clarification");

        return {
          type: "clarification",
          session: await sessionManager.getSession(chatId),
          response: aiResponse,
        };

      case "error":
        await sessionManager.updateState(chatId, "idle");
        return {
          type: "error",
          session: await sessionManager.getSession(chatId),
          response: aiResponse,
          message: aiResponse.errorMessage,
        };

      default:
        await sessionManager.updateState(chatId, "idle");
        return {
          type: "error",
          session: await sessionManager.getSession(chatId),
          message: "Respuesta inesperada del AI.",
        };
    }
  }

  async handleConfirm(chatId: number): Promise<TransactionResult | null> {
    const session = await sessionManager.getSession(chatId);
    if (!session || !session.currentTransaction) {
      return null;
    }

    const transaction = session.currentTransaction as TransactionResult;

    // Save as last confirmed before deleting session
    await sessionManager.saveLastConfirmed(chatId, transaction);

    // Delete the session (explicit termination)
    await sessionManager.deleteSession(chatId);

    return transaction;
  }

  async handleCancel(chatId: number): Promise<void> {
    // Delete the session (explicit termination)
    await sessionManager.deleteSession(chatId);
  }

  async handleExit(chatId: number): Promise<void> {
    // Delete the session (explicit termination from /exit command)
    await sessionManager.deleteSession(chatId);
    Logger.log(`Session terminated via /exit for chat ${chatId}`);
  }

  async handleClarificationButtonResponse(
    chatId: number,
    questionId: string,
    value: string
  ): Promise<ConversationResult> {
    const session = await sessionManager.getSession(chatId);
    if (!session) {
      return {
        type: "error",
        session: null,
        message: "Tu sesión ha expirado. Por favor, empezá de nuevo.",
      };
    }

    // Find and update the answered question
    if (session.pendingQuestions) {
      const questionIndex = session.pendingQuestions.findIndex(
        (q) => q.id === questionId
      );
      if (questionIndex !== -1) {
        const question = session.pendingQuestions[questionIndex];

        // Update the partial transaction with the answer
        if (session.currentTransaction) {
          const datos = session.currentTransaction.datos || {};
          (datos as Record<string, unknown>)[question.field] = value;
          session.currentTransaction.datos = datos;
          await sessionManager.setCurrentTransaction(chatId, session.currentTransaction);
        }

        // Remove the answered question
        session.pendingQuestions.splice(questionIndex, 1);
        await sessionManager.setPendingQuestions(chatId, session.pendingQuestions);
      }
    }

    // If no more pending questions, re-process to complete the transaction
    if (!session.pendingQuestions || session.pendingQuestions.length === 0) {
      const freshSession = await sessionManager.getOrCreateSession(chatId);
      return this.processNewMessage(
        freshSession,
        `Respondí: ${value}`,
        chatId
      );
    }

    // Still have pending questions, stay in clarification state
    return {
      type: "clarification",
      session: await sessionManager.getSession(chatId),
    };
  }

  private looksLikeNewTransaction(text: string): boolean {
    const textLower = text.toLowerCase();

    // Check for transaction keywords
    const transactionKeywords = [
      "gasto",
      "gasté",
      "pagué",
      "compré",
      "ingreso",
      "cobré",
      "recibí",
      "transferencia",
      "transferí",
      "pasé",
    ];

    const hasTransactionKeyword = transactionKeywords.some((kw) =>
      textLower.includes(kw)
    );

    // Check for numbers (amounts)
    const hasAmount = /\d+(?:[.,]\d+)?/.test(text);

    // If it has both a transaction keyword and an amount, likely a new transaction
    return hasTransactionKeyword && hasAmount;
  }

  private summarizeAIResponse(response: AIResponse): string {
    switch (response.responseType) {
      case "transaction": {
        const t = response.transaction;
        return `${t.tipo}: $${t.datos.monto || 0} - ${t.datos.descripcion || "Sin descripción"}`;
      }
      case "clarification":
        return response.message || "Necesito más información";
      case "error":
        return response.errorMessage || "Error";
      default:
        return "Respuesta procesada";
    }
  }
}
