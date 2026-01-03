function setupFinanceSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = ["GASTOS", "INGRESOS", "TRANSFERENCIAS", "CONFIG"];
  
  sheetNames.forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (sheet) { ss.deleteSheet(sheet); }
    ss.insertSheet(name);
  });

  var colors = { 
    headerBg: "#0f172a", 
    headerText: "#f8fafc", 
    rowOdd: "#f1f5f9",
    // Colores para categorías (versión clara para filas impares)
    categoriaColors: {
      "VIVIENDA": "#e0e7ff",           // Azul claro
      "ALIMENTACIÓN": "#fef3c7",        // Amarillo claro
      "ENTRETENIMIENTO": "#fce7f3",     // Rosa claro
      "TRANSPORTE": "#d1fae5",          // Verde claro
      "IMPUESTOS/LEGALES": "#fee2e2",   // Rojo claro
      "CUIDADO PERSONAL": "#e0f2fe",    // Cyan claro
      "TECNOLOGÍA": "#f3e8ff",          // Púrpura claro
      "REGALOS/OTROS": "#fff7ed"        // Naranja claro
    },
    // Colores más oscuros para filas pares (cebrado)
    categoriaColorsDark: {
      "VIVIENDA": "#c7d2fe",           // Azul más oscuro
      "ALIMENTACIÓN": "#fde68a",        // Amarillo más oscuro
      "ENTRETENIMIENTO": "#f9a8d4",     // Rosa más oscuro
      "TRANSPORTE": "#a7f3d0",          // Verde más oscuro
      "IMPUESTOS/LEGALES": "#fecaca",   // Rojo más oscuro
      "CUIDADO PERSONAL": "#bae6fd",    // Cyan más oscuro
      "TECNOLOGÍA": "#e9d5ff",          // Púrpura más oscuro
      "REGALOS/OTROS": "#fed7aa"        // Naranja más oscuro
    },
    // Colores para cuentas (alternando)
    cuentaColors: ["#ffffff", "#f1f5f9"]
  };

  // --- CONFIGURACIÓN ---
  var config = ss.getSheetByName("CONFIG");
  config.setHiddenGridlines(true);
  
  // CUENTAS
  var cuentas = [
    ["CUENTAS"],
    ["Wise"],
    ["Takenos"],
    ["Binance"],
    ["BBVA"],
    ["MercadoPago"],
    ["Brubank"],
    ["Uala"],
    ["Efectivo"]
  ];
  config.getRange(1, 1, cuentas.length, 1).setValues(cuentas);
  config.getRange(1, 1).setFontWeight("bold");
  
  // Aplicar colores alternados a las cuentas
  for (var i = 2; i <= cuentas.length; i++) {
    var colorIndex = (i - 2) % colors.cuentaColors.length;
    config.getRange(i, 1).setBackground(colors.cuentaColors[colorIndex]);
  }
  
  // CATEGORÍAS (Macro-categorías y subcategorías con emojis)
  var categorias = [
    ["MACRO-CATEGORÍA", "SUBCATEGORÍA"],
    ["VIVIENDA", "🏠 Alquiler"],
    ["VIVIENDA", "🏢 Expensas"],
    ["VIVIENDA", "💡 Servicios (Luz/Gas/Agua)"],
    ["VIVIENDA", "📡 Internet/Cable"],
    ["VIVIENDA", "🔧 Mantenimiento/Reparaciones"],
    ["ALIMENTACIÓN", "🛒 Supermercado"],
    ["ALIMENTACIÓN", "🥬 Verdulería"],
    ["ALIMENTACIÓN", "🥩 Carnicería"],
    ["ALIMENTACIÓN", "🍕 Delivery (PedidosYa/Rappi)"],
    ["ALIMENTACIÓN", "🍽️ Restaurantes"],
    ["ALIMENTACIÓN", "☕ Cafetería/Snacks"],
    ["ENTRETENIMIENTO", "📺 Streaming (Netflix/Spotify)"],
    ["ENTRETENIMIENTO", "🎬 Cine/Teatro"],
    ["ENTRETENIMIENTO", "🍻 Bares/Salidas"],
    ["ENTRETENIMIENTO", "💪 Deportes/Gym"],
    ["ENTRETENIMIENTO", "🎨 Hobbies"],
    ["TRANSPORTE", "⛽ Combustible"],
    ["TRANSPORTE", "🚕 Uber/Cabify/Taxi"],
    ["TRANSPORTE", "🚌 Transporte Público"],
    ["TRANSPORTE", "🅿️ Estacionamiento"],
    ["TRANSPORTE", "🔧 Mantenimiento vehículo"],
    ["IMPUESTOS/LEGALES", "📋 Monotributo"],
    ["IMPUESTOS/LEGALES", "📊 AFIP/Impuestos Varios"],
    ["IMPUESTOS/LEGALES", "👔 Contador/Gestorías"],
    ["CUIDADO PERSONAL", "✂️ Peluquería/Barbería"],
    ["CUIDADO PERSONAL", "💊 Farmacia/Medicamentos"],
    ["CUIDADO PERSONAL", "👕 Ropa/Calzado"],
    ["CUIDADO PERSONAL", "🧴 Cosméticos/Higiene"],
    ["CUIDADO PERSONAL", "🏥 Médicos/Salud"],
    ["TECNOLOGÍA", "📱 Celular/Recargas"],
    ["TECNOLOGÍA", "💻 Software/Suscripciones"],
    ["TECNOLOGÍA", "🖥️ Equipamiento/Hardware"],
    ["REGALOS/OTROS", "🎁 Regalos"],
    ["REGALOS/OTROS", "❤️ Donaciones"],
    ["REGALOS/OTROS", "🐾 Mascotas"],
    ["REGALOS/OTROS", "⚠️ Imprevistos"],
    ["REGALOS/OTROS", "📦 Otros"]
  ];
  
  var catsRange = config.getRange(1, 2, categorias.length, 2);
  catsRange.setValues(categorias);
  config.getRange(1, 2, 1, 2).setFontWeight("bold");
  
  // Aplicar colores a las categorías según su macro-categoría
  var currentMacro = "";
  for (var i = 2; i <= categorias.length; i++) {
    var macro = categorias[i - 1][0];
    if (macro && colors.categoriaColors[macro]) {
      var color = colors.categoriaColors[macro];
      config.getRange(i, 2, 1, 2).setBackground(color);
      currentMacro = macro;
    }
  }
  
  var rangeCuentas = config.getRange("A2:A" + cuentas.length);
  var rangeMacros = config.getRange("B2:B" + categorias.length);
  var rangeSubcats = config.getRange("C2:C" + categorias.length);

  // --- HOJA GASTOS ---
  var sGastos = ss.getSheetByName("GASTOS");
  var headersGastos = [[
    "FECHA", 
    "DESCRIPCIÓN", 
    "CATEGORIA", 
    "SUBCATEGORÍA", 
    "CUENTA", 
    "MONTO TOTAL", 
    "CUOTAS", 
    "N° CUOTA", 
    "IMP. MENSUAL", 
    "MONEDA", 
    "SPLIT?", 
    "A SPLITWISE", 
    "Link", 
    "Notas"
  ]];
  
  applyUIStyle(sGastos, headersGastos, colors);
  
  // Validaciones
  var ruleCuentas = SpreadsheetApp.newDataValidation().requireValueInRange(rangeCuentas).build();
  var ruleMacros = SpreadsheetApp.newDataValidation().requireValueInRange(rangeMacros).build();
  var ruleSubcats = SpreadsheetApp.newDataValidation().requireValueInRange(rangeSubcats).build();
  var ruleSplit = SpreadsheetApp.newDataValidation().requireValueInList(["Solo mío", "Compartido 50/50"]).build();
  var ruleMoneda = SpreadsheetApp.newDataValidation().requireValueInList(["ARS", "USD", "EUR"]).build();
  
  sGastos.getRange("C2:C1000").setDataValidation(ruleMacros);
  sGastos.getRange("D2:D1000").setDataValidation(ruleSubcats);
  sGastos.getRange("E2:E1000").setDataValidation(ruleCuentas);
  sGastos.getRange("J2:J1000").setDataValidation(ruleMoneda);
  sGastos.getRange("K2:K1000").setDataValidation(ruleSplit);

  // Fórmulas automáticas
  sGastos.getRange("I2:I1000").setFormula('=IFERROR(IF(G2 > 0; F2 / G2; F2); "")');
  sGastos.getRange("L2:L1000").setFormula('=IFERROR(IF(EXACT(K2;"Compartido 50/50"); I2/2; ""); "")');

  // Formatos
  sGastos.getRange("A2:A1000").setNumberFormat("dd/mm/yyyy");
  sGastos.getRange("F2:F1000").setNumberFormat("$#,##0.00");
  sGastos.getRange("I2:I1000").setNumberFormat("$#,##0.00");
  sGastos.getRange("L2:L1000").setNumberFormat("$#,##0.00");
  
  // Anchos de columna
  sGastos.setColumnWidth(1, 90);
  sGastos.setColumnWidth(2, 220);
  sGastos.setColumnWidth(12, 100);
  sGastos.setColumnWidth(13, 150);
  
  // Validación de fechas (entre 2020 y hoy)
  var fechaMin = new Date(2020, 0, 1);
  var fechaMax = new Date();
  var ruleFecha = SpreadsheetApp.newDataValidation()
    .requireDateBetween(fechaMin, fechaMax)
    .setAllowInvalid(false)
    .setHelpText("La fecha debe estar entre 2020 y hoy")
    .build();
  sGastos.getRange("A2:A1000").setDataValidation(ruleFecha);
  
  // Crear mapa de subcategorías con sus colores según macro-categoría
  var subcatColorMap = {};
  categorias.forEach(function(row) {
    var macro = row[0];
    var subcat = row[1];
    if (macro && subcat && macro !== "MACRO-CATEGORÍA" && colors.categoriaColors[macro]) {
      subcatColorMap[subcat] = {
        claro: colors.categoriaColors[macro],
        oscuro: colors.categoriaColorsDark[macro]
      };
    }
  });
  
  // Formatos condicionales: Colores de categorías (considerando cebrado)
  var existingRules = sGastos.getConditionalFormatRules();
  for (var macro in colors.categoriaColors) {
    // Para filas impares (sin cebrado)
    var ruleImpar = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($C2="' + macro + '", ISODD(ROW()))')
      .setBackground(colors.categoriaColors[macro])
      .setRanges([sGastos.getRange("C2:C1000")])
      .build();
    
    // Para filas pares (con cebrado, usar color más oscuro)
    var rulePar = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($C2="' + macro + '", ISEVEN(ROW()))')
      .setBackground(colors.categoriaColorsDark[macro])
      .setRanges([sGastos.getRange("C2:C1000")])
      .build();
    
    existingRules.push(ruleImpar);
    existingRules.push(rulePar);
  }
  
  // Formatos condicionales: Colores de subcategorías (considerando cebrado)
  for (var subcat in subcatColorMap) {
    // Para filas impares
    var ruleSubcatImpar = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($D2="' + subcat + '", ISODD(ROW()))')
      .setBackground(subcatColorMap[subcat].claro)
      .setRanges([sGastos.getRange("D2:D1000")])
      .build();
    
    // Para filas pares
    var ruleSubcatPar = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($D2="' + subcat + '", ISEVEN(ROW()))')
      .setBackground(subcatColorMap[subcat].oscuro)
      .setRanges([sGastos.getRange("D2:D1000")])
      .build();
    
    existingRules.push(ruleSubcatImpar);
    existingRules.push(ruleSubcatPar);
  }
  
  // Formatos condicionales: Gastos grandes
  var ruleGastoGrandeARS = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($F2>50000, $J2="ARS", $F2<>"")')
    .setBackground("#fee2e2")
    .setFontColor("#991b1b")
    .setRanges([sGastos.getRange("A2:N1000")])
    .build();
  
  var ruleGastoGrandeUSD = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($F2>500, $J2="USD", $F2<>"")')
    .setBackground("#fee2e2")
    .setFontColor("#991b1b")
    .setRanges([sGastos.getRange("A2:N1000")])
    .build();
  
  existingRules.push(ruleGastoGrandeARS);
  existingRules.push(ruleGastoGrandeUSD);
  sGastos.setConditionalFormatRules(existingRules);
  
  // Proteger columnas con fórmulas (I y L)
  try {
    var protectionI = sGastos.getRange("I2:I1000").protect().setDescription("Fórmula automática IMP. MENSUAL");
    var protectionL = sGastos.getRange("L2:L1000").protect().setDescription("Fórmula automática A SPLITWISE");
    protectionI.removeEditors(protectionI.getEditors());
    protectionL.removeEditors(protectionL.getEditors());
    if (protectionI.canDomainEdit()) {
      protectionI.setDomainEdit(false);
    }
    if (protectionL.canDomainEdit()) {
      protectionL.setDomainEdit(false);
    }
  } catch (e) {
    Logger.log("No se pudieron proteger las celdas: " + e.message);
  }

  // --- HOJA INGRESOS ---
  var sIngresos = ss.getSheetByName("INGRESOS");
  var headersIng = [["FECHA", "FUENTE", "CUENTA DESTINO", "MONTO BRUTO", "MONEDA", "COTIZACIÓN", "TOTAL (ARS)"]];
  applyUIStyle(sIngresos, headersIng, colors);
  
  // Validaciones
  var ruleCuentasIng = SpreadsheetApp.newDataValidation().requireValueInRange(rangeCuentas).build();
  var ruleMonedaIng = SpreadsheetApp.newDataValidation().requireValueInList(["ARS", "USD", "EUR"]).build();
  
  sIngresos.getRange("C2:C1000").setDataValidation(ruleCuentasIng);
  sIngresos.getRange("E2:E1000").setDataValidation(ruleMonedaIng);
  
  // Fórmula para conversión
  sIngresos.getRange("G2:G1000").setFormula('=IFERROR(IF(E2="USD"; D2*F2; IF(E2="EUR"; D2*F2; D2)); "")');
  
  // Formatos
  sIngresos.getRange("A2:A1000").setNumberFormat("dd/mm/yyyy");
  sIngresos.getRange("D2:D1000").setNumberFormat("$#,##0.00");
  sIngresos.getRange("F2:F1000").setNumberFormat("#,##0.00");
  sIngresos.getRange("G2:G1000").setNumberFormat("$#,##0.00");
  
  // Validación de fechas (entre 2020 y hoy)
  var fechaMinIng = new Date(2020, 0, 1);
  var fechaMaxIng = new Date();
  var ruleFechaIng = SpreadsheetApp.newDataValidation()
    .requireDateBetween(fechaMinIng, fechaMaxIng)
    .setAllowInvalid(false)
    .setHelpText("La fecha debe estar entre 2020 y hoy")
    .build();
  sIngresos.getRange("A2:A1000").setDataValidation(ruleFechaIng);
  
  // Formato condicional: Ingresos grandes
  var existingRulesIng = sIngresos.getConditionalFormatRules();
  var ruleIngresoGrande = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($G2>100000, $G2<>"")')
    .setBackground("#d1fae5")
    .setFontColor("#065f46")
    .setRanges([sIngresos.getRange("A2:G1000")])
    .build();
  existingRulesIng.push(ruleIngresoGrande);
  sIngresos.setConditionalFormatRules(existingRulesIng);
  
  // Proteger columna con fórmula (G)
  try {
    var protectionG = sIngresos.getRange("G2:G1000").protect().setDescription("Fórmula automática TOTAL (ARS)");
    protectionG.removeEditors(protectionG.getEditors());
    if (protectionG.canDomainEdit()) {
      protectionG.setDomainEdit(false);
    }
  } catch (e) {
    Logger.log("No se pudo proteger la columna G: " + e.message);
  }

  // --- HOJA TRANSFERENCIAS ---
  var sTrans = ss.getSheetByName("TRANSFERENCIAS");
  var headersTrans = [["FECHA", "ORIGEN", "MONTO SALIDA", "DESTINO", "MONTO ENTRADA", "BRECHA"]];
  applyUIStyle(sTrans, headersTrans, colors);
  
  // Validaciones
  var ruleCuentasTrans = SpreadsheetApp.newDataValidation().requireValueInRange(rangeCuentas).build();
  sTrans.getRange("B2:B1000").setDataValidation(ruleCuentasTrans);
  sTrans.getRange("D2:D1000").setDataValidation(ruleCuentasTrans);
  
  // Fórmula para brecha
  sTrans.getRange("F2:F1000").setFormula('=IFERROR(IF(C2>0;((E2-C2)/C2)*100;"");"")');
  
  // Formatos
  sTrans.getRange("A2:A1000").setNumberFormat("dd/mm/yyyy");
  sTrans.getRange("C2:C1000").setNumberFormat("$#,##0.00");
  sTrans.getRange("E2:E1000").setNumberFormat("$#,##0.00");
  sTrans.getRange("F2:F1000").setNumberFormat("0.00%");
  
  // Validación de fechas (entre 2020 y hoy)
  var fechaMinTrans = new Date(2020, 0, 1);
  var fechaMaxTrans = new Date();
  var ruleFechaTrans = SpreadsheetApp.newDataValidation()
    .requireDateBetween(fechaMinTrans, fechaMaxTrans)
    .setAllowInvalid(false)
    .setHelpText("La fecha debe estar entre 2020 y hoy")
    .build();
  sTrans.getRange("A2:A1000").setDataValidation(ruleFechaTrans);
  
  // Formato condicional: Brechas significativas
  var existingRulesTrans = sTrans.getConditionalFormatRules();
  var ruleBrechaAlta = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($F2>5, $F2<>"")')
    .setBackground("#fef3c7")
    .setFontColor("#92400e")
    .setRanges([sTrans.getRange("A2:F1000")])
    .build();
  
  var ruleBrechaBaja = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($F2<-5, $F2<>"")')
    .setBackground("#fef3c7")
    .setFontColor("#92400e")
    .setRanges([sTrans.getRange("A2:F1000")])
    .build();
  
  existingRulesTrans.push(ruleBrechaAlta);
  existingRulesTrans.push(ruleBrechaBaja);
  sTrans.setConditionalFormatRules(existingRulesTrans);
  
  // Proteger columna con fórmula (F)
  try {
    var protectionF = sTrans.getRange("F2:F1000").protect().setDescription("Fórmula automática BRECHA %");
    protectionF.removeEditors(protectionF.getEditors());
    if (protectionF.canDomainEdit()) {
      protectionF.setDomainEdit(false);
    }
  } catch (e) {
    Logger.log("No se pudo proteger la columna F: " + e.message);
  }

  // --- HOJA MIS_DATOS ---
  crearHojaMisDatos(ss, colors);

  SpreadsheetApp.getUi().alert("Spreadsheet actualizado.");
}

