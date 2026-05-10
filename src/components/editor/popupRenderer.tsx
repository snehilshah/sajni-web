import { ReactRenderer } from '@tiptap/react';
import { SuggestionList } from './SuggestionList';

// Renders a SuggestionList in a fixed-positioned popup that follows the caret.
export function makePopupRenderer(emptyText?: string) {
  return () => {
    let component: ReactRenderer | null = null;
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
      onStart: (props: any) => {
        component = new ReactRenderer(SuggestionList, {
          props: { ...props, emptyText },
          editor: props.editor,
        });
        if (!props.clientRect) return;

        popup = document.createElement('div');
        popup.style.position = 'fixed';
        popup.style.zIndex = '9999';
        popup.style.pointerEvents = 'auto';
        document.body.appendChild(popup);
        popup.appendChild(component.element);
        requestAnimationFrame(() => place(props.clientRect?.()));
      },
      onUpdate(props: any) {
        component?.updateProps({ ...props, emptyText });
        place(props.clientRect?.());
      },
      onKeyDown(props: any) {
        if (props.event.key === 'Escape') {
          if (popup) popup.style.display = 'none';
          return true;
        }
        const ref = component?.ref as { onKeyDown?: (props: any) => boolean } | null;
        return Boolean(ref?.onKeyDown?.(props));
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
