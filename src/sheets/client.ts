import { google, sheets_v4 } from "googleapis";
import { config } from "../config";
import { Logger } from "../utils/logger";
import { SheetsAPIError } from "../utils/errors";
import {
  CategoryMap,
  PersonalData,
  ConfigData,
  TransactionData,
  GoogleSheetsSpreadsheet,
} from "../types";

export class SheetsClient {
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  private auth: ReturnType<typeof google.auth.GoogleAuth> | null = null;
  private sheets: sheets_v4.Sheets | null = null;
  private spreadsheetId: string;

  constructor() {
    this.spreadsheetId = config.sheets.spreadsheetId;
    void this.initializeAuth();
  }

  private initializeAuth(): void {
    try {
      // Try to use service account credentials
      if (config.sheets.credentialsPath) {
        this.auth = new google.auth.GoogleAuth({
          keyFile: config.sheets.credentialsPath,
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
      } else {
        // Fallback to environment variable credentials (JSON string)
        const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
        if (credentialsJson) {
          const credentials = JSON.parse(credentialsJson) as Record<string, unknown>;
          this.auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
          });
        } else {
          throw new Error(
            "Google Sheets credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON"
          );
        }
      }

      if (!this.auth) {
        throw new Error("Auth not initialized");
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      this.sheets = google.sheets({ version: "v4", auth: this.auth });
      Logger.log("Google Sheets client initialized");
    } catch (error) {
      Logger.error("Error initializing Google Sheets client", error);
      throw new SheetsAPIError(
        `Failed to initialize Sheets client: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getConfig(): Promise<ConfigData> {
    if (!this.sheets) {
      throw new SheetsAPIError("Sheets client not initialized");
    }
    try {
      const sheetName = "CONFIG";
      const lastRow = await this.getLastRow(sheetName);

      // Read accounts (column A)
      const accountsRange = `${sheetName}!A2:A${lastRow}`;
      const accountsResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: accountsRange,
      });
      const cuentas = ((accountsResponse.data.values as unknown[][]) || [])
        .flat()
        .filter((v): v is string => typeof v === "string" && v !== "");

      // Read macro categories (column B)
      const macroRange = `${sheetName}!B2:B${lastRow}`;
      const macroResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: macroRange,
      });
      const macroCategorias = ((macroResponse.data.values as unknown[][]) || [])
        .flat()
        .filter((v): v is string => typeof v === "string" && v !== "");

      // Read subcategories (column C)
      const subRange = `${sheetName}!C2:C${lastRow}`;
      const subResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: subRange,
      });
      const subcategorias = ((subResponse.data.values as unknown[][]) || [])
        .flat()
        .filter((v): v is string => typeof v === "string" && v !== "");

      // Create category map
      const categoriasMap = await this.createCategoryMap(sheetName, lastRow);

      return {
        cuentas,
        macroCategorias,
        subcategorias,
        categoriasMap,
      };
    } catch (error) {
      Logger.error("Error reading config from Sheets", error);
      throw new SheetsAPIError(
        `Failed to read config: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getPersonalData(): Promise<PersonalData> {
    if (!this.sheets) {
      throw new SheetsAPIError("Sheets client not initialized");
    }
    try {
      const sheetName = "MIS_DATOS";

      // Check if sheet exists
      const sheetExists = await this.sheetExists(sheetName);
      if (!sheetExists) {
        Logger.warn("MIS_DATOS sheet not found, using defaults");
        return {
          nombre: "TU NOMBRE COMPLETO",
          alias: ["tu.alias.mp", "tu.cvu"],
          cbu: "",
          cuit: "",
        };
      }

      // Read personal data
      const range = `${sheetName}!B2:B5`;
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });

      const values = (response.data.values as unknown[][]) || [];
      const nombre = (values[0]?.[0] as string) || "Usuario";
      const aliasStr = (values[1]?.[0] as string) || "";
      const alias = aliasStr
        .split(",")
        .map((a: string) => a.trim())
        .filter((a: string) => a);
      const cbu = (values[2]?.[0] as string) || "";
      const cuit = (values[3]?.[0] as string) || "";

      return { nombre, alias, cbu, cuit };
    } catch (error) {
      Logger.error("Error reading personal data from Sheets", error);
      return {
        nombre: "TU NOMBRE COMPLETO",
        alias: ["tu.alias.mp", "tu.cvu"],
        cbu: "",
        cuit: "",
      };
    }
  }

  async createCategoryMap(sheetName: string, lastRow: number): Promise<CategoryMap> {
    if (!this.sheets) {
      throw new SheetsAPIError("Sheets client not initialized");
    }
    try {
      const range = `${sheetName}!B2:C${lastRow}`;
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });

      const mapa: CategoryMap = {};
      const rows = (response.data.values as unknown[][]) || [];

      for (const row of rows) {
        const macro = row[0] as string;
        const sub = row[1] as string;
        if (macro && sub) {
          if (!mapa[macro]) {
            mapa[macro] = [];
          }
          mapa[macro].push(sub);
        }
      }

      return mapa;
    } catch (error) {
      Logger.error("Error creating category map", error);
      throw new SheetsAPIError(
        `Failed to create category map: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async findSubcategoryWithEmoji(subcategoriaSinEmoji: string, sheetName: string): Promise<string> {
    if (!subcategoriaSinEmoji || !this.sheets) return "";

    try {
      const lastRow = await this.getLastRow(sheetName);
      const range = `${sheetName}!C2:C${lastRow}`;
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });

      const subcategorias = ((response.data.values as unknown[][]) || []).flat() as string[];

      // Extract text without emoji helper
      const extractTextWithoutEmoji = (text: string): string => {
        if (!text) return "";
        return text
          .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "")
          .trim();
      };

      // Exact match first
      for (const subcatConEmoji of subcategorias) {
        if (!subcatConEmoji || typeof subcatConEmoji !== "string") continue;
        const textoLimpio = extractTextWithoutEmoji(subcatConEmoji);
        if (textoLimpio.toLowerCase() === subcategoriaSinEmoji.toLowerCase()) {
          return subcatConEmoji;
        }
      }

      // Partial match
      for (const subcatConEmoji of subcategorias) {
        if (!subcatConEmoji || typeof subcatConEmoji !== "string") continue;
        const textoLimpio = extractTextWithoutEmoji(subcatConEmoji);
        if (
          textoLimpio.toLowerCase().includes(subcategoriaSinEmoji.toLowerCase()) ||
          subcategoriaSinEmoji.toLowerCase().includes(textoLimpio.toLowerCase())
        ) {
          return subcatConEmoji;
        }
      }

      return subcategoriaSinEmoji;
    } catch (error) {
      Logger.error("Error finding subcategory with emoji", error);
      return subcategoriaSinEmoji;
    }
  }

  async findLastRowWithData(sheetName: string): Promise<number> {
    if (!this.sheets) {
      throw new SheetsAPIError("Sheets client not initialized");
    }
    try {
      // Get all values in column A
      const range = `${sheetName}!A:A`;
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });

      const values = (response.data.values as unknown[][]) || [];

      // Find last non-empty row
      for (let i = values.length - 1; i >= 0; i--) {
        const row = values[i];
        if (row && row[0]) {
          const cellValue = row[0];
          if (typeof cellValue === "string" && cellValue.trim() !== "") {
            return i + 1; // +1 because Sheets is 1-indexed
          }
          if (typeof cellValue === "number" || typeof cellValue === "boolean") {
            return i + 1; // +1 because Sheets is 1-indexed
          }
        }
      }

      return 1; // Header row
    } catch (error) {
      Logger.error("Error finding last row with data", error);
      return 1;
    }
  }

  async writeGasto(data: TransactionData): Promise<void> {
    if (!this.sheets) {
      throw new SheetsAPIError("Sheets client not initialized");
    }
    try {
      const sheetName = "GASTOS";
      const lastRow = await this.findLastRowWithData(sheetName);
      const newRow = lastRow + 1;

      // Find subcategory with emoji
      const subcategoriaConEmoji = await this.findSubcategoryWithEmoji(data.subcategoria, "CONFIG");

      // Parse date
      let fecha: Date;
      if (typeof data.fecha === "string") {
        const partes = data.fecha.split("/");
        if (partes.length === 3) {
          const dia = parseInt(partes[0], 10);
          const mes = parseInt(partes[1], 10);
          const año = parseInt(partes[2], 10);
          fecha = new Date(año, mes - 1, dia);
        } else {
          fecha = new Date();
        }
      } else {
        fecha = new Date();
      }

      // Write data in two parts to avoid protected formula columns I and L
      // First: Write columns A-H (date through n_cuota)
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A${newRow}:H${newRow}`,
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [
            [
              fecha,
              data.descripcion.trim(),
              data.macro_categoria.trim(),
              subcategoriaConEmoji,
              data.cuenta.trim(),
              parseFloat(data.monto),
              parseInt(data.cuotas || 1, 10),
              parseInt(data.n_cuota || 1, 10),
            ],
          ],
        },
      });