// ============================================================
// VALIDACIÓN DINÁMICA DE SUBCATEGORÍAS
// ============================================================
function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var row = range.getRow();
  var col = range.getColumn();
  
  // Solo procesar si es la hoja GASTOS y se editó la columna C (CATEGORIA)
  if (sheet.getName() !== "GASTOS" || col !== 3 || row < 2) {
    return;
  }
  
  try {
    var ss = e.source;
    var config = ss.getSheetByName("CONFIG");
    if (!config) {
      return;
    }
    
    var macroCategoria = sheet.getRange(row, col).getValue();
    if (!macroCategoria) {
      // Si se borró la categoría, limpiar la subcategoría
      sheet.getRange(row, col + 1).clearContent();
      return;
    }
    
    // Obtener todas las subcategorías de esta macro-categoría
    var categoriasData = config.getRange("B2:C" + (config.getLastRow())).getValues();
    var subcategoriasFiltradas = [];
    
    categoriasData.forEach(function(rowData) {
      if (rowData[0] === macroCategoria && rowData[1]) {
        subcategoriasFiltradas.push(rowData[1]);
      }
    });
    
    if (subcategoriasFiltradas.length === 0) {
      return;
    }
    
    // Crear rango dinámico con las subcategorías filtradas
    // Usamos una hoja auxiliar temporal o creamos el rango directamente
    var subcatRange = config.getRange("C2:C" + (config.getLastRow()));
    var allSubcats = subcatRange.getValues().flat();
    var matchingRows = [];
    
    categoriasData.forEach(function(rowData, idx) {
      if (rowData[0] === macroCategoria) {
        matchingRows.push(config.getRange(idx + 2, 3));
      }
    });
    
    if (matchingRows.length > 0) {
      // Crear validación con las subcategorías filtradas
      var ruleSubcat = SpreadsheetApp.newDataValidation()
        .requireValueInList(subcategoriasFiltradas)
        .setAllowInvalid(false)
        .build();
      
      sheet.getRange(row, col + 1).setDataValidation(ruleSubcat);
      
      // Limpiar subcategoría si no corresponde a la nueva macro
      var currentSubcat = sheet.getRange(row, col + 1).getValue();
      if (currentSubcat && subcategoriasFiltradas.indexOf(currentSubcat) === -1) {
        sheet.getRange(row, col + 1).clearContent();
      }
    }
  } catch (error) {
    Logger.log("Error en onEdit: " + error.message);
  }
}

