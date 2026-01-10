import { TelegramClient } from "../bot/telegram";
import { ImageData } from "../types";
import { Logger } from "../utils/logger";

export class ImageProcessor {
  constructor(private telegramClient: TelegramClient) {}

  async downloadImage(fileId: string): Promise<ImageData> {
    try {
      // Get file path
      const fileInfo = await this.telegramClient.getFile(fileId);
      const filePath = fileInfo.file_path;

      // Download file
      const buffer = await this.telegramClient.downloadFile(filePath);

      // Convert to base64
      const base64Image = buffer.toString("base64");

      // Detect MIME type from file extension
      let mimeType = "image/jpeg"; // Default

      if (filePath.toLowerCase().endsWith(".png")) {
        mimeType = "image/png";
      } else if (
        filePath.toLowerCase().endsWith(".jpg") ||
        filePath.toLowerCase().endsWith(".jpeg")
      ) {
        mimeType = "image/jpeg";
      } else if (filePath.toLowerCase().endsWith(".webp")) {
        mimeType = "image/webp";
      } else if (filePath.toLowerCase().endsWith(".gif")) {
        mimeType = "image/gif";
      }

      Logger.log(`File downloaded: ${filePath} → MIME type detected: ${mimeType}`);

      return {
        data: base64Image,
        mimeType,
      };
    } catch (error) {
      Logger.error("Error downloading image", error);
      throw error;
    }
  }
}

