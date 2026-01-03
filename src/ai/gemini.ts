import axios from "axios";
import { config } from "../config";
import { Logger } from "../utils/logger";
import { GeminiAPIError } from "../utils/errors";
import { ImageData, AudioData, GeminiResponse, GeminiErrorDetail } from "../types";
import { AIClient } from "./client";

export class GeminiClient implements AIClient {
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = config.ai.gemini.apiKey;
    this.modelName = config.ai.gemini.modelName;
    this.baseUrl = "https://generativelanguage.googleapis.com/v1";
  }

  async generateContent(prompt: string): Promise<string> {
    try {
      const url = `${this.baseUrl}/models/${this.modelName}:generateContent?key=${this.apiKey}`;
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
      };

      const response = await axios.post<GeminiResponse>(url, payload);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const json: GeminiResponse = response.data;

      if (response.status !== 200 || json.error) {
        const errorMsg = json.error ? JSON.stringify(json.error) : "Unknown error";
        throw new GeminiAPIError(`Gemini API Error: ${errorMsg}`, response.status);
      }

      if (!json.candidates || json.candidates.length === 0) {
        throw new GeminiAPIError("Gemini API Error: No candidates in response");
      }

      const text = json.candidates[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new GeminiAPIError("Gemini API Error: No text in response");
      }

      return text;
    } catch (error) {
      Logger.error("Error calling Gemini API", error);
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        const errorData = error.response?.data as GeminiResponse | undefined;
        const geminiError = errorData?.error;

        // Extract more detailed error information for rate limits
        if (statusCode === 429 && geminiError) {
          const message = geminiError.message || JSON.stringify(geminiError);
          const details = geminiError.details || [];
          const retryInfo = details.find((d: GeminiErrorDetail) =>
            d["@type"]?.includes("RetryInfo")
          );
          const retryDelay = retryInfo?.retryDelay || null;

          let errorMsg = message;
          if (retryDelay) {
            errorMsg += ` Retry after: ${retryDelay}`;
          }

          throw new GeminiAPIError(errorMsg, statusCode);
        }

        const errorMsg = geminiError ? JSON.stringify(geminiError) : error.message;
        throw new GeminiAPIError(`Gemini API Error: ${errorMsg}`, statusCode);
      }
      throw error;
    }
  }

  async generateContentWithVision(prompt: string, imageData: ImageData): Promise<string> {
    try {
      const url = `${this.baseUrl}/models/${this.modelName}:generateContent?key=${this.apiKey}`;
      const payload = {
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: imageData.mimeType,
                  data: imageData.data,
                },
              },
            ],
          },
        ],
      };

      Logger.log(`Calling Gemini Vision API with model: ${this.modelName}`);
      const response = await axios.post<GeminiResponse>(url, payload);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const json: GeminiResponse = response.data;

      Logger.log(`Gemini Vision response code: ${response.status}`);

      if (response.status !== 200 || json.error) {
        const errorMsg = json.error ? JSON.stringify(json.error) : "Unknown error";
        throw new GeminiAPIError(
          `Gemini Vision Error (${response.status}): ${errorMsg}`,
          response.status
        );
      }

      if (!json.candidates || json.candidates.length === 0) {
        Logger.log("Gemini Vision response without candidates", json);
        throw new GeminiAPIError("Gemini Vision Error: No candidates in response");
      }

      if (!json.candidates[0]?.content?.parts || json.candidates[0].content.parts.length === 0) {
        Logger.log("Gemini Vision unexpected structure", json.candidates[0]);
        throw new GeminiAPIError("Gemini Vision Error: Unexpected response structure");
      }

      const text = json.candidates[0].content.parts[0]?.text;
      if (!text) {
        Logger.log("Gemini Vision response without text", json.candidates[0]);
        throw new GeminiAPIError("Gemini Vision Error: No text in response");
      }

      Logger.log(`Gemini Vision response successful (${text.length} characters)`);
      return text;
    } catch (error) {
      Logger.error("Error calling Gemini Vision API", error);
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        const errorData = error.response?.data as GeminiResponse | undefined;
        const geminiError = errorData?.error;

        // Extract more detailed error information for rate limits
        if (statusCode === 429 && geminiError) {
          const message = geminiError.message || JSON.stringify(geminiError);
          const details = geminiError.details || [];
          const retryInfo = details.find((d: GeminiErrorDetail) =>
            d["@type"]?.includes("RetryInfo")
          );
          const retryDelay = retryInfo?.retryDelay || null;

          let errorMsg = message;
          if (retryDelay) {
            errorMsg += ` Retry after: ${retryDelay}`;
          }

          throw new GeminiAPIError(errorMsg, statusCode);
        }

        const errorMsg = geminiError ? JSON.stringify(geminiError) : error.message;
        throw new GeminiAPIError(`Gemini Vision Error: ${errorMsg}`, statusCode);
      }
      throw error;
    }
  }

  async transcribeAudio(audioData: AudioData): Promise<string> {
    try {
      const url = `${this.baseUrl}/models/${this.modelName}:generateContent?key=${this.apiKey}`;
      const prompt = `Transcribí este audio al español. El usuario está describiendo un gasto, ingreso o transferencia financiera. 
Transcribí TODO el contenido del audio de forma literal y completa, sin resumir ni interpretar.
Si el audio está en otro idioma, traducilo al español primero y luego transcribilo.

IMPORTANTE: 
- El audio está en español (o debe traducirse al español)
- Solo transcribí el texto, no agregues comentarios ni explicaciones adicionales
- Mantené la transcripción exacta de lo que dice el usuario`;

      const payload = {
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: audioData.mimeType,
                  data: audioData.data,
                },
              },
            ],
          },
        ],
      };

      Logger.log(`Calling Gemini Audio API with model: ${this.modelName}`);
      const response = await axios.post<GeminiResponse>(url, payload);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const json: GeminiResponse = response.data;

      Logger.log(`Gemini Audio response code: ${response.status}`);

      if (response.status !== 200 || json.error) {
        const errorMsg = json.error ? JSON.stringify(json.error) : "Unknown error";
        throw new GeminiAPIError(
          `Gemini Audio Error (${response.status}): ${errorMsg}`,
          response.status
        );
      }

      if (!json.candidates || json.candidates.length === 0) {
        Logger.log("Gemini Audio response without candidates", json);
        throw new GeminiAPIError("Gemini Audio Error: No candidates in response");
      }

      if (!json.candidates[0]?.content?.parts || json.candidates[0].content.parts.length === 0) {
        Logger.log("Gemini Audio unexpected structure", json.candidates[0]);
        throw new GeminiAPIError("Gemini Audio Error: Unexpected response structure");
      }

      const text = json.candidates[0].content.parts[0]?.text;
      if (!text) {
        Logger.log("Gemini Audio response without text", json.candidates[0]);
        throw new GeminiAPIError("Gemini Audio Error: No text in response");
      }

      Logger.log(`Transcription successful (${text.length} characters)`);
      return text.trim();
    } catch (error) {
      Logger.error("Error calling Gemini Audio API", error);
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        const errorData = error.response?.data as GeminiResponse | undefined;
        const geminiError = errorData?.error;

        // Extract more detailed error information for rate limits
        if (statusCode === 429 && geminiError) {
          const message = geminiError.message || JSON.stringify(geminiError);
          const details = geminiError.details || [];
          const retryInfo = details.find((d: GeminiErrorDetail) =>
            d["@type"]?.includes("RetryInfo")
          );
          const retryDelay = retryInfo?.retryDelay || null;

          let errorMsg = message;
          if (retryDelay) {
            errorMsg += ` Retry after: ${retryDelay}`;
          }

          throw new GeminiAPIError(errorMsg, statusCode);
        }

        const errorMsg = geminiError ? JSON.stringify(geminiError) : error.message;
        throw new GeminiAPIError(`Gemini Audio Error: ${errorMsg}`, statusCode);
      }
      throw error;
    }
  }
}
