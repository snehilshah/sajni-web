import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import { SuggestionList } from './SuggestionList';
import { tags, notes } from '@/api';

function createRender() {
  return () => {
    let component: ReactRenderer;
    let popupNode: HTMLDivElement | null = null;

    return {
      onStart: (props: any) => {
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
        popupNode.style.left = `${rect.left + window.scrollX}px`;
        popupNode.style.top = `${rect.bottom + window.scrollY}px`;
      },
      onUpdate(props: any) {
        component.updateProps(props);
        if (!props.clientRect || !popupNode) return;
        
        const rect = props.clientRect();
        popupNode.style.left = `${rect.left + window.scrollX}px`;
        popupNode.style.top = `${rect.bottom + window.scrollY}px`;
      },
      onKeyDown(props: any) {
        if (props.event.key === 'Escape') {
          if (popupNode) popupNode.style.display = 'none';
          return true;
        }
        return (component.ref as any)?.onKeyDown(props);
      },
      onExit() {
        if (popupNode && popupNode.parentNode) {
          popupNode.parentNode.removeChild(popupNode);
        }
        component.destroy();
      },
    };
  };
}

export const AutocompleteExtension = Extension.create({
  name: 'autocomplete',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '#',
        pluginKey: new PluginKey('tagsSuggestion'),
        items: async ({ query }) => {
          try {
            const res = await tags.list();
            return res
              .filter((t) => t.tag.toLowerCase().includes(query.toLowerCase()))
              .map((t) => ({ title: t.tag, subtitle: `${t.count} items` }))
              .slice(0, 5);
          } catch (e) {
            return [];
          }
        },
        render: createRender(),
        command: ({ editor, range, props }) => {
          editor.chain().focus().insertContentAt(range, `#${props.title} `).run();
        },
      }),
      Suggestion({
        editor: this.editor,
        char: '[[',
        pluginKey: new PluginKey('backlinkSuggestion'),
        items: async ({ query }) => {
          try {
            const res = await notes.list({ search: query });
            return res.map((n) => ({ title: n.title })).slice(0, 5);
          } catch (e) {
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
