/* DOM integration tests; no live Google service or user browser is used. */
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  crypto = require('node:crypto');
const { parseHTML } = require('linkedom'),
  { harness } = require('./harness.cjs');
const root = path.join(__dirname, '..');
const jpeg = 'data:image/jpeg;base64,/9j/2Q==';
const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
function phone(backend) {
  const { window } = parseHTML(fs.readFileSync(path.join(root, 'index.html'), 'utf8')),
    document = window.document,
    scheduled = new Map(),
    storage = new Map();
  let next = 0;
  const store = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  };
  const context = {
    window,
    document,
    console,
    crypto: { randomUUID: () => crypto.randomUUID() },
    sessionStorage: store,
    localStorage: { removeItem() {} },
    setTimeout: (fn, ms) => {
      const id = ++next;
      scheduled.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => scheduled.delete(id),
    navigator: {},
    confirm: () => true,
    FindItAPI: { post: async (a, d) => backend.api(a, d) },
    Image: function () {
      const img = document.createElement('img');
      Object.defineProperties(img, { naturalWidth: { value: 100 }, naturalHeight: { value: 100 } });
      img.decode = async () => {};
      return img;
    },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    FormData: class {
      constructor(form) {
        this.values = [...form.querySelectorAll('input,select')].map((el) => [el.name, el.value]);
      }
      *[Symbol.iterator]() {
        yield* this.values;
      }
    },
  };
  window.FINDIT_CONFIG = { pollMs: 3000 };
  window.scrollTo = () => {};
  document.hidden = false;
  document.querySelectorAll('img').forEach((img) => (img.decode = async () => {}));
  const canvasProto = Object.getPrototypeOf(document.createElement('canvas'));
  canvasProto.getContext = () => ({ drawImage() {} });
  canvasProto.toDataURL = () => jpeg;
  const imgProto = Object.getPrototypeOf(document.createElement('img'));
  imgProto.decode = async () => {};
  document
    .querySelectorAll('form')
    .forEach((f) => (f.reset = () => f.querySelectorAll('input').forEach((el) => (el.value = ''))));
  const ctx = vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'), ctx);
  document.dispatchEvent(new window.Event('DOMContentLoaded'));
  const $ = (id) => document.getElementById(id);
  async function timer(ms) {
    const found = [...scheduled].find(([, t]) => t.ms === ms);
    assert.ok(found, 'Expected timer ' + ms);
    scheduled.delete(found[0]);
    await found[1].fn();
    await flush();
  }
  async function click(id) {
    $(id).click();
    await flush();
  }
  async function form(id, values) {
    for (const [name, value] of Object.entries(values)) {
      const el = $(id).querySelector('[name="' + name + '"]');
      if (el.tagName === 'SELECT')
        Object.defineProperty(el, 'value', { value: String(value), configurable: true });
      else el.value = value;
    }
    $(id).dispatchEvent(new window.Event('submit', { cancelable: true }));
    await flush();
  }
  async function tick() {
    await timer([...scheduled].some(([, t]) => t.ms === 0) ? 0 : 3000);
  }
  return {
    $,
    window,
    document,
    storage,
    scheduled,
    timer,
    click,
    form,
    tick,
    visible: (id) => !$(id).hidden,
    session: () => JSON.parse(storage.get('findItV3Session')),
  };
}
test('two phone screens: logo, lobby, photos, waiting room, category vote, final tie, winner and clean reset', async () => {
  const h = harness(),
    a = phone(h),
    b = phone(h);
  assert.ok(a.visible('loading'));
  assert.ok([...a.scheduled.values()].some((t) => t.ms === 2000));
  await a.timer(2000);
  await b.timer(2000);
  assert.ok(a.visible('home'));
  await a.click('host');
  await a.form('host-form', { hostName: 'Des', challengeCount: 1, gameCode: 'SNAP24' });
  await a.tick();
  assert.ok(a.visible('lobby'));
  await b.click('join');
  await b.form('join-form', { playerName: 'Friend', gameCode: 'SNAP24' });
  await b.tick();
  await a.tick();
  assert.match(a.$('player-count').textContent, /2/);
  assert.match(a.$('players').textContent, /Friend/);
  await a.click('start');
  await a.tick();
  await b.tick();
  assert.ok(a.visible('hunt'));
  assert.ok(b.visible('hunt'));
  for (const p of [a, b]) {
    p.$('categories').querySelector('button').click();
    await flush();
    assert.ok(p.visible('photo'));
    const input = p.$('camera');
    Object.defineProperty(input, 'files', {
      value: [{ type: 'image/jpeg', size: 100 }],
      configurable: true,
    });
    input.dispatchEvent(new p.window.Event('change'));
    await flush();
    assert.equal(p.$('preview').hidden, false);
    await p.click('submit-photo');
    await p.tick();
    assert.ok(p.visible('waiting'));
  }
  await a.tick();
  await b.tick();
  await a.tick();
  assert.ok(a.visible('voting'));
  assert.ok(b.visible('voting'));
  await flush();
  // Choose the other player's photo so neither uses their self-vote in category voting.
  for (const p of [a, b]) {
    const cards = [...p.$('ballot').querySelectorAll('.photo-card')],
      other = cards.find((c) => !c.textContent.includes('Your photo'));
    assert.ok(other);
    other.querySelector('button').click();
    await flush();
    await p.tick();
  }
  await a.tick();
  await b.tick();
  assert.match(a.$('vote-label').textContent, /ONE LAST VOTE/);
  // Repeat the tie. Server-received upload order must choose Des's first upload.
  for (const p of [a, b]) {
    const other = [...p.$('ballot').querySelectorAll('.photo-card')].find(
      (c) => !c.textContent.includes('Your photo'),
    );
    other.querySelector('button').click();
    await flush();
    await p.tick();
  }
  await a.tick();
  await b.tick();
  assert.ok(a.visible('results'));
  assert.ok(b.visible('results'));
  await a.click('show-finale');
  await b.click('show-finale');
  assert.ok(a.visible('finale'));
  assert.match(a.$('winner').textContent, /Des/);
  assert.match(a.$('winner').textContent, /first successfully uploaded/);
  await a.click('finish');
  assert.ok(h.files.size > 0);
  assert.match(a.$('finish-status').textContent, /Waiting/);
  await b.click('finish');
  assert.ok(b.visible('loading'));
  const restarting = a.tick();
  await flush();
  assert.ok(a.visible('loading'));
  await a.timer(2000);
  await restarting;
  await b.timer(2000);
  for (const p of [a, b]) {
    assert.ok(p.visible('home'));
    assert.equal(p.storage.size, 0);
    assert.equal(p.$('winner').childNodes.length, 0);
    assert.equal(p.$('code').textContent, '');
    assert.equal(p.$('preview').getAttribute('src'), null);
  }
  assert.equal(h.files.size, 0);
  for (const n of ['Games', 'Players', 'Entries', 'Votes', 'GameChallenges'])
    assert.equal(h.rows(n).length, 0);
  // A fresh second game must show neither old names nor old photos.
  await a.click('host');
  await a.form('host-form', { hostName: 'New host', challengeCount: 1, gameCode: 'FRESH2' });
  await a.tick();
  assert.equal(a.$('code').textContent, 'FRESH2');
  assert.doesNotMatch(a.$('players').textContent, /Friend|Des/);
});
