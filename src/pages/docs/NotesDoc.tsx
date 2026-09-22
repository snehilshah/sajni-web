import { Section, Callout, Code, Kbd, RefTable, Feature, FeatureList } from './primitives';

export const notesMeta = {
  id: 'notes',
  label: 'Notes',
  title: 'Notes',
  blurb: 'Long-form writing with folders, structure, backlinks, and inline task references.',
  sections: [
    { id: 'notes', label: 'Notes' },
    { id: 'editor', label: 'The editor' },
  ],
};

export default function NotesDoc() {
  return (
    <>
      <Section id="notes" title="Notes">
        <p>
          Notes are titled, long-form documents for writing that needs more
          structure than a quick capture.
        </p>
        <FeatureList>
          <Feature name="The index">
            <p>
              With no note open, Notes is an index rather than a card wall:
              rows grouped into folder sections, pinned notes in a strip at
              the top. Each section header is a toggle — the chevron and
              folder icon fold that folder's notes away and back. It's a
              reveal, not a route: the index never navigates <em>into</em> a
              folder, so the other sections stay where they are. What you
              fold is remembered per browser; anything you haven't touched
              starts open.
            </p>
          </Feature>
          <Feature name="Vault tree (folders)">
            <p>
              Notes live in nested folders (paths like{' '}
              <Code>projects/sajni</Code>). The tree sorts folders first, then
              notes; <strong>pinned</strong> folders and notes float to the
              top of their group. On mobile the tree slides in as a left
              sheet.
            </p>
          </Feature>
          <Feature name="Pin">
            <p>
              Both notes and folders pin. Pinning is ordering, nothing more —
              no badges, no notifications.
            </p>
          </Feature>
          <Feature name="Description">
            <p>
              A one-line subtitle shown in the tree and in search results, so
              a note can be found by what it's <em>about</em>, not just its
              title.
            </p>
          </Feature>
          <Feature name="Backlinks">
            <p>
              Every note shows what links to it — journal entries and other
              notes that reference it. Backlinks are collected server-side on
              save; you never maintain them.
            </p>
          </Feature>
          <Feature name="Search">
            <p>
              The in-page search filters the tree live; the global palette
              (<Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> → <Code>note …</Code>) searches
              titles, descriptions and content.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="editor" title="The editor">
        <p>
          The rich editor (used by Notes; the journal shares its link and tag
          behavior) is block-based. Type <Kbd>/</Kbd> on an empty line for
          the block menu:
        </p>
        <RefTable
          head={['command', 'what it inserts']}
          rows={[
            ['/heading 1 · 2 · 3', 'Section headings, three sizes'],
            ['/bullet list', 'Unordered list'],
            ['/numbered list', 'Ordered list'],
            ['/to-do list', 'Checkboxes inside the note'],
            ['/quote', 'Blockquote'],
            ['/code block', 'Multi-line code'],
            ['/divider', 'Horizontal rule'],
            ['/link', 'A titled link via a small dialog'],
            ['/task', 'Creates a REAL task and references it inline'],
          ]}
        />
        <FeatureList>
          <Feature name="Task chips (/task)">
            <p>
              The chip in your note <em>is</em> the task — one object, two
              views. Check it in Tasks and the chip reflects it; the chip
              opens the full task sheet. Notes stay prose; commitments stay
              in the task system.
            </p>
          </Feature>
          <Feature name="#tags">
            <p>
              <Code>#tag</Code> anywhere in the text files the note under
              that tag globally (Analytics → Tags). Tag pills render inline
              and are tappable.
            </p>
          </Feature>
        </FeatureList>
        <Callout tone="why">
          <Code>/task</Code> exists because meeting notes breed commitments.
          Without it you either lose the commitment in prose or duplicate it
          by hand into Tasks — and duplicates always drift.
        </Callout>
      </Section>
    </>
  );
}
