// ═══════════════════════════════════════════════════════════════
// RAAD DASHBOARD — Apps Script v2
// يقرأ من التابز الأصلية: Raad Dojo / Do run / Taskeen / Monthly Outcome
// ═══════════════════════════════════════════════════════════════

const SHEET_ID = '1W5uAQdi_7iO0iHpaTCEWKYU1zI31GcJO';

function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const result = {
      dojo:    readDojo(ss),
      dorun:   readTrading(ss, 'Do run'),
      taskeen: readTrading(ss, 'Taskeen'),
      expenses: readExpenses(ss),
      totals:  readTotals(ss)
    };
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', note: 'read-only v2' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Raad Dojo tab ──────────────────────────────────────────────
// Cols: A=Name, B=PayMethod, C=Package, D=Amount(YEN), E=StartDate, F=EndDate, G=Notes, H=Month, I=Number
function readDojo(ss) {
  const sheet = ss.getSheetByName('Raad Dojo');
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  return data
    .filter(r => r[0] !== '' && r[0] !== null && r[0] !== undefined)
    .map((r, i) => ({
      id:    r[8] ? +r[8] : (i + 1),
      name:  String(r[0] || ''),
      pay:   String(r[1] || ''),
      pkg:   String(r[2] || ''),
      amt:   +r[3] || 0,
      start: fmtDate(r[4]),
      end:   fmtDate(r[5]),
      notes: String(r[6] || ''),
      month: String(r[7] || '')
    }));
}

// ── Do run / Taskeen tabs ──────────────────────────────────────
// Cols: A=order, B=PaidAt, C=Q, D=Product, E=USD, F=JPY, G=ExtShip, H=IntShip, I=ActualPrice, J=TotalCost, K=Profit, L=Source, M=Month
function readTrading(ss, tabName) {
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
  const result = [];
  let id = 1;
  data.forEach(r => {
    if (!r[0]) return;
    result.push({
      id:           id++,
      order:        String(r[0] || ''),
      paid_at:      fmtDate(r[1]),
      product:      String(r[3] || ''),
      usd:          +r[4] || 0,
      jpy:          +r[5] || 0,
      ext_ship:     +r[6] || 0,
      int_ship:     +r[7] || 0,
      actual_price: +r[8] || 0,
      total_cost:   +r[9] || 0,
      profit:       +r[10] || 0,
      src:          String(r[11] || ''),
      month:        String(r[12] || ''),
      pending:      false,
      is_special:   false
    });
  });
  return result;
}

// ── Monthly Outcome tab ────────────────────────────────────────
// 4 side-by-side expense tables: Dojo | DoRun | Taskeen | Studio
// Each table: Date | Source | Amount(YEN) | Details
// Script finds "Date" headers dynamically to locate each table
function readExpenses(ss) {
  const sheet = ss.getSheetByName('Monthly Outcome');
  if (!sheet) return { dojo: [], dorun: [], taskeen: [], studio: [] };
  const lastRow = sheet.getLastRow();
  const lastCol = Math.min(sheet.getLastColumn(), 25);
  if (lastRow < 2) return { dojo: [], dorun: [], taskeen: [], studio: [] };

  // Find all columns where header row says "Date"
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const dateCols = [];
  headers.forEach((h, i) => {
    if (String(h).trim().toLowerCase() === 'date') dateCols.push(i);
  });

  const tables  = ['dojo', 'dorun', 'taskeen', 'studio'];
  const expenses = { dojo: [], dorun: [], taskeen: [], studio: [] };
  let expId = 1;

  if (dateCols.length === 0) return expenses;

  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  tables.forEach((sec, idx) => {
    if (idx >= dateCols.length) return;
    const dc = dateCols[idx]; // 0-based index of Date column for this table
    // Layout: Date(dc) | Source(dc+1) | Amount(dc+2) | Details(dc+3)
    data.forEach(r => {
      const dateVal = r[dc];
      const amtVal  = r[dc + 2];
      if (dateVal && amtVal && +amtVal !== 0) {
        expenses[sec].push({
          id:     expId++,
          date:   fmtDate(dateVal),
          cat:    'general',
          amt:    +amtVal || 0,
          detail: String(r[dc + 3] || '')
        });
      }
    });
  });

  return expenses;
}

// ── Total tab — authoritative summary from Google Sheets ──────
// Dynamically finds the summary tables by searching for header labels
function readTotals(ss) {
  const sheet = ss.getSheetByName('Total');
  if (!sheet) return null;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 4) return null;

  const all = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  // Find summary table: row containing "Income" then "Expenses" then "Profit" consecutively
  // Find partner table: row containing "Raad Share"
  var sumHR = -1, sumMC = -1;   // summary header row, month column
  var partHR = -1, partMC = -1; // partner header row, month column

  for (var i = 0; i < all.length; i++) {
    for (var j = 0; j < all[i].length; j++) {
      var cell = String(all[i][j] || '').trim();
      if (cell === 'Income' && sumHR === -1 && j + 2 < all[i].length) {
        var c1 = String(all[i][j+1] || '').trim();
        var c2 = String(all[i][j+2] || '').trim();
        if (c1 === 'Expenses' && c2 === 'Profit') {
          sumHR = i;
          sumMC = j - 1; // Month column is left of Income
        }
      }
      if (cell === 'Raad Share' && partHR === -1) {
        partHR = i;
        partMC = j - 1; // Month column is left of Raad Share
      }
    }
  }

  var result = {
    monthly: {},
    grand: { income: 0, expenses: 0, profit: 0 },
    partners: { raad: 0, rania: 0, maged: 0 },
    monthlyPartners: {}
  };

  // Read summary table (Income / Expenses / Profit per month + Grand Total)
  if (sumHR >= 0 && sumMC >= 0) {
    for (var i = sumHR + 1; i < all.length; i++) {
      var mk = String(all[i][sumMC] || '').trim();
      if (!mk) continue;
      var inc = +(all[i][sumMC + 1]) || 0;
      var exp = +(all[i][sumMC + 2]) || 0;
      var pro = +(all[i][sumMC + 3]) || 0;
      if (mk === 'Grand Total') {
        result.grand = { income: inc, expenses: exp, profit: pro };
        break;
      }
      result.monthly[mk] = { income: inc, expenses: exp, profit: pro };
    }
  }

  // Read partner table (Raad Share / Rania Share / Maged Share per month + Grand Total)
  if (partHR >= 0 && partMC >= 0) {
    for (var i = partHR + 1; i < all.length; i++) {
      var mk = String(all[i][partMC] || '').trim();
      if (!mk) continue;
      var raad  = +(all[i][partMC + 1]) || 0;
      var rania = +(all[i][partMC + 2]) || 0;
      var maged = +(all[i][partMC + 3]) || 0;
      if (mk === 'Grand Total') {
        result.partners = { raad: raad, rania: rania, maged: maged };
        break;
      }
      result.monthlyPartners[mk] = { raad: raad, rania: rania, maged: maged };
    }
  }

  return result;
}

// ── Helpers ────────────────────────────────────────────────────
function fmtDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val);
}
