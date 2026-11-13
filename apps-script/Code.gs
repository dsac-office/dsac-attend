// 달서아트센터 근무관리 데이터 저장소 (Apps Script 웹앱)
// 스크립트 속성: SHEET_ID, SHARED_PASSWORD, ADMIN_PASSWORD
// 권한: 직원 비밀번호는 본인 기록(sheets/사번, ot/사번)만 읽고 쓸 수 있어요.
//       관리자 비밀번호가 맞으면 전체를 읽고 쓸 수 있어요.

function props_() { return PropertiesService.getScriptProperties(); }

function store_() {
  var ss = SpreadsheetApp.openById(props_().getProperty('SHEET_ID'));
  var sh = ss.getSheetByName('store');
  if (!sh) { sh = ss.insertSheet('store'); sh.appendRow(['key', 'json', 'updated']); }
  return sh;
}

function findRow_(sh, key) {
  var n = sh.getLastRow() - 1;
  if (n < 1) return -1;
  var keys = sh.getRange(2, 1, n, 1).getValues();
  for (var i = 0; i < keys.length; i++) if (keys[i][0] === key) return i + 2;
  return -1;
}

function isMine_(key, as) {
  return !!as && (key === 'sheets/' + as || key === 'ot/' + as);
}

function canRead_(key, admin, as) {
  if (admin) return true;
  if (key === 'config/main' || key.indexOf('roster/') === 0) return true;
  return isMine_(key, as);
}

function read_(p, admin, as) {
  if (p.action === 'get') {
    if (!canRead_(p.key, admin, as)) return { ok: false, error: 'forbidden' };
    var sh = store_();
    var r = findRow_(sh, p.key);
    return { ok: true, value: r < 0 ? null : JSON.parse(sh.getRange(r, 2).getValue()) };
  }
  if (p.action === 'list') {
    var prefix = p.prefix || '';
    if (!admin && prefix !== 'roster/') return { ok: false, error: 'forbidden' };
    var sh2 = store_();
    var last = sh2.getLastRow();
    var out = {};
    if (last > 1) {
      var data = sh2.getRange(2, 1, last - 1, 2).getValues();
      for (var i = 0; i < data.length; i++) {
        if (String(data[i][0]).indexOf(prefix) === 0) out[data[i][0]] = JSON.parse(data[i][1]);
      }
    }
    return { ok: true, value: out };
  }
  return { ok: false, error: 'bad_action' };
}

function write_(p, admin, as) {
  if (!admin && !isMine_(p.key, as)) return { ok: false, error: 'forbidden' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = store_();
    if (p.action === 'set') {
      var row = findRow_(sh, p.key);
      var vals = [p.key, p.value, new Date()];
      if (row < 0) sh.appendRow(vals); else sh.getRange(row, 1, 1, 3).setValues([vals]);
      return { ok: true };
    }
    if (p.action === 'delete') {
      var d = findRow_(sh, p.key);
      if (d > 0) sh.deleteRow(d);
      return { ok: true };
    }
    return { ok: false, error: 'bad_action' };
  } finally {
    lock.releaseLock();
  }
}

function handle_(p) {
  if (p.pw !== props_().getProperty('SHARED_PASSWORD')) return { ok: false, error: 'auth' };
  if (p.action === 'adminAuth') {
    return { ok: p.admin === props_().getProperty('ADMIN_PASSWORD') };
  }
  var admin = !!p.apw && p.apw === props_().getProperty('ADMIN_PASSWORD');
  var as = String(p.as || '');
  if (p.action === 'get' || p.action === 'list') return read_(p, admin, as);
  return write_(p, admin, as);
}

function doGet(e) { return out_(handle_(e.parameter)); }
function doPost(e) { return out_(handle_(JSON.parse(e.postData.contents))); }

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
