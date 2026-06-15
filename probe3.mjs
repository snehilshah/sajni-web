const noop = () => {};
const mm = () => ({ matches:false, media:'', onchange:null, addEventListener:noop, removeEventListener:noop, addListener:noop, removeListener:noop, dispatchEvent:()=>false });
globalThis.localStorage = { getItem:()=>null, setItem:noop, removeItem:noop, clear:noop, key:()=>null, length:0 };
globalThis.matchMedia = mm;
globalThis.location = { search:'', pathname:'/finance', href:'http://localhost/finance', hash:'', origin:'http://localhost', assign:noop, replace:noop };
globalThis.window = globalThis;
globalThis.addEventListener = noop; globalThis.removeEventListener = noop; globalThis.dispatchEvent = ()=>false;
globalThis.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
globalThis.requestAnimationFrame = (cb)=>setTimeout(cb,0); globalThis.cancelAnimationFrame = noop;
globalThis.scrollTo = noop; globalThis.scrollY = 0;

import { createServer } from 'vite';
const ext = ['react','react-dom','react-dom/server','react/jsx-runtime','react/jsx-dev-runtime','scheduler','@tanstack/react-query','react-router-dom'];
const s = await createServer({ server:{ middlewareMode:true }, appType:'custom', logLevel:'silent', ssr:{ external: ext } });
const React = (await import('react')).default;
const { renderToString } = await import('react-dom/server');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter } = await import('react-router-dom');

for (const [p, route] of [['/src/pages/Finance/FinancePage.tsx','/finance'], ['/src/pages/MediaPage.tsx','/media']]) {
  globalThis.location.pathname = route; globalThis.location.href = 'http://localhost'+route;
  try {
    const mod = await s.ssrLoadModule(p);
    const Comp = mod.default;
    const qc = new QueryClient({ defaultOptions:{ queries:{ retry:false } } });
    renderToString(React.createElement(QueryClientProvider, { client: qc },
        React.createElement(MemoryRouter, { initialEntries:[route] }, React.createElement(Comp))));
    console.log('RENDER OK  ', p);
  } catch (e) {
    const msg = (e && e.stack) ? e.stack : String(e);
    console.log('RENDER FAIL', p, '\n', msg.split('\n').slice(0,8).join('\n'));
  }
}
await s.close();
