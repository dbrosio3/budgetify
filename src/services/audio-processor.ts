import { TelegramClient } from "../bot/telegram";
import { AudioData } from "../types";
import { Logger } from "../utils/logger";

export class AudioProcessor {
  constructor(private telegramClient: TelegramClient) {}

  async downloadAudio(fileId: string): Promise<AudioData> {
    try {
      // Get file path
      const fileInfo = await this.telegramClient.getFile(fileId);
      const filePath = fileInfo.file_path;

      // Download file
      const buffer = await this.telegramClient.downloadFile(filePath);

      // Convert to base64
      const base64Audio = buffer.toString("base64");

      // Detect MIME type from file extension
      let mimeType = "audio/ogg"; // Default for Telegram voice notes

      if (filePath.toLowerCase().endsWith(".ogg") || filePath.toLowerCase().endsWith(".oga")) {
        mimeType = "audio/ogg";
      } else if (filePath.toLowerCase().endsWith(".mp3")) {
        mimeType = "audio/mpeg";
      } else if (filePath.toLowerCase().endsWith(".m4a")) {
        mimeType = "audio/mp4";
      } else if (filePath.toLowerCase().endsWith(".wav")) {
        mimeType = "audio/wav";
      } else if (filePath.toLowerCase().endsWith(".flac")) {
        mimeType = "audio/flac";
      }

      Logger.log(`Audio downloaded: ${filePath} → MIME type detected: ${mimeType}`);

      return {
        data: base64Audio,
        mimeType,
      };
    } catch (error) {
      Logger.error("Error downloading audio", error);
      throw error;
    }
  }
}

