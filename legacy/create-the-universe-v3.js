function setupFinanceSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = ["GASTOS", "INGRESOS", "TRANSFERENCIAS", "CONFIG"];
  
  sheetNames.forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (sheet) { ss.deleteSheet(sheet); }
    ss.insertSheet(name);
  });

  var colors = { headerBg: "#0f172a", headerText: "#f8fafc", rowOdd: "#f1f5f9" };

  // --- CONFIGURACIÓN ---
  var config = ss.getSheetByName("CONFIG");
  var cuentas = [["🏦 CUENTAS"], ["Wise"], ["Takenos"], ["Binance"], ["BBVA"], ["MercadoPago"], ["Brubank"], ["Uala"], ["Efectivo"]];
  var categorias = [["🏷️ CATEGORÍAS"], ["Alquiler"], ["Monotributo/Impuestos"], ["Súper/Verduleria"], ["Salidas/Cine/Resto"], ["PedidosYa"], ["Servicios/Luz/Gas"], ["Peluqueria"], ["Otros"]];
  config.getRange(1, 1, cuentas.length, 1).setValues(cuentas).setFontWeight("bold");
  config.getRange(1, 2, categorias.length, 1).setValues(categorias).setFontWeight("bold");
  
  var rangeCuentas = config.getRange("A2:A" + cuentas.length);
  var rangeCats = config.getRange("B2:B" + categorias.length);

  // --- HOJA GASTOS (Basada en tu captura image_98e9e1.png) ---
  var sGastos = ss.getSheetByName("GASTOS");
  var headersGastos = [["FECHA", "DESCRIPCIÓN", "CATEGORÍA", "CUENTA", "MONTO TOTAL", "CUOTAS", "N° CUOTA", "IMP. MENSUAL", "MONEDA", "SPLIT?", "A SPLITWISE", "Link", "Notas"]];
  
  applyUIStyle(sGastos, headersGastos, colors);
  
  // Validaciones
  var ruleCuentas = SpreadsheetApp.newDataValidation().requireValueInRange(rangeCuentas).build();
  var ruleCats = SpreadsheetApp.newDataValidation().requireValueInRange(rangeCats).build();
  var ruleSplit = SpreadsheetApp.newDataValidation().requireValueInList(["Solo mío", "Compartido 50/50"]).build();
  var ruleMoneda = SpreadsheetApp.newDataValidation().requireValueInList(["ARS", "USD"]).build();
  
  sGastos.getRange("C2:C1000").setDataValidation(ruleCats);
  sGastos.getRange("D2:D1000").setDataValidation(ruleCuentas);
  sGastos.getRange("I2:I1000").setDataValidation(ruleMoneda);
  sGastos.getRange("J2:J1000").setDataValidation(ruleSplit);

  // TUS FÓRMULAS ACTUALIZADAS
  sGastos.getRange("H2:H1000").setFormula('=IFERROR(IF(F2 > 0; E2 / F2; E2); "")'); 
  sGastos.getRange("K2:K1000").setFormula('=IFERROR(IF(EXACT(J2;"Compartido 50/50"); H2/2; ""); "")');

  // --- HOJA INGRESOS ---
  var sIngresos = ss.getSheetByName("INGRESOS");
  var headersIng = [["FECHA", "FUENTE", "CUENTA DESTINO", "MONTO BRUTO", "MONEDA", "COTIZACIÓN", "TOTAL (ARS)"]];
  applyUIStyle(sIngresos, headersIng, colors);
  sIngresos.getRange("G2:G1000").setFormula('=IFERROR(IF(E2="USD"; D2*F2; D2); "")');

  // --- HOJA TRANSFERENCIAS ---
  var sTrans = ss.getSheetByName("TRANSFERENCIAS");
  var headersTrans = [["FECHA", "ORIGEN", "MONTO SALIDA", "DESTINO", "MONTO ENTRADA", "BRECHA"]];
  applyUIStyle(sTrans, headersTrans, colors);

  // Formato de Columnas para GASTOS
  sGastos.setColumnWidth(1, 90); sGastos.setColumnWidth(2, 220); 
  sGastos.setColumnWidth(12, 100); sGastos.setColumnWidth(13, 150);

  SpreadsheetApp.getUi().alert("✨ Spreadsheet actualizado según image_98e9e1.png");
}

function applyUIStyle(sheet, headers, colors) {
  var range = sheet.getRange(1, 1, 1, headers[0].length);
  range.setValues(headers).setBackground(colors.headerBg).setFontColor(colors.headerText).setFontWeight("bold").setHorizontalAlignment("center");
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(1);
  var bodyRange = sheet.getRange(2, 1, 999, headers[0].length);
  var rule = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied("=AND($A2<>\u0022\u0022; ISEVEN(ROW()))").setBackground(colors.rowOdd).setRanges([bodyRange]).build();
  sheet.setConditionalFormatRules([rule]);
}