function crearHojaMisDatos(ss, colors) {
  let sheet = ss.getSheetByName("MIS_DATOS");
  
  // Si ya existe, no hacer nada
  if (sheet) {
    return;
  }
  
  // Crear la hoja
  sheet = ss.insertSheet("MIS_DATOS");
  sheet.setHiddenGridlines(true);
  
  // Datos
  const datos = [
    ["Campo", "Valor"],
    ["Nombre", "TU NOMBRE COMPLETO"],
    ["Alias", "tu.alias.mp, otro.alias"],
    ["CBU/CVU", ""],
    ["CUIT/CUIL", ""]
  ];
  
  sheet.getRange(1, 1, datos.length, 2).setValues(datos);
  
  // Formato header
  sheet.getRange("A1:B1")
    .setBackground(colors.headerBg)
    .setFontColor(colors.headerText)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  
  sheet.getRange("A2:A5").setFontWeight("bold").setFontColor(colors.headerText);
  
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 350);
}

function applyUIStyle(sheet, headers, colors) {
  var range = sheet.getRange(1, 1, 1, headers[0].length);
  range.setValues(headers)
    .setBackground(colors.headerBg)
    .setFontColor(colors.headerText)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(1);
  
  // Agregar filtros automáticos
  sheet.getRange(1, 1, 1, headers[0].length).createFilter();
  
  var bodyRange = sheet.getRange(2, 1, 999, headers[0].length);
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=AND($A2<>\"\"; ISEVEN(ROW()))")
    .setBackground(colors.rowOdd)
    .setRanges([bodyRange])
    .build();
  sheet.setConditionalFormatRules([rule]);
}
