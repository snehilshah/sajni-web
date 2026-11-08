import type { ReactNode } from 'react';

import type { BacklinkRef } from '@/types';
import TagPill from '@/components/TagPill';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowDownLeft, ArrowUpRight, PanelRightClose } from '@/components/ui/icons';
import { fullTime, type OutgoingLink, type OutlineItem } from './model';

const KIND: Record<string, string> = { note: 'Note', journal: 'Journal', memo: 'Memo', task: 'Task' };

/**
 * The open note's context: description, outline, links both ways, tags and
 * when it was made. Sections are a label and space; empty ones hide.
 */
export default function NoteContext({
  description, onDescription, outline, onOutline, backlinks, onBacklink, outgoing, onOutgoing, tags,
  createdAt, updatedAt, onCollapse,
}: {
  description: string;
  onDescription: (v: string) => void;
  outline: OutlineItem[];
  onOutline: (item: OutlineItem) => void;
  backlinks: BacklinkRef[];
  onBacklink: (b: BacklinkRef) => void;
  outgoing: OutgoingLink[];
  onOutgoing: (l: OutgoingLink) => void;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
  onCollapse?: () => void;
}) {
  const minLevel = Math.min(...outline.map((o) => o.level), 6);
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 pl-4 pr-2">
        <h2 className="flex-1 text-sm font-medium text-muted-foreground">Details</h2>
        {onCollapse && (
          <Button size="icon-sm" variant="ghost" className="rounded-full" title="Hide details" aria-label="Hide details" onClick={onCollapse}>
            <PanelRightClose className="size-4" />
          </Button>
        )}
      </header>
      <div className="stable-scrollbar flex-1 min-h-0 overflow-y-auto px-4 pb-8 flex flex-col gap-6">
        <Section label="Description">
          <Textarea
            value={description}
            onChange={(e) => onDescription(e.target.value)}
            placeholder="What this note is about"
            aria-label="Description"
            className="min-h-0 rounded-lg bg-[hsl(var(--surface-container))] px-2.5 py-2 text-sm leading-relaxed"
          />
        </Section>

        {outline.length > 0 && (
          <Section label="Outline">
            <nav className="-mx-2 flex flex-col">
              {outline.map((item) => (
                <button
                  key={`${item.index}:${item.text}`}
                  type="button"
                  onClick={() => onOutline(item)}
                  title={item.text}
                  className="truncate rounded-md py-1 pr-2 text-left text-sm text-muted-foreground transition-colors hover:bg-[hsl(var(--surface-container-high))] hover:text-foreground"
                  style={{ paddingLeft: 8 + (item.level - minLevel) * 12 }}
                >
                  {item.text}
                </button>
              ))}
            </nav>
          </Section>
        )}

        {backlinks.length > 0 && (
          <Section label={`Linked from · ${backlinks.length}`}>
            <div className="-mx-2 flex flex-col">
              {backlinks.map((b) => (
                <LinkRow key={`${b.source_type}:${b.source_id}`} icon={<ArrowDownLeft className="size-3.5" />} title={b.title || 'Untitled'} meta={KIND[b.source_type] ?? b.source_type} onClick={() => onBacklink(b)} />
              ))}
            </div>
          </Section>
        )}

        {outgoing.length > 0 && (
          <Section label={`Links to · ${outgoing.length}`}>
            <div className="-mx-2 flex flex-col">
              {outgoing.map((l) => (
                <LinkRow key={l.ref.toLowerCase()} icon={<ArrowUpRight className="size-3.5" />} title={l.title} meta={l.id ? undefined : 'New'} onClick={() => onOutgoing(l)} />
              ))}
            </div>
          </Section>
        )}

        {tags.length > 0 && (
          <Section label="Tags">
            <div className="flex flex-wrap gap-1.5">{tags.map((t) => <TagPill key={t} tag={t} />)}</div>
          </Section>
        )}

        {(createdAt || updatedAt) && (
          <dl className="mt-auto grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {createdAt && <><dt>Created</dt><dd className="text-foreground/80">{fullTime(createdAt)}</dd></>}
            {updatedAt && <><dt>Edited</dt><dd className="text-foreground/80">{fullTime(updatedAt)}</dd></>}
          </dl>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label}>
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">{label}</h3>
      {children}
    </section>
  );
}

function LinkRow({ icon, title, meta, onClick }: { icon: ReactNode; title: string; meta?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-[hsl(var(--surface-container-high))]"
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="flex-1 truncate">{title}</span>
      {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
    </button>
  );
}
