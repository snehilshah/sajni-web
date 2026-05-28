import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * LinkFavicon — decorates every link mark with a leading favicon so links
 * read as rich M3 pills (favicon + title) for known sites (YouTube,
 * GitHub, Google, Wikipedia, …) and everything else. Favicons come from
 * Google's s2 service, so no per-brand icon pack is needed and reloaded
 * `[title](url)` markdown links light up too. Decorations are view-only —
 * they never touch the doc, so markdown round-trips untouched.
 */

function hostOf(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function faviconURL(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

function build(doc: any): DecorationSet {
  const decos: Decoration[] = [];
  let lastHref = '';
  let lastEnd = -1;
  doc.descendants((node: any, pos: number) => {
    if (!node.isText) {
      lastHref = '';
      return;
    }
    const link = node.marks.find((m: any) => m.type.name === 'link');
    if (!link) {
      lastHref = '';
      return;
    }
    const href = String(link.attrs.href || '');
    const host = hostOf(href);
    if (!host) return;
    // Skip if this text node merely continues the previous link run
    // (avoids a second favicon mid-link when marks fragment the text).
    if (href === lastHref && pos === lastEnd) {
      lastEnd = pos + node.nodeSize;
      return;
    }
    decos.push(
      Decoration.widget(
        pos,
        () => {
          const img = document.createElement('img');
          img.src = faviconURL(host);
          img.className = 'link-favicon';
          img.alt = '';
          img.loading = 'lazy';
          img.referrerPolicy = 'no-referrer';
          // Hide gracefully if the favicon 404s.
          img.onerror = () => { img.style.display = 'none'; };
          return img;
        },
        { side: -1, key: `fav:${pos}:${host}` },
      ),
    );
    lastHref = href;
    lastEnd = pos + node.nodeSize;
  });
  return DecorationSet.create(doc, decos);
}

export const LinkFavicon = Extension.create({
  name: 'linkFavicon',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('linkFavicon'),
        props: {
          decorations(state) {
            return build(state.doc);
          },
        },
      }),
    ];
  },
});
