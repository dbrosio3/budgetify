import { GeminiClient } from "./gemini";
import { AnthropicClient } from "./anthropic";
import { config } from "../config";
import { ImageData, AudioData } from "../types";

// Unified interface for AI clients
export interface AIClient {
  generateContent(prompt: string): Promise<string>;
  generateContentWithVision(prompt: string, imageData: ImageData): Promise<string>;
  transcribeAudio(audioData: AudioData): Promise<string>;
}

export type AIProvider = "gemini" | "anthropic";

// Factory function to create the appropriate AI client
export function createAIClient(provider?: AIProvider): AIClient {
  const selectedProvider = provider || (config.ai.defaultProvider as AIProvider);

  if (selectedProvider === "anthropic") {
    return new AnthropicClient();
  } else {
    // Default to Gemini
    return new GeminiClient();
  }
}

// AI Client Manager - manages AI clients per user/provider
export class AIClientManager {
  private clientCache: Map<AIProvider, AIClient> = new Map();

  /**
   * Get an AI client for the specified provider
   * Uses caching to avoid creating multiple instances
   */
  getClient(provider: AIProvider): AIClient {
    if (!this.clientCache.has(provider)) {
      this.clientCache.set(provider, createAIClient(provider));
    }
    return this.clientCache.get(provider)!;
  }

  /**
   * Clear the client cache (useful for testing or reinitialization)
   */
  clearCache(): void {
    this.clientCache.clear();
  }
}
