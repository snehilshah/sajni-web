import type { Editor, Range } from '@tiptap/core';
import type { Node as PMNode, Mark } from '@tiptap/pm/model';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import type { MarkdownSerializerState } from 'prosemirror-markdown';
import type { MarkdownStorage } from 'tiptap-markdown';
import type MarkdownIt from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline';
import type { ComponentType } from 'react';

export interface Item {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  action?: () => void;
}

export interface ItemRef {
  onKeyDown?: (props: SuggestionKeyDownProps) => boolean;
}

export type Icon = ComponentType<{ className?: string }>;
export type KeyProps = SuggestionKeyDownProps;
export type PopProps<T extends Item = Item> = SuggestionProps<T, T>;
export type Cmd<T extends Item = Item> = { editor: Editor; range: Range; props: T };
export type RunProps = { editor: Editor; range: Range };
export type Md = MarkdownIt;
export type MdState = MarkdownSerializerState;
export type MdNode = PMNode;
export type MdMark = Mark;
export type InlineState = StateInline;
export type OpenFn = (range: Range) => void;

export interface Store {
  markdown: MarkdownStorage;
  taskchip?: { onOpen: OpenFn | null };
  linkEntry?: { onOpen: OpenFn | null };
}

export function store(editor: Editor): Store {
  return editor.storage as unknown as Store;
}
