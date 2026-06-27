import { ReactRenderer } from '@tiptap/react';
import type { ComponentProps } from 'react';
import { SuggestionList } from './SuggestionList';
import type { Item, ItemRef, KeyProps, PopProps } from './types';

type ListProps = ComponentProps<typeof SuggestionList>;

// Renders a SuggestionList in a fixed-positioned popup that follows the caret.
export function makePopupRenderer<T extends Item = Item>(emptyText?: string) {
  return () => {
    let component: ReactRenderer<ItemRef, ListProps> | null = null;
    let popup: HTMLDivElement | null = null;

    const place = (rect: DOMRect | null) => {
      if (!popup || !rect) return;
      const margin = 8;
      const popupWidth = popup.offsetWidth || 240;
      const popupHeight = popup.offsetHeight || 80;

      let left = rect.left;
      const viewportRight = window.innerWidth - margin;
      if (left + popupWidth > viewportRight) {
        left = Math.max(margin, viewportRight - popupWidth);
      }

      let top = rect.bottom + 4;
      if (top + popupHeight > window.innerHeight - margin) {
        top = rect.top - popupHeight - 4;
      }

      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    };

    return {
      onStart: (props: PopProps<T>) => {
        component = new ReactRenderer(SuggestionList, {
          props: { ...props, emptyText },
          editor: props.editor,
        });
        if (!props.clientRect) return;
        // Defer mounting the popup DOM until items actually exist. Empty
        // items happen when the upstream Suggestion fires for a position
        // the user didn't actively trigger (e.g. loading a doc that
        // already contains the trigger char). Without this, we'd paint a
        // "no matches" pill over the editor on every page open.
        if (!props.items || props.items.length === 0) return;

        popup = document.createElement('div');
        popup.style.position = 'fixed';
        popup.style.zIndex = '9999';
        popup.style.pointerEvents = 'auto';
        document.body.appendChild(popup);
        popup.appendChild(component.element);
        requestAnimationFrame(() => place(props.clientRect?.() ?? null));
      },
      onUpdate(props: PopProps<T>) {
        component?.updateProps({ ...props, emptyText });
        const hasItems = (props.items?.length ?? 0) > 0;
        if (hasItems && !popup && props.clientRect && component) {
          // Late mount: the popup was suppressed on start (empty items)
          // but the user has since typed enough to produce matches.
          popup = document.createElement('div');
          popup.style.position = 'fixed';
          popup.style.zIndex = '9999';
          popup.style.pointerEvents = 'auto';
          document.body.appendChild(popup);
          const el = component.element;
          popup.appendChild(el);
        }
        if (!hasItems && popup) {
          // Items vanished — drop the popup so we don't show a "No matches"
          // shell when the user backspaces past the trigger.
          if (popup.parentNode) popup.parentNode.removeChild(popup);
          popup = null;
          return;
        }
        place(props.clientRect?.() ?? null);
      },
      onKeyDown(props: KeyProps) {
        if (props.event.key === 'Escape') {
          if (popup) popup.style.display = 'none';
          return true;
        }
        return Boolean(component?.ref?.onKeyDown?.(props));
      },
      onExit() {
        if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
        popup = null;
        component?.destroy();
        component = null;
      },
    };
  };
}
