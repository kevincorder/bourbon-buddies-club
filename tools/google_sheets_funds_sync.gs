const CLUB_FUNDS = Object.freeze({
  firebaseProjectId: 'bourbon-buddies-b5ecc',
  accountingSheet: 'Accounting',
});

function syncClubFunds() {
  const availableFunds = findBudgetTotal_();
  const url = `https://firestore.googleapis.com/v1/projects/${CLUB_FUNDS.firebaseProjectId}/databases/(default)/documents/clubStats/current`;
  const response = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
    payload: JSON.stringify({
      fields: {
        availableFunds: { doubleValue: availableFunds },
        updatedAt: { timestampValue: new Date().toISOString() },
        source: { stringValue: 'Google Sheets Accounting total' },
      },
    }),
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() >= 300) throw new Error(`Firestore sync failed: ${response.getContentText()}`);
}

function findBudgetTotal_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CLUB_FUNDS.accountingSheet);
  if (!sheet) throw new Error(`Could not find the ${CLUB_FUNDS.accountingSheet} sheet.`);
  const range = sheet.getDataRange();
  const formulas = range.getFormulas();
  for (let row = 0; row < formulas.length; row += 1) {
    for (let column = 0; column < formulas[row].length; column += 1) {
      const formula = formulas[row][column].replace(/\s+/g, '').toUpperCase();
      if (formula.includes('SUM(BUDGET[AMOUNT])')) {
        const total = Number(range.getCell(row + 1, column + 1).getValue());
        if (!Number.isFinite(total)) throw new Error('The Budget total formula did not produce a number.');
        return total;
      }
    }
  }
  throw new Error('Could not find the =SUM(Budget[Amount]) total formula on the Accounting sheet.');
}

function syncOnEdit(event) {
  if (event && event.range.getSheet().getName() !== CLUB_FUNDS.accountingSheet) return;
  syncClubFunds();
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (['syncOnEdit', 'syncClubFunds'].includes(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncOnEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  ScriptApp.newTrigger('syncClubFunds').timeBased().everyHours(1).create();
}
