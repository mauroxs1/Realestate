// ═══════════════════════════════════════════════════════════════════
// Google Apps Script — Lorenzo Propiedades
// Desplegá como Web App: Ejecutar como "Yo", Acceso "Cualquiera"
// ═══════════════════════════════════════════════════════════════════

const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function doGet(e) {
  // Las propiedades se leen directo desde la API de Inmoup — este endpoint ya no se usa para eso
  return ContentService.createTextOutput(JSON.stringify({ ok: true, info: "Usar Inmoup API para propiedades" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;

  if (action === "addLead") return addLead(data);
  if (action === "updateLead") return updateLead(data);
  if (action === "addVisit") return addVisit(data);

  return ContentService.createTextOutput(JSON.stringify({ error: "acción no reconocida" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── PROPIEDADES ───────────────────────────────────────────────────
function getProperties() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Propiedades");
  if (!sheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);

  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(h => h.toString().trim().toLowerCase()
    .replace(/ /g, "")
    .replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u")
  );

  const properties = rows.slice(1)
    .filter(row => row[0]) // saltar filas vacías
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] ? row[i].toString() : ""; });
      return obj;
    });

  return ContentService.createTextOutput(JSON.stringify(properties))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── LEADS ─────────────────────────────────────────────────────────
function addLead(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss, "Leads", [
    "Fecha", "Nombre", "Teléfono", "Tipo búsqueda", "Tipo propiedad",
    "Ambientes", "Zona", "Presupuesto", "Plazo ingreso", "Estado", "Observaciones"
  ]);

  // Verificar si ya existe el teléfono (actualizar en lugar de duplicar)
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] && rows[i][2].toString() === data.telefono) {
      sheet.getRange(i + 1, 10).setValue(data.estado || rows[i][9]);
      if (data.observaciones) sheet.getRange(i + 1, 11).setValue(data.observaciones);
      return ok();
    }
  }

  sheet.appendRow([
    new Date(), data.nombre, data.telefono, data.tipoBusqueda, data.tipoPropiedad,
    data.ambientes, data.zona, data.presupuesto, data.plazoIngreso,
    data.estado, data.observaciones
  ]);
  return ok();
}

function updateLead(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Leads");
  if (!sheet) return ok();

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] && rows[i][2].toString() === data.telefono) {
      if (data.estado) sheet.getRange(i + 1, 10).setValue(data.estado);
      if (data.observaciones) sheet.getRange(i + 1, 11).setValue(data.observaciones);
      return ok();
    }
  }
  return ok();
}

// ── VISITAS ───────────────────────────────────────────────────────
function addVisit(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss, "Visitas", [
    "Fecha registro", "Nombre", "Teléfono", "Propiedad ID",
    "Descripción propiedad", "Disponibilidad cliente", "Observaciones", "Estado"
  ]);

  sheet.appendRow([
    new Date(), data.nombre, data.telefono, data.propiedadId,
    data.propiedadDescripcion, data.disponibilidad, data.observaciones, "Pendiente confirmación"
  ]);
  return ok();
}

// ── UTILIDADES ────────────────────────────────────────────────────
function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
  return sheet;
}

function ok() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
