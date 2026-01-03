import { TelegramMessage, TransactionResult } from "../types";
import { TelegramClient } from "./telegram";
import { AIClient } from "../ai/client";
import { PromptBuilder } from "../ai/prompts";
import { SheetsClient } from "../sheets/client";
import { ImageProcessor } from "../services/image-processor";
import { AudioProcessor } from "../services/audio-processor";
import { contextManager } from "../services/context-manager";
import { pendingOperations } from "../services/pending-operations";
import { Logger } from "../utils/logger";

export class MessageHandlers {
  constructor(
    private telegramClient: TelegramClient,
    private aiClient: AIClient,
    private sheetsClient: SheetsClient,
    private imageProcessor: ImageProcessor,
    private audioProcessor: AudioProcessor
  ) {}

  async handleTextMessage(message: TelegramMessage): Promise<TransactionResult> {
    const text = message.text!;
    const chatId = message.chat.id;

    // Get previous context (confirmed transactions)
    const contextoPrevio = contextManager.getContext(chatId);

    // Get last pending operation (unconfirmed, can be modified)
    const operacionPendiente = pendingOperations.getLastPendingOperation(chatId);

    // Get config
    const config = await this.sheetsClient.getConfig();

    // Build prompt (pass both confirmed context and pending operation)
    const prompt = PromptBuilder.buildTextPrompt(
      text,
      config.cuentas,
      config.categoriasMap,
      contextoPrevio,
      operacionPendiente
    );

    // Call AI
    const response = await this.aiClient.generateContent(prompt);

    // Clean response: remove markdown code blocks and trim
    let cleanedResponse = response.replace(/```json|```/g, "").trim();

    // Try to extract JSON if there's text before/after it
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedResponse = jsonMatch[0];
    }

    Logger.log(
      `Cleaned response for parsing (${cleanedResponse.length} chars): ${cleanedResponse.substring(0, 200)}...`
    );

    let result: TransactionResult;
    try {
      result = JSON.parse(cleanedResponse) as TransactionResult;
    } catch (parseError) {
      Logger.error("Error parsing JSON", parseError);
      Logger.error(`Full response: ${response}`);

      // Try to extract JSON more aggressively
      const jsonPattern = /\{[\s\S]{20,}\}/;
      const extractedJson = response.match(jsonPattern);

      if (extractedJson) {
        try {
          result = JSON.parse(extractedJson[0]) as TransactionResult;
          Logger.log("Successfully extracted JSON from response");
        } catch {
          throw new Error(
            `Error al procesar respuesta de IA. La respuesta no es JSON válido: ${parseError instanceof Error ? parseError.message : String(parseError)}\n\nRespuesta recibida: ${cleanedResponse.substring(0, 500)}`
          );
        }
      } else {
        throw new Error(
          `Error al procesar respuesta de IA. La respuesta no es JSON válido: ${parseError instanceof Error ? parseError.message : String(parseError)}\n\nRespuesta recibida: ${cleanedResponse.substring(0, 500)}`
        );
      }
    }

    // Ensure usa_contexto exists
    if (result.usa_contexto === undefined) {
      result.usa_contexto = contextoPrevio !== null;
    }

    // Validate that we have minimum required data for GASTO
    // If the message seems incomplete, use defaults
    if (result.tipo === "GASTO") {
      // If critical fields are missing, try to infer or use defaults
      if (!result.datos.monto || result.datos.monto === 0) {
        // Try to extract number from original text if possible
        const numberMatch = text.match(/(\d+(?:[.,]\d+)?)/);
        if (numberMatch) {
          result.datos.monto = parseFloat(numberMatch[1].replace(",", "."));
        }
      }

      // If description is empty, use a placeholder
      if (!result.datos.descripcion || result.datos.descripcion.trim() === "") {
        result.datos.descripcion = "Pendiente de confirmación";
      }

      // Default values for missing fields
      if (!result.datos.moneda) result.datos.moneda = "ARS";
      if (!result.datos.split) result.datos.split = "Solo mío";
      if (!result.datos.cuotas) result.datos.cuotas = 1;
      if (!result.datos.n_cuota) result.datos.n_cuota = 1;
    }

