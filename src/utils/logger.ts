export class Logger {
  static log(message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`, ...args);
  }

  static error(message: string, error?: Error | null): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ERROR: ${message}`);
    if (error instanceof Error) {
      console.error(`[${timestamp}] Stack:`, error.stack);
    } else if (error) {
      console.error(`[${timestamp}] Error details:`, error);
    }
  }

  static warn(message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] WARN: ${message}`, ...args);
  }
}
