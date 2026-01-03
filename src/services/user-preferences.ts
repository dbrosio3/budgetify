import { SheetsClient } from "../sheets/client";
import { Logger } from "../utils/logger";
import { config } from "../config";

export type AIProvider = "gemini" | "anthropic";

export class UserPreferencesService {
  private preferencesCache: Map<number, AIProvider> = new Map();
  private sheetsClient: SheetsClient;

  constructor(sheetsClient: SheetsClient) {
    this.sheetsClient = sheetsClient;
  }

  /**
   * Get the AI provider preference for a user, or return the default
   */
  async getAIProvider(chatId: number): Promise<AIProvider> {
    // Check cache first
    if (this.preferencesCache.has(chatId)) {
      return this.preferencesCache.get(chatId)!;
    }

    // Try to read from Sheets
    try {
      const provider = await this.readProviderFromSheets(chatId);
      if (provider) {
        this.preferencesCache.set(chatId, provider);
        return provider;
      }
    } catch (error) {
      Logger.error(`Error reading AI provider preference for chat ${chatId}`, error);
    }

    // Return default provider
    const defaultProvider = config.ai.defaultProvider as AIProvider;
    return defaultProvider;
  }

  /**
   * Set the AI provider preference for a user
   */
  async setAIProvider(chatId: number, provider: AIProvider): Promise<void> {
    // Validate provider
    if (provider !== "gemini" && provider !== "anthropic") {
      throw new Error(`Invalid AI provider: ${provider}. Must be "gemini" or "anthropic"`);
    }

    // Update cache
    this.preferencesCache.set(chatId, provider);

    // Persist to Sheets
    try {
      await this.writeProviderToSheets(chatId, provider);
      Logger.log(`AI provider preference updated for chat ${chatId}: ${provider}`);
    } catch (error) {
      Logger.error(`Error writing AI provider preference for chat ${chatId}`, error);
      // Don't throw - cache is updated, Sheets write can fail gracefully
    }
  }

  /**
   * Read provider preference from Google Sheets
   */
  private async readProviderFromSheets(chatId: number): Promise<AIProvider | null> {
    try {
      const provider = await this.sheetsClient.getUserAIProvider(chatId);
      if (provider === "gemini" || provider === "anthropic") {
        return provider as AIProvider;
      }
      return null;
    } catch (error) {
      Logger.error("Error reading provider from Sheets", error);
      return null;
    }
  }

  /**
   * Write provider preference to Google Sheets
   */
  private async writeProviderToSheets(chatId: number, provider: AIProvider): Promise<void> {
    await this.sheetsClient.setUserAIProvider(chatId, provider);
  }
}

// Export singleton instance (will be initialized in server.ts)
let userPreferencesServiceInstance: UserPreferencesService | null = null;

export function initializeUserPreferences(sheetsClient: SheetsClient): UserPreferencesService {
  userPreferencesServiceInstance = new UserPreferencesService(sheetsClient);
  return userPreferencesServiceInstance;
}

export function getUserPreferences(): UserPreferencesService {
  if (!userPreferencesServiceInstance) {
    throw new Error("UserPreferencesService not initialized. Call initializeUserPreferences first.");
  }
  return userPreferencesServiceInstance;
}