      // Second: Write columns J, K (moneda, split)
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!J${newRow}:K${newRow}`,
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [[data.moneda || "ARS", data.split || "Solo mío"]],
        },
      });

      // Third: Write columns M, N (link, notas)
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!M${newRow}:N${newRow}`,
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [[(data.link || "").trim(), (data.notas || "").trim()]],
        },
      });

      // Set formulas for protected columns I and L
      // Note: These will only work if the service account has permission to edit protected ranges
      // If these fail, the data is still written - formulas can be added manually or protection adjusted
      try {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!I${newRow}`,
          valueInputOption: "USER_ENTERED",
          resource: {
            values: [[`=IFERROR(IF(G${newRow} > 0, F${newRow} / G${newRow}, F${newRow}), "")`]],
          },
        });
      } catch (formulaError) {
        Logger.warn(
          `Could not write formula to column I (row ${newRow}): ${formulaError instanceof Error ? formulaError.message : String(formulaError)}`
        );
        Logger.warn(
          "Make sure the service account has permission to edit protected ranges, or add the formula manually"
        );
      }

      try {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!L${newRow}`,
          valueInputOption: "USER_ENTERED",
          resource: {
            values: [[`=IFERROR(IF(EXACT(K${newRow},"Compartido 50/50"), I${newRow}/2, ""), "")`]],
          },
        });
      } catch (formulaError) {
        Logger.warn(
          `Could not write formula to column L (row ${newRow}): ${formulaError instanceof Error ? formulaError.message : String(formulaError)}`
        );
        Logger.warn(
          "Make sure the service account has permission to edit protected ranges, or add the formula manually"
        );
      }

      Logger.log(`✅ GASTO written successfully in row ${newRow}`);
    } catch (error) {
      Logger.error("Error writing GASTO to Sheets", error);
      throw new SheetsAPIError(
        `Failed to write GASTO: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async writeIngreso(data: TransactionData): Promise<void> {
    if (!this.sheets) {
      throw new SheetsAPIError("Sheets client not initialized");
    }
    try {
      const sheetName = "INGRESOS";
      const lastRow = await this.findLastRowWithData(sheetName);
      const newRow = lastRow + 1;

      // Parse date
      let fecha: Date;
      if (typeof data.fecha === "string") {
        const partes = data.fecha.split("/");
        if (partes.length === 3) {
          const dia = parseInt(partes[0], 10);
          const mes = parseInt(partes[1], 10);
          const año = parseInt(partes[2], 10);
          fecha = new Date(año, mes - 1, dia);
        } else {
          fecha = new Date();
        }
      } else {
        fecha = new Date();
      }

      const rowData = [
        fecha,
        (data.fuente || data.descripcion || "").trim(),
        data.cuenta.trim(),
        parseFloat(data.monto),
        data.moneda || "ARS",
        parseFloat(data.cotizacion || 1),
        "", // G: TOTAL (ARS) - formula
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A${newRow}:G${newRow}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [rowData] },
      });

      // Set formula
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!G${newRow}`,
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [
            [
              `=IFERROR(IF(E${newRow}="USD", D${newRow}*F${newRow}, IF(E${newRow}="EUR", D${newRow}*F${newRow}, D${newRow})), "")`,
            ],
          ],
        },
      });

      Logger.log(`✅ INGRESO written successfully in row ${newRow}`);
    } catch (error) {
      Logger.error("Error writing INGRESO to Sheets", error);
      throw new SheetsAPIError(
        `Failed to write INGRESO: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async writeTransferencia(data: TransactionData): Promise<void> {
    if (!this.sheets) {
      throw new SheetsAPIError("Sheets client not initialized");
    }
    try {
      const sheetName = "TRANSFERENCIAS";
      const lastRow = await this.findLastRowWithData(sheetName);
      const newRow = lastRow + 1;

      // Parse date
      let fecha: Date;
      if (typeof data.fecha === "string") {
        const partes = data.fecha.split("/");
        if (partes.length === 3) {
          const dia = parseInt(partes[0], 10);
          const mes = parseInt(partes[1], 10);
          const año = parseInt(partes[2], 10);
          fecha = new Date(año, mes - 1, dia);
        } else {
          fecha = new Date();
        }
      } else {
        fecha = new Date();
      }

      const rowData = [
        fecha,
        data.origen.trim(),
        parseFloat(data.monto_salida),
        data.destino.trim(),
        parseFloat(data.monto_entrada),
        "", // F: BRECHA % - formula
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A${newRow}:F${newRow}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [rowData] },
      });

      // Set formula
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!F${newRow}`,
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [[`=IFERROR(IF(C${newRow}>0,((E${newRow}-C${newRow})/C${newRow})*100,""),"")`]],
        },
      });

      Logger.log(`✅ TRANSFERENCIA written successfully in row ${newRow}`);
    } catch (error) {
      Logger.error("Error writing TRANSFERENCIA to Sheets", error);
      throw new SheetsAPIError(
        `Failed to write TRANSFERENCIA: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async getLastRow(sheetName: string): Promise<number> {
    if (!this.sheets) {
      throw new SheetsAPIError("Sheets client not initialized");
    }
    try {
      const range = `${sheetName}!A:A`;
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });
      const values = (response.data.values as unknown[][]) || [];
      return values.length > 0 ? values.length + 1 : 2;
    } catch (error) {
      Logger.error(`Error getting last row for ${sheetName}`, error);
      return 2;
    }
  }

  private async sheetExists(sheetName: string): Promise<boolean> {
    if (!this.sheets) {
      return false;
    }
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });
      const sheets = (response.data.sheets as GoogleSheetsSpreadsheet["sheets"]) || [];
      return sheets.some((sheet) => sheet?.properties?.title === sheetName);
    } catch (error) {
      Logger.error("Error checking if sheet exists", error);
      return false;
    }
  }
}
