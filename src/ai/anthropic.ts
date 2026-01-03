import axios from "axios";
import { config } from "../config";
import { Logger } from "../utils/logger";
import { GeminiAPIError } from "../utils/errors";
import { ImageData, AudioData, AnthropicResponse } from "../types";

export class AnthropicClient {
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = config.ai.anthropic.apiKey;
    this.modelName = config.ai.anthropic.modelName;
    this.baseUrl = "https://api.anthropic.com/v1";
  }

  async generateContent(prompt: string): Promise<string> {
    try {
      const url = `${this.baseUrl}/messages`;
      const payload = {
        model: this.modelName,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      };

      const response = await axios.post(url, payload, {
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const responseData: AnthropicResponse = response.data;

      if (response.status !== 200 || responseData.error) {
        const errorMsg = responseData.error ? JSON.stringify(responseData.error) : "Unknown error";
        throw new GeminiAPIError(`Anthropic API Error: ${errorMsg}`, response.status);
      }

      const text = responseData.content?.[0]?.text;
      if (!text) {
        throw new GeminiAPIError("Anthropic API Error: No text in response");
      }

      return text;
    } catch (error) {
      Logger.error("Error calling Anthropic API", error);
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        const errorData = error.response?.data as AnthropicResponse | undefined;
        const anthropicError = errorData?.error;

        // Handle rate limits
        if (statusCode === 429) {
          const message = anthropicError?.message || "Rate limit exceeded";
          throw new GeminiAPIError(`Anthropic API Error: ${message}`, statusCode);
        }

        const errorMsg = anthropicError ? JSON.stringify(anthropicError) : error.message;
        throw new GeminiAPIError(`Anthropic API Error: ${errorMsg}`, statusCode);
      }
      throw error;
    }
  }

  async generateContentWithVision(prompt: string, imageData: ImageData): Promise<string> {
    try {
      const url = `${this.baseUrl}/messages`;
      const payload = {
        model: this.modelName,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: imageData.mimeType,
                  data: imageData.data,
                },
              },
            ],
          },
        ],
      };

      Logger.log(`Calling Anthropic Vision API with model: ${this.modelName}`);
      const response = await axios.post(url, payload, {
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      });

      Logger.log(`Anthropic Vision response code: ${response.status}`);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const responseData: AnthropicResponse = response.data;

      if (response.status !== 200 || responseData.error) {
        const errorMsg = responseData.error ? JSON.stringify(responseData.error) : "Unknown error";
        throw new GeminiAPIError(
          `Anthropic Vision Error (${response.status}): ${errorMsg}`,
          response.status
        );
      }

      const text = responseData.content?.[0]?.text;
      if (!text) {
        Logger.log("Anthropic Vision response without text", responseData);
        throw new GeminiAPIError("Anthropic Vision Error: No text in response");
      }

      Logger.log(`Anthropic Vision response successful (${text.length} characters)`);
      return text;
    } catch (error) {
      Logger.error("Error calling Anthropic Vision API", error);
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        const errorData = error.response?.data as AnthropicResponse | undefined;
        const anthropicError = errorData?.error;
        const errorMsg = anthropicError ? JSON.stringify(anthropicError) : error.message;
        throw new GeminiAPIError(`Anthropic Vision Error: ${errorMsg}`, statusCode);
      }
      throw error;
    }
  }

  transcribeAudio(_audioData: AudioData): Promise<string> {
    // Anthropic doesn't have native audio transcription
    // We'll need to convert audio to text using a different service or skip this
    // For now, throw an error suggesting to use Gemini for audio
    return Promise.reject(
      new Error(
        "Anthropic API no soporta transcripción de audio directamente. Por favor, usá Gemini para mensajes de audio o convertí el audio a texto primero."
      )
    );
  }
}
