const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  crypto = require('node:crypto');
function harness() {
  const tables = {},
    files = new Map(),
    folders = new Map(),
    props = new Map(),
    triggers = [];
  let deleteFailure = false;
  const clone = (v) => structuredClone(v);
  class Sheet {
    constructor(name) {
      this.name = name;
      this.rows = [];
    }
    getLastRow() {
      return this.rows.length;
    }
    getLastColumn() {
      return this.rows[0]?.length || 0;
    }
    getDataRange() {
      return { getValues: () => clone(this.rows.length ? this.rows : [['']]) };
    }
    getRange(r, c, h, w) {
      return {
        getValues: () =>
          Array.from({ length: h }, (_, i) =>
            Array.from({ length: w }, (_, j) => this.rows[r + i - 1]?.[c + j - 1] ?? ''),
          ),
        setValues: (v) =>
          v.forEach((row, i) => {
            this.rows[r + i - 1] ??= [];
            row.forEach((x, j) => (this.rows[r + i - 1][c + j - 1] = x));
          }),
      };
    }
    appendRow(v) {
      this.rows.push(clone(v));
    }
    deleteRow(r) {
      this.rows.splice(r - 1, 1);
    }
    setFrozenRows() {}
  }
  const iterator = (items) => {
    let i = 0;
    return { hasNext: () => i < items.length, next: () => items[i++] };
  };
  function blob(bytes, type = 'image/jpeg') {
    return { getBytes: () => bytes, getContentType: () => type };
  }
  function folder(name, parent) {
    const id = crypto.randomUUID(),
      obj = {
        id,
        name,
        parent,
        getId: () => id,
        createFolder: (n) => folder(n, id),
        getFoldersByName: (n) =>
          iterator([...folders.values()].filter((f) => f.parent === id && f.name === n)),
        createFile: (b) => {
          const fileId = crypto.randomUUID();
          files.set(fileId, { folder: id, blob: b });
          return { getId: () => fileId };
        },
      };
    folders.set(id, obj);
    return obj;
  }
  const ss = {
    getId: () => 'test-spreadsheet',
    getSheetByName: (n) => tables[n] || null,
    insertSheet: (n) => (tables[n] = new Sheet(n)),
  };
  const ctx = vm.createContext({
    console,
    Date,
    Math,
    JSON,
    Number,
    String,
    Object,
    Array,
    Error,
    Boolean,
    RegExp,
    Set,
    Map,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => props.get(k),
        setProperty: (k, v) => props.set(k, v),
      }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      base64Decode: (s) => [...Buffer.from(s, 'base64')],
      base64Encode: (b) => Buffer.from(b).toString('base64'),
      newBlob: blob,
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: {
      createFolder: (n) => folder(n),
      getFolderById: (id) => {
        if (!folders.has(id)) throw Error('Missing folder');
        return folders.get(id);
      },
      getFileById: (id) => ({ getBlob: () => files.get(id).blob }),
    },
    ScriptApp: {
      getOAuthToken: () => 'test-token',
      getProjectTriggers: () => triggers,
      newTrigger: (name) => ({
        timeBased() {
          return this;
        },
        everyMinutes() {
          return this;
        },
        create() {
          triggers.push({ getHandlerFunction: () => name });
        },
      }),
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        if (options.method !== 'delete') throw Error('Only deletion expected');
        if (deleteFailure) return { getResponseCode: () => 503 };
        const id = decodeURIComponent(url.split('/').pop());
        if (!folders.has(id) && !files.has(id)) return { getResponseCode: () => 404 };
        const erase = (id) => {
          [...folders.values()].filter((f) => f.parent === id).forEach((f) => erase(f.id));
          for (const [key, f] of files) if (f.folder === id) files.delete(key);
          folders.delete(id);
          files.delete(id);
        };
        erase(id);
        return { getResponseCode: () => 204 };
      },
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text) => ({
        text,
        setMimeType() {
          return this;
        },
      }),
    },
  });
  const root = path.join(__dirname, '..', 'apps-script');
  for (const p of fs.readdirSync(root).filter((p) => p.endsWith('.gs')))
    vm.runInContext(fs.readFileSync(path.join(root, p), 'utf8'), ctx, { filename: p });
  ctx.setupFindIt();
  function call(action, data) {
    const response = ctx.doPost({ postData: { contents: JSON.stringify({ ...data, action }) } });
    return JSON.parse(response.text);
  }
  function api(action, data = {}) {
    const r = call(action, data);
    if (!r.ok) {
      const e = Error(r.error.message);
      e.code = r.error.code;
      throw e;
    }
    return r.data;
  }
  function create(count = 2, code = 'SNAP24') {
    const r = api('createGame', {
      hostName: 'Host',
      challengeCount: count,
      gameCode: code,
      requestId: crypto.randomUUID(),
    });
    return { gameCode: r.game.gameCode, playerId: r.player.playerId };
  }
  function join(host, name = 'Guest') {
    const r = api('joinGame', {
      gameCode: host.gameCode,
      playerName: name,
      requestId: crypto.randomUUID(),
    });
    return { gameCode: host.gameCode, playerId: r.player.playerId };
  }
  function sync(s, room = 'active', visible = true) {
    return api('sync', { ...s, room, visible });
  }
  function rows(name) {
    return ctx.rowsAsObjects_(name);
  }
  return {
    api,
    call,
    create,
    join,
    sync,
    rows,
    ctx,
    files,
    folders,
    props,
    tables,
    setDeleteFailure: (v) => (deleteFailure = v),
  };
}
module.exports = { harness };