    return result;
  }

  async handleImageMessage(message: TelegramMessage): Promise<TransactionResult> {
    const photo = message.photo![message.photo!.length - 1];
    const caption = message.caption || "";

    // Download image
    const imageData = await this.imageProcessor.downloadImage(photo.file_id);

    // Get config
    const config = await this.sheetsClient.getConfig();
    const misDatos = await this.sheetsClient.getPersonalData();

    // Build prompt
    const prompt = PromptBuilder.buildVisionPrompt(
      caption,
      config.cuentas,
      config.macroCategorias,
      config.subcategorias,
      config.categoriasMap,
      misDatos
    );

    Logger.log("Calling Gemini Vision...");
    let response: string;
    try {
      response = await this.aiClient.generateContentWithVision(prompt, imageData);
      Logger.log(`Response received from Gemini (${response.length} characters)`);
    } catch (visionError) {
      Logger.error("Error in Gemini Vision", visionError);
      throw new Error(
        `Error al analizar imagen con IA: ${visionError instanceof Error ? visionError.message : String(visionError)}`
      );
    }

    // Parse response
    const cleanedResponse = response.replace(/```json|```/g, "").trim();
    Logger.log(
      `Cleaned response for parsing (${cleanedResponse.length} chars): ${cleanedResponse.substring(0, 200)}...`
    );

    let result: TransactionResult;
    try {
      result = JSON.parse(cleanedResponse) as TransactionResult;
    } catch (parseError) {
      Logger.error("Error parsing JSON", parseError);
      throw new Error(
        `Error al procesar respuesta de IA. La respuesta no es JSON válido: ${parseError instanceof Error ? parseError.message : String(parseError)}\n\nRespuesta recibida: ${cleanedResponse.substring(0, 500)}`
      );
    }

    // Add alerts if needed
    if (
      result.confianza === "BAJA" ||
      (result.campos_faltantes && result.campos_faltantes.length > 0)
    ) {
      result.alerta = `⚠️ Confianza ${result.confianza}. Campos dudosos: ${result.campos_faltantes?.join(", ") || ""}`;
    }
    if (result.razonamiento) {
      result.alerta = (result.alerta || "") + `\n\n💡 ${result.razonamiento}`;
    }

    return result;
  }

  async handleAudioMessage(message: TelegramMessage): Promise<TransactionResult> {
    const chatId = message.chat.id;
    const audioFile = message.voice || message.audio!;

    // Validate file size (max 20MB)
    const maxFileSize = 20 * 1024 * 1024; // 20MB in bytes
    if (audioFile.file_size && audioFile.file_size > maxFileSize) {
      throw new Error(
        `El archivo de audio es demasiado grande (${Math.round(audioFile.file_size / 1024 / 1024)}MB). Máximo permitido: 20MB`
      );
    }

    // Download audio
    const audioData = await this.audioProcessor.downloadAudio(audioFile.file_id);

    // Transcribe with Gemini
    const textoTranscrito = await this.aiClient.transcribeAudio(audioData);
    Logger.log(`Transcribed text: ${textoTranscrito}`);

    if (!textoTranscrito || textoTranscrito.trim() === "") {
      throw new Error(
        "No se pudo transcribir el audio. Asegurate de que el audio sea claro y esté en español."
      );
    }

    // Process transcribed text as if it were a text message
    const contextoPrevio = contextManager.getContext(chatId);
    const operacionPendiente = pendingOperations.getLastPendingOperation(chatId);
    const config = await this.sheetsClient.getConfig();

    const prompt = PromptBuilder.buildTextPrompt(
      textoTranscrito,
      config.cuentas,
      config.categoriasMap,
      contextoPrevio,
      operacionPendiente
    );

    const response = await this.aiClient.generateContent(prompt);
    const cleanedResponse = response.replace(/```json|```/g, "").trim();

    let result: TransactionResult;
    try {
      result = JSON.parse(cleanedResponse) as TransactionResult;
    } catch (parseError) {
      Logger.error("Error parsing JSON", parseError);
      throw new Error(
        `Error al procesar respuesta de IA. La respuesta no es JSON válido: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
    }

    // Ensure usa_contexto exists
    if (result.usa_contexto === undefined) {
      result.usa_contexto = contextoPrevio !== null;
    }

    return result;
  }
}
