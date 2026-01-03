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

// Factory function to create the appropriate AI client
export function createAIClient(): AIClient {
  const provider = config.ai.provider;

  if (provider === "anthropic") {
    return new AnthropicClient();
  } else {
    // Default to Gemini
    return new GeminiClient();
  }
}
