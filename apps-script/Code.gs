// 달서아트센터 근무관리 데이터 저장소 (Apps Script 웹앱) - 속도 개선판
// 스크립트 속성: SHEET_ID, SHARED_PASSWORD, ADMIN_PASSWORD
// 권한: 직원 비밀번호는 본인 기록(sheets/사번, ot/사번)만 읽고 쓸 수 있어요.
//       관리자 비밀번호가 맞으면 전체를 읽고 쓸 수 있어요.
// 속도: 설정(config/main)과 명단(roster/)은 5분 동안 캐시하고, 쓰면 바로 비워요.
//       여러 개를 한 번에 받는 getMany 를 추가했어요.

var CACHE_SEC = 300;
var CACHE_MAX = 90000;

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

function cacheable_(key) {
  return key === 'config/main' || String(key).indexOf('roster/') === 0;
}

function cacheGet_(key) {
  try {
    var v = CacheService.getScriptCache().get('k:' + key);
    return v === null ? undefined : JSON.parse(v);
  } catch (e) { return undefined; }
}

function cachePut_(key, val) {
  try {
    var s = JSON.stringify(val);
    if (s.length < CACHE_MAX) CacheService.getScriptCache().put('k:' + key, s, CACHE_SEC);
  } catch (e) {}
}

function cacheDrop_(key) {
  try { CacheService.getScriptCache().remove('k:' + key); } catch (e) {}
}

// 한 칸의 값을 읽는다(캐시가 있으면 캐시에서)
function readValue_(key) {
  var cached = cacheable_(key);
  if (cached) {
    var hit = cacheGet_(key);
    if (hit !== undefined) return hit;
  }
  var sh = store_();
  var r = findRow_(sh, key);
  var val = r < 0 ? null : JSON.parse(sh.getRange(r, 2).getValue());
  if (cached) cachePut_(key, val);
  return val;
}

function isMine_(key, as) {
  return !!as && (key === 'sheets/' + as || key === 'ot/' + as);
}

function canRead_(key, admin, as) {
  if (admin) return true;
  if (key === 'config/main' || String(key).indexOf('roster/') === 0) return true;
  return isMine_(key, as);
}

function read_(p, admin, as) {
  if (p.action === 'get') {
    if (!canRead_(p.key, admin, as)) return { ok: false, error: 'forbidden' };
    return { ok: true, value: readValue_(p.key) };
  }
  if (p.action === 'getMany') {
    var keys = JSON.parse(p.keys || '[]');
    var out = {};
    for (var k = 0; k < keys.length; k++) {
      if (!canRead_(keys[k], admin, as)) return { ok: false, error: 'forbidden' };
    }
    for (var j = 0; j < keys.length; j++) out[keys[j]] = readValue_(keys[j]);
    return { ok: true, value: out };
  }
  if (p.action === 'list') {
    var prefix = p.prefix || '';
    if (!admin && prefix !== 'roster/') return { ok: false, error: 'forbidden' };
    var sh2 = store_();
    var last = sh2.getLastRow();
    var outL = {};
    if (last > 1) {
      var data = sh2.getRange(2, 1, last - 1, 2).getValues();
      for (var i = 0; i < data.length; i++) {
        if (String(data[i][0]).indexOf(prefix) === 0) outL[data[i][0]] = JSON.parse(data[i][1]);
      }
    }
    return { ok: true, value: outL };
  }
  return { ok: false, error: 'bad_action' };
}

// 시간외 신청이 마감되었는지 (config/main 의 otClosed)
function isClosed_() {
  var cfg = readValue_('config/main');
  return !!(cfg && cfg.otClosed);
}

function write_(p, admin, as) {
  if (!admin && !isMine_(p.key, as)) return { ok: false, error: 'forbidden' };
  if (!admin && String(p.key).indexOf('ot/') === 0 && isClosed_()) return { ok: false, error: 'closed' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = store_();
    if (p.action === 'set') {
      var row = findRow_(sh, p.key);
      var vals = [p.key, p.value, new Date()];
      if (row < 0) sh.appendRow(vals); else sh.getRange(row, 1, 1, 3).setValues([vals]);
      cacheDrop_(p.key);
      return { ok: true };
    }
    if (p.action === 'delete') {
      var d = findRow_(sh, p.key);
      if (d > 0) sh.deleteRow(d);
      cacheDrop_(p.key);
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
  if (p.action === 'get' || p.action === 'getMany' || p.action === 'list') return read_(p, admin, as);
  return write_(p, admin, as);
}

function doGet(e) { return out_(handle_(e.parameter)); }
function doPost(e) { return out_(handle_(JSON.parse(e.postData.contents))); }

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
