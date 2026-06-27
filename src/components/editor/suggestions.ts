import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import type { ComponentProps } from 'react';
import { SuggestionList } from './SuggestionList';
import { tags, notes } from '@/api';
import type { Item, ItemRef, KeyProps, PopProps } from './types';

type ListProps = ComponentProps<typeof SuggestionList>;

function createRender() {
  return () => {
    let component: ReactRenderer<ItemRef, ListProps> | null = null;
    let popupNode: HTMLDivElement | null = null;

    return {
      onStart: (props: PopProps<Item>) => {
        component = new ReactRenderer(SuggestionList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) return;

        popupNode = document.createElement('div');
        popupNode.style.position = 'absolute';
        popupNode.style.zIndex = '9999';
        popupNode.style.pointerEvents = 'auto';
        document.body.appendChild(popupNode);
        popupNode.appendChild(component.element);

        const rect = props.clientRect();
        if (!rect) return;
        popupNode.style.left = `${rect.left + window.scrollX}px`;
        popupNode.style.top = `${rect.bottom + window.scrollY}px`;
      },
      onUpdate(props: PopProps<Item>) {
        component?.updateProps(props);
        if (!props.clientRect || !popupNode) return;
        
        const rect = props.clientRect();
        if (!rect) return;
        popupNode.style.left = `${rect.left + window.scrollX}px`;
        popupNode.style.top = `${rect.bottom + window.scrollY}px`;
      },
      onKeyDown(props: KeyProps) {
        if (props.event.key === 'Escape') {
          if (popupNode) popupNode.style.display = 'none';
          return true;
        }
        return Boolean(component?.ref?.onKeyDown?.(props));
      },
      onExit() {
        if (popupNode && popupNode.parentNode) {
          popupNode.parentNode.removeChild(popupNode);
        }
        component?.destroy();
        component = null;
      },
    };
  };
}

export const AutocompleteExtension = Extension.create({
  name: 'autocomplete',

  addProseMirrorPlugins() {
    return [
      Suggestion<Item, Item>({
        editor: this.editor,
        char: '#',
        pluginKey: new PluginKey('tagsSuggestion'),
        items: async ({ query }) => {
          try {
            const res = await tags.list();
            return res
              .filter((t) => t.tag.toLowerCase().includes(query.toLowerCase()))
              .map((t) => ({ id: t.tag, title: t.tag, subtitle: `${t.count} items` }))
              .slice(0, 5);
          } catch {
            return [];
          }
        },
        render: createRender(),
        command: ({ editor, range, props }) => {
          editor.chain().focus().insertContentAt(range, `#${props.title} `).run();
        },
      }),
      Suggestion<Item, Item>({
        editor: this.editor,
        char: '[[',
        pluginKey: new PluginKey('backlinkSuggestion'),
        items: async ({ query }) => {
          try {
            const res = await notes.list({ search: query });
            return res.map((n) => ({ id: n.title, title: n.title || 'Untitled' })).slice(0, 5);
          } catch {
            return [];
          }
        },
        render: createRender(),
        command: ({ editor, range, props }) => {
          editor.chain().focus().insertContentAt(range, `[[${props.title}]] `).run();
        },
      }),
    ];
  },
});
