// Google Apps Script backend for Kesug Airdrop Manager v2
// IMPORTANT: set SHEET_ID to your spreadsheet ID and deploy the script as a Web App.
const SHEET_ID = 'PUT_YOUR_SHEET_ID_HERE';
const SHEET_NAMES = { accounts: 'Accounts', airdrops: 'Airdrops', assignments: 'Assignments' };

function doGet(e){ return handleRequest(e); }
function doPost(e){ const body = JSON.parse(e.postData.contents); return handleRequest(e, body); }

function handleRequest(e, body){
  const path = (e.path || e.parameter.path || '');
  try{
    if (!body && path==='/getAll') return jsonResponse(getAll());
    if (body && path==='/createAccount') return jsonResponse(createAccount(body.account));
    if (body && path==='/updateAccount') return jsonResponse(updateAccount(body.id, body.patch));
    if (body && path==='/deleteAccount') return jsonResponse(deleteAccount(body.id));
    if (body && path==='/createAirdrop') return jsonResponse(createAirdrop(body.airdrop));
    if (body && path==='/updateAirdrop') return jsonResponse(updateAirdrop(body.id, body.patch));
    if (body && path==='/assignAccounts') return jsonResponse(assignAccounts(body.airdropId, body.accountIds));
    if (body && path==='/updateAssignment') return jsonResponse(updateAssignment(body.assignmentId, body.patch));
    return jsonResponse({ error: 'Unknown path' }, 400);
  }catch(err){ return jsonResponse({ error: err.message }, 500); }
}

function jsonResponse(obj, code){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function getSheet(name){ return SpreadsheetApp.openById(SHEET_ID).getSheetByName(name); }

function getAll(){
  const accounts = sheetToObjects(getSheet(SHEET_NAMES.accounts));
  const airdrops = sheetToObjects(getSheet(SHEET_NAMES.airdrops));
  const assignments = sheetToObjects(getSheet(SHEET_NAMES.assignments));
  return { accounts, airdrops, assignments };
}

function sheetToObjects(sheet){
  const values = sheet.getDataRange().getValues();
  if(values.length < 2) return [];
  const headers = values.shift();
  return values.map((row, idx) => {
    const obj = {};
    headers.forEach((h,i)=> obj[h] = row[i]);
    if(!obj.id) obj.id = String(idx+1);
    return obj;
  });
}

function appendToSheet(sheetKey, obj){
  const sheet = getSheet(SHEET_NAMES[sheetKey]);
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => obj[h] || '');
  sheet.appendRow(row);
  return true;
}

function createAccount(account){ if(!account.id) account.id = Utilities.getUuid(); appendToSheet('accounts', account); return { success: true }; }
function updateAccount(id, patch){ return patchRowById(SHEET_NAMES.accounts, id, patch); }
function deleteAccount(id){ return deleteRowById(SHEET_NAMES.accounts, id); }
function createAirdrop(airdrop){ if(!airdrop.id) airdrop.id = Utilities.getUuid(); airdrop.createdAt = new Date().toISOString(); appendToSheet('airdrops', airdrop); return { success: true }; }

// Compute totals when airdrop is ended
function computeAirdropTotals(airdropId) {
  const assignmentsSheet = getSheet(SHEET_NAMES.assignments);
  const assignmentsData = assignmentsSheet.getDataRange().getValues();
  if (assignmentsData.length < 2) return { totalEarned: 0, totalInvested: 0 };
  const headers = assignmentsData[0];
  const rows = assignmentsData.slice(1);
  const airdropIdCol = headers.indexOf('airdropId');
  const rewardCol = headers.indexOf('rewardAmount');
  const investCol = headers.indexOf('investmentAmount');
  let totalEarned = 0;
  let totalInvested = 0;
  rows.forEach(row => {
    if (String(row[airdropIdCol]) === String(airdropId)) {
      const r = Number(row[rewardCol]) || 0;
      const inv = Number(row[investCol]) || 0;
      totalEarned += r;
      totalInvested += inv;
    }
  });
  return { totalEarned, totalInvested };
}

function updateAirdrop(id, patch){
  // if marking ended, compute totals and write to airdrops
  if (patch && (patch.ended === true || patch.ended === 'true' || patch.ended === 'TRUE')) {
    const totals = computeAirdropTotals(id);
    patch.totalEarned = totals.totalEarned;
    patch.totalInvested = totals.totalInvested;
    patch.profit = (Number(totals.totalEarned) || 0) - (Number(totals.totalInvested) || 0);
    patch.endedAt = new Date().toISOString();
  }
  return patchRowById(SHEET_NAMES.airdrops, id, patch);
}

function assignAccounts(airdropId, accountIds){
  accountIds.forEach(accId => {
    appendToSheet('assignments', { id: Utilities.getUuid(), airdropId, accountId: accId, status: 'Assigned', rewardAmount: 0, investmentAmount: 0 });
  });
  return { success: true };
}
function updateAssignment(assignId, patch){ return patchRowById(SHEET_NAMES.assignments, assignId, patch); }

function patchRowById(sheetName, id, patch){
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  for (let r=0;r<data.length;r++){
    const rowId = data[r][headers.indexOf('id')];
    if (String(rowId) === String(id)){
      Object.keys(patch).forEach(k => {
        const col = headers.indexOf(k);
        if (col >= 0) sheet.getRange(r+2, col+1).setValue(patch[k]);
      });
      return { success: true };
    }
  }
  return { error: 'Not found' };
}

function deleteRowById(sheetName, id){
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  for (let r=0;r<data.length;r++){
    if (String(data[r][headers.indexOf('id')]) === String(id)){ sheet.deleteRow(r+2); return { success: true }; }
  }
  return { error: 'Not found' };
}
