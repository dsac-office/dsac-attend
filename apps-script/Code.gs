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
  if (key === 'config/main') return true;
  if (String(key).indexOf('roster/') === 0) return false; // 명단은 관리자만
  return isMine_(key, as) || key === 'actual/' + as;
}

// 직원 로그인 확인: 사번과 이름이 맞을 때만 본인 정보(이름·팀·직급)를 돌려줘요. 명단 전체는 주지 않아요.
function checkLogin_(p) {
  var rec = readValue_('roster/' + String(p.id || ''));
  var norm = function (s) { return String(s || '').replace(/\s/g, ''); };
  if (!rec || rec.active === false || norm(rec.name) !== norm(p.name)) return { ok: false, error: 'nomatch' };
  return { ok: true, value: { name: rec.name, team: rec.team || '', rank: rec.rank || '' } };
}

function read_(p, admin, as) {
  if (p.action === 'checkLogin') return checkLogin_(p);
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
    if (!admin && prefix !== 'inq/') return { ok: false, error: 'forbidden' };
    var sh2 = store_();
    var last = sh2.getLastRow();
    var outL = {};
    if (last > 1) {
      // 키와 값을 한 번에 읽고(시트 호출을 한 번으로 줄여요), 맞는 줄만 골라요
      var rowsL = sh2.getRange(2, 1, last - 1, 2).getValues();
      for (var i = 0; i < rowsL.length; i++) {
        var key = String(rowsL[i][0]);
        if (key.indexOf(prefix) !== 0) continue;
        var item = null;
        try { item = JSON.parse(rowsL[i][1] || 'null'); } catch (e) { item = null; }
        // 직원은 자기 문의만 보여요
        if (!admin && prefix === 'inq/' && (!item || item.uid !== as)) continue;
        outL[key] = item;
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

// 문의(inq/...): 직원은 자기 문의를 새로 쓰고, 고치고, 지울 수 있어요(답변·완료 표시는 불가).
// 관리자는 전체를 읽고 고치고 지우고, 답변과 완료 표시를 바꿀 수 있어요.
function writeInq_(p, admin, as) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = store_();
    var row = findRow_(sh, p.key);
    var old = row >= 0 ? JSON.parse(sh.getRange(row, 2).getValue()) : null;
    if (!admin && old && old.uid !== as) return { ok: false, error: 'forbidden' };
    if (p.action === 'delete') {
      if (!admin && !old) return { ok: false, error: 'forbidden' };
      if (row > 0) sh.deleteRow(row);
      cacheDrop_(p.key);
      return { ok: true };
    }
    if (p.action !== 'set') return { ok: false, error: 'forbidden' };
    var v = JSON.parse(p.value || 'null');
    if (!v || typeof v !== 'object') return { ok: false, error: 'bad_value' };
    if (!admin) {
      if (!as || v.uid !== as) return { ok: false, error: 'forbidden' };
      if (typeof v.text !== 'string' || v.text.length > 2000) return { ok: false, error: 'too_long' };
      if (typeof v.img !== 'string' || v.img.length > 300000) return { ok: false, error: 'too_big' };
      if (old && (v.reply !== old.reply || v.done !== old.done)) return { ok: false, error: 'forbidden' };
    }
    var vals = [p.key, p.value, new Date()];
    if (row < 0) sh.appendRow(vals); else sh.getRange(row, 1, 1, 3).setValues([vals]);
    cacheDrop_(p.key);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// 마감 중에도 허용: 신청 내용(items)은 그대로인 쓰기(처음 이름·직급 등록). 신청 추가·수정·취소는 막아요.
function metaOnly_(p) {
  if (p.action !== 'set') return false;
  var v;
  try { v = JSON.parse(p.value || 'null'); } catch (e) { return false; }
  if (!v || typeof v !== 'object') return false;
  var sh = store_();
  var row = findRow_(sh, p.key);
  var cur = null;
  try { cur = row > 0 ? JSON.parse(sh.getRange(row, 2).getValue() || 'null') : null; } catch (e) { cur = null; }
  return JSON.stringify(v.items || {}) === JSON.stringify((cur && cur.items) || {});
}

// 마감한 날짜(otDates)의 신청은 직원이 바꾸거나 지울 수 없어요.
// 마감일 이후 신청과 이름·직급 같은 정보 변경은 그대로 허용해요.
function lockedWrite_(p) {
  var cfg = readValue_('config/main') || {};
  var dates = cfg.otDates || []; // 관리자가 마감한 날짜 목록(날짜별로 따로 잠가요)
  if (!dates.length) return false;
  if (p.action !== 'set') return true;
  var nv;
  try { nv = JSON.parse(p.value || 'null'); } catch (e) { return true; }
  if (!nv || typeof nv !== 'object') return true;
  var sh = store_();
  var row = findRow_(sh, p.key);
  var cur = null;
  try { cur = row > 0 ? JSON.parse(sh.getRange(row, 2).getValue() || 'null') : null; } catch (e) { cur = null; }
  var oldI = (cur && cur.items) || {};
  var newI = nv.items || {};
  var ids = {};
  Object.keys(oldI).forEach(function (k) { ids[k] = 1; });
  Object.keys(newI).forEach(function (k) { ids[k] = 1; });
  for (var id in ids) {
    var a = oldI[id] || null, b = newI[id] || null;
    var locked = (a && dates.indexOf(a.d) >= 0) || (b && dates.indexOf(b.d) >= 0);
    if (locked && JSON.stringify(a) !== JSON.stringify(b)) return true;
  }
  return false;
}

// 신청 한 건만 바꿔요(추가·수정·취소). 서버에서 최신 기록을 다시 읽고 그 한 건만 고쳐 쓰므로,
// 오래된 화면이 전체 기록을 덮어써서 취소한 신청이 되살아나지 않아요.
// 마감한 날짜의 신청을 새로 넣거나, 고치거나, 지우는 것은 막아요(바뀌는 한 건만 검사).
function patchItem_(p, admin, as) {
  if (!admin && String(p.key) !== 'ot/' + as) return { ok: false, error: 'forbidden' };
  var id = String(p.id || '');
  if (!id) return { ok: false, error: 'bad_value' };
  var newIt = null;
  if (p.item !== undefined && p.item !== 'null') {
    try { newIt = JSON.parse(p.item); } catch (e) { return { ok: false, error: 'bad_value' }; }
    if (!newIt || typeof newIt !== 'object') return { ok: false, error: 'bad_value' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = store_();
    var row = findRow_(sh, p.key);
    var cur = null;
    try { cur = row > 0 ? JSON.parse(sh.getRange(row, 2).getValue() || 'null') : null; } catch (e) { cur = null; }
    if (!cur || typeof cur !== 'object') cur = { items: {} };
    var items = cur.items || {};
    var oldIt = items[id] || null;
    if (!admin) {
      var cfg = readValue_('config/main') || {};
      var dates = cfg.otDates || [];
      var changed = JSON.stringify(oldIt) !== JSON.stringify(newIt);
      var locked = (oldIt && dates.indexOf(oldIt.d) >= 0) || (newIt && dates.indexOf(newIt.d) >= 0);
      if (changed && locked) return { ok: false, error: 'closed' };
    }
    if (newIt) items[id] = newIt; else delete items[id];
    cur.items = items;
    var vals = [p.key, JSON.stringify(cur), new Date()];
    if (row < 0) sh.appendRow(vals); else sh.getRange(row, 1, 1, 3).setValues([vals]);
    cacheDrop_(p.key);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// 이름·직급·확인 기록(seen)만 바꿔요. 신청 목록(items)은 건드리지 않아요.
// seen 은 종류(inq, ot)별로 합쳐요. 최신 기록을 서버에서 다시 읽고 바뀐 칸만 고쳐 써요.
function patchMeta_(p, admin, as) {
  if (!admin && String(p.key) !== 'ot/' + as) return { ok: false, error: 'forbidden' };
  var fields;
  try { fields = JSON.parse(p.fields || 'null'); } catch (e) { return { ok: false, error: 'bad_value' }; }
  if (!fields || typeof fields !== 'object') return { ok: false, error: 'bad_value' };
  var allowed = { name: 1, rank: 1, seen: 1 };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = store_();
    var row = findRow_(sh, p.key);
    var cur = null;
    try { cur = row > 0 ? JSON.parse(sh.getRange(row, 2).getValue() || 'null') : null; } catch (e) { cur = null; }
    if (!cur || typeof cur !== 'object') cur = { items: {} };
    Object.keys(fields).forEach(function (k) {
      if (!allowed[k]) return;
      if (k === 'seen' && fields.seen && typeof fields.seen === 'object') {
        var merged = {};
        var old = cur.seen || {};
        Object.keys(old).forEach(function (kk) { merged[kk] = old[kk]; });
        Object.keys(fields.seen).forEach(function (kk) { merged[kk] = fields.seen[kk]; });
        cur.seen = merged;
      } else {
        cur[k] = fields[k];
      }
    });
    var vals = [p.key, JSON.stringify(cur), new Date()];
    if (row < 0) sh.appendRow(vals); else sh.getRange(row, 1, 1, 3).setValues([vals]);
    cacheDrop_(p.key);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function write_(p, admin, as) {
  if (String(p.key).indexOf('inq/') === 0) return writeInq_(p, admin, as);
  if (p.action === 'patchItem') return patchItem_(p, admin, as);
  if (p.action === 'patchMeta') return patchMeta_(p, admin, as);
  if (!admin && !isMine_(p.key, as)) return { ok: false, error: 'forbidden' };
  if (!admin && String(p.key).indexOf('ot/') === 0 && lockedWrite_(p)) return { ok: false, error: 'closed' };
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
  if (p.action === 'get' || p.action === 'getMany' || p.action === 'list' || p.action === 'checkLogin') return read_(p, admin, as);
  return write_(p, admin, as);
}

function doGet(e) { return out_(handle_(e.parameter)); }
function doPost(e) { return out_(handle_(JSON.parse(e.postData.contents))); }

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
