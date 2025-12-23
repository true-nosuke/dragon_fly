/***********************
 * Firebase Firestore 設定
 ***********************/
const FIREBASE_PROJECT_ID = 'tombo-fes-push';
const FIRESTORE_COLLECTION = 'stores';

/***********************
 * 時刻フォーマット
 ***********************/
/**
 * 時刻を 'HH:mm' 形式に柔軟に正規化します。
 * - Date オブジェクトはスプレッドシートのタイムゾーンで整形
 * - 'H:MM' 形式の文字列はそのまま返す
 * - 無効な値は null を返します
 * @param {*} value スプレッドシートからのセル値
 * @returns {string|null} 'HH:mm' または null
 */
function formatTimeValueRelaxed(value) {
  if (value === null || value === undefined || value === '') return null;

  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();

  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return null;
    return Utilities.formatDate(value, tz, 'HH:mm');
  }

  if (typeof value === 'string') {
    const t = value.trim();
    if (/^\d{1,2}:\d{2}$/.test(t)) return t;
  }

  return null;
}

/***********************
 * JSON生成
 ***********************/
/**
 * スプレッドシートの集計表を JSON（配列）に変換します。
 * - 1行目をヘッダ、3行目以降をデータ行として想定
 * - 同一 id の複数行をまとめ、menus と schedule を組み立てる
 * @param {string} sheetName シート名（デフォルト 'シート1'）
 * @returns {Array<Object>|null}
 */
function convertAggregatedSheetToJson(sheetName = 'シート1') {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return null;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0].map(function(h) { return h.toString().trim(); });

  const rows = sheet.getRange(3, 1, sheet.getLastRow() - 2, sheet.getLastColumn())
    .getValues();

  const grouped = {};
  let lastId = null;

  // ループ内で都度 index を検索しないように事前に取得
  const idIndex = headers.indexOf('id');
  const menuIndex = headers.indexOf('menu');
  const priceIndex = headers.indexOf('price');

  rows.forEach(function(row) {
    var id = idIndex >= 0 ? row[idIndex] : null;

    if (!id && lastId) id = lastId;
    else if (id) lastId = id;
    else return; // id が取れない行は無視

    if (!grouped[id]) grouped[id] = { id: id, menus: [] };
    var obj = grouped[id];

    var tempSchedules = {};
    var menu = menuIndex >= 0 ? row[menuIndex] : null;
    var price = priceIndex >= 0 ? row[priceIndex] : null;

    headers.forEach(function(header, i) {
      var value = row[i];
      if (value === '' || value === null) return;

      var sch = header.match(/^schedule(\d+)_(start|end)$/i);
      if (sch) {
        var num = sch[1];
        var type = sch[2];
        var time = formatTimeValueRelaxed(value);
        if (time) {
          if (!tempSchedules[num]) tempSchedules[num] = {};
          tempSchedules[num][type] = time;
        }
        return;
      }

      if (['id', 'menu', 'price'].indexOf(header) === -1 && header.indexOf('schedule') !== 0) {
        if (header === 'raining') {
          if (!obj.raining) obj.raining = {};
          obj.raining.isRaining = value;
        } else if (header === 'raining_location') {
          if (!obj.raining) obj.raining = {};
          obj.raining.location = value;
        } else {
          obj[header] = value;
        }
      }
    });

    Object.keys(tempSchedules).forEach(function(n) {
      var s = tempSchedules[n];
      if (s.start && s.end) {
        var key = 'schedule' + n;
        if (!obj[key]) obj[key] = [];
        obj[key].push({ start: s.start, end: s.end });
      }
    });

    if (menu && price) {
      obj.menus.push({ name: menu, price: price });
    }
  });

  return Object.values(grouped);
}

/***********************
 * Firestore に書き込む
 ***********************/
function exportToFirestore() {
  const data = convertAggregatedSheetToJson('シート1');
  if (!data) {
    SpreadsheetApp.getUi().alert('❌ データ生成失敗');
    return;
  }

  const token = ScriptApp.getOAuthToken();
  const failed = [];

  // 各アイテムを逐次送信し、レスポンスを確認する
  data.forEach(function(item) {
    const url =
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
      `/databases/(default)/documents/${FIRESTORE_COLLECTION}/${item.id}`;

    const payload = {
      fields: convertToFirestoreFields(item)
    };

    const options = {
      method: 'patch',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    try {
      var resp = UrlFetchApp.fetch(url, options);
      var code = resp.getResponseCode();
      if (code < 200 || code >= 300) {
        failed.push({ id: item.id, code: code, body: resp.getContentText() });
        console.error('Firestore write failed', item.id, code, resp.getContentText());
      }
    } catch (e) {
      failed.push({ id: item.id, error: String(e) });
      console.error('Firestore request error', item.id, e);
    }
  });

  if (failed.length === 0) {
    SpreadsheetApp.getUi().alert('🔥 Firestore に反映しました');
  } else {
    SpreadsheetApp.getUi().alert(`⚠️ 一部反映できませんでした: ${failed.length} 件。ログを確認してください`);
  }
}

/***********************
 * JS → Firestore fields 変換
 ***********************/
function convertToFirestoreFields(obj) {
  var fields = {};
  Object.keys(obj).forEach(function(k) {
    fields[k] = toFirestoreValue(obj[k]);
  });
  return fields;
}

/**
 * JavaScript 値を Firestore REST API の value オブジェクトに変換します。
 * - 文字列は stringValue
 * - 整数は integerValue（文字列化して送信）
 * - 浮動小数点は doubleValue
 * - 配列やオブジェクトは再帰的に変換
 */
function toFirestoreValue(v) {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') {
    // Firestore の integerValue は文字列で表現するのが安定
    if (Math.floor(v) === v) return { integerValue: String(v) };
    return { doubleValue: v };
  }
  if (typeof v === 'boolean') return { booleanValue: v };

  if (Array.isArray(v)) {
    var arr = v.map(function(item) { return toFirestoreValue(item); });
    return {
      arrayValue: {
        values: arr
      }
    };
  }

  if (typeof v === 'object' && v !== null) {
    return {
      mapValue: {
        fields: convertToFirestoreFields(v)
      }
    };
  }

  return { nullValue: null };
}

/***********************
 * スプレッドシートメニュー
 ***********************/
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('JSON生成')
    .addItem('Firestoreに反映', 'exportToFirestore')
    .addToUi();
}
