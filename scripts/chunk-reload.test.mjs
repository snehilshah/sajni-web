import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = stripTypeScriptTypes(
  await readFile(new URL('../src/lib/chunkReload.ts', import.meta.url), 'utf8'),
).replace(/^export /gm, '');

// Fresh realms model full page reloads while sharing tab-scoped storage.
function page({ storage = new Map(), blocked, online = true, build = '/assets/index-old.js' } = {}) {
  let reloads = 0;
  const window = new EventTarget();
  window.location = { reload: () => { reloads++; } };
  const context = createContext({
    window,
    navigator: { onLine: online },
    document: { querySelector: () => build ? { src: build } : null },
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
  runInContext(`${source}\nglobalThis.api = { isChunkLoadError, isReloadPending, reloadForNewBuild, installChunkReload };`, context);
  return {
    ...context.api,
    reloads: () => reloads,
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

test('concurrent recovery calls trigger only one page reload', () => {
  const app = page();
  assert.equal(app.reloadForNewBuild(), true);
  assert.equal(app.isReloadPending(), true);
  assert.equal(app.reloadForNewBuild(), true);
  assert.equal(app.reloads(), 1);
});

test('a second failure in the same build survives a full page reload without looping', () => {
  const storage = new Map();
  assert.equal(page({ storage }).reloadForNewBuild(), true);
  const reloaded = page({ storage });
  assert.equal(reloaded.reloadForNewBuild(), false);
  assert.equal(reloaded.isReloadPending(), false);
  assert.equal(reloaded.reloads(), 0);
});

test('a different entry bundle can recover after a subsequent deployment', () => {
  const storage = new Map();
  assert.equal(page({ storage }).reloadForNewBuild(), true);
  assert.equal(page({ storage, build: '/assets/index-new.js' }).reloadForNewBuild(), true);
});

for (const blocked of ['read', 'write']) {
  test(`blocked storage ${blocked} leaves the original failure visible`, () => {
    const app = page({ blocked });
    app.installChunkReload();
    assert.equal(app.preload('Failed to fetch dynamically imported module'), false);
    assert.equal(app.reloads(), 0);
    assert.equal(app.isReloadPending(), false);
  });
}

test('offline and unidentified builds do not reload', () => {
  for (const options of [{ online: false }, { build: null }]) {
    const app = page(options);
    assert.equal(app.reloadForNewBuild(), false);
    assert.equal(app.reloads(), 0);
  }
});

test('Vite application errors remain visible and do not consume a recovery attempt', () => {
  const app = page();
  app.installChunkReload();
  assert.equal(app.preload('Module initialization failed'), false);
  assert.equal(app.reloads(), 0);
  assert.equal(app.preload('Unable to preload CSS for /assets/old.css'), true);
  assert.equal(app.reloads(), 1);
});

test('installing twice does not swallow an error after the recovery limit', () => {
  const storage = new Map();
  const app = page({ storage });
  app.installChunkReload();
  app.installChunkReload();
  assert.equal(app.preload('Importing a module script failed'), true);
  assert.equal(app.reloads(), 1);
  const reloaded = page({ storage });
  reloaded.installChunkReload();
  assert.equal(reloaded.preload('Importing a module script failed'), false);
  assert.equal(reloaded.reloads(), 0);
});
