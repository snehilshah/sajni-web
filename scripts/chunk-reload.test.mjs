import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = stripTypeScriptTypes(
  await readFile(new URL('../src/lib/chunkReload.ts', import.meta.url), 'utf8'),
).replace(/^export /gm, '');

// Fresh realms model full page reloads while sharing tab-scoped storage.
// `deployed` is what /version.json answers (null = unreachable); this tab
// runs build `build-a`. Timers are manual so backoffs can be observed.
function page({ storage = new Map(), blocked, online = true, deployed = 'build-a', now = () => 1_000_000 } = {}) {
  let reloads = 0;
  const timers = [];
  const window = new EventTarget();
  window.location = { reload: () => { reloads++; } };
  window.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const context = createContext({
    window,
    __BUILD_ID__: 'build-a',
    Date: { now },
    JSON,
    Array,
    navigator: { onLine: online },
    fetch: async () => {
      if (deployed === null) throw new TypeError('Failed to fetch');
      return { ok: true, json: async () => ({ build: deployed }) };
    },
    sessionStorage: {
      getItem(key) {
        if (blocked === 'read') throw new Error('Storage blocked');
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        if (blocked === 'write') throw new Error('Storage full');
        storage.set(key, value);
      },
    },
  });
  runInContext(`${source}\nglobalThis.api = { isChunkLoadError, isReloadPending, startRecovery, installChunkReload };`, context);
  return {
    ...context.api,
    reloads: () => reloads,
    // Let the version check settle, then report the scheduled backoffs.
    async settle() {
      for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
      return timers.map((t) => t.ms);
    },
    fireTimers() { timers.splice(0).forEach((t) => t.fn()); },
    preload(message) {
      const event = new Event('vite:preloadError', { cancelable: true });
      event.payload = runInContext(`new TypeError(${JSON.stringify(message)})`, context);
      window.dispatchEvent(event);
      return event.defaultPrevented;
    },
  };
}

test('recognizes browser import and CSS failures without matching application errors', () => {
  const app = page();
  for (const message of [
    'Failed to fetch dynamically imported module: https://example.com/old.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/old.css',
    'Loading chunk 123 failed',
    'Loading CSS chunk 123 failed',
  ]) assert.equal(app.isChunkLoadError(message), true, message);
  for (const value of [null, undefined, {}, 'Cannot read properties of undefined', 'Module initialization failed']) {
    assert.equal(app.isChunkLoadError(value), false);
  }
});

test('a newer deployed build reloads straight away', async () => {
  const app = page({ deployed: 'build-b' });
  assert.equal(app.startRecovery(), true);
  assert.deepEqual(await app.settle(), [0]);
  app.fireTimers();
  assert.equal(app.reloads(), 1);
});

test('the same build (network failure) reloads after a backoff', async () => {
  const app = page({ deployed: 'build-a' });
  assert.equal(app.startRecovery(), true);
  assert.deepEqual(await app.settle(), [1000]);
  assert.equal(app.reloads(), 0);
  app.fireTimers();
  assert.equal(app.reloads(), 1);
});

test('an unreachable version file is treated as a network failure', async () => {
  const app = page({ deployed: null });
  assert.equal(app.startRecovery(), true);
  assert.deepEqual(await app.settle(), [1000]);
});

test('concurrent recovery calls schedule only one reload', async () => {
  const app = page({ deployed: 'build-b' });
  assert.equal(app.startRecovery(), true);
  assert.equal(app.isReloadPending(), true);
  assert.equal(app.startRecovery(), true);
  assert.equal((await app.settle()).length, 1);
});

test('reloads are budgeted across page loads, and the budget recovers', async () => {
  const storage = new Map();
  let clock = 1_000_000;
  const now = () => clock;
  const backoffs = [];
  for (let i = 0; i < 3; i++) {
    const app = page({ storage, now });
    assert.equal(app.startRecovery(), true, `reload ${i + 1}`);
    backoffs.push(...await app.settle());
    clock += 1000;
  }
  assert.deepEqual(backoffs, [1000, 2000, 3000]);
  const spent = page({ storage, now });
  assert.equal(spent.startRecovery(), false);
  assert.equal(spent.isReloadPending(), false);
  clock += 2 * 60_000;
  assert.equal(page({ storage, now }).startRecovery(), true);
});

for (const blocked of ['read', 'write']) {
  test(`blocked storage ${blocked} leaves the original failure visible`, async () => {
    const app = page({ blocked });
    app.installChunkReload();
    assert.equal(app.preload('Failed to fetch dynamically imported module'), false);
    assert.deepEqual(await app.settle(), []);
    assert.equal(app.isReloadPending(), false);
  });
}

test('offline tabs do not reload', async () => {
  const app = page({ online: false });
  assert.equal(app.startRecovery(), false);
  assert.deepEqual(await app.settle(), []);
});

test('Vite application errors remain visible and do not consume a recovery attempt', async () => {
  const app = page({ deployed: 'build-b' });
  app.installChunkReload();
  assert.equal(app.preload('Module initialization failed'), false);
  assert.deepEqual(await app.settle(), []);
  assert.equal(app.preload('Unable to preload CSS for /assets/old.css'), true);
  assert.deepEqual(await app.settle(), [0]);
});

test('installing twice does not double-handle, and a spent budget stops swallowing', async () => {
  const storage = new Map();
  for (let i = 0; i < 3; i++) {
    const app = page({ storage });
    app.installChunkReload();
    app.installChunkReload();
    assert.equal(app.preload('Importing a module script failed'), true);
    assert.equal((await app.settle()).length, 1);
  }
  const spent = page({ storage });
  spent.installChunkReload();
  assert.equal(spent.preload('Importing a module script failed'), false);
});
