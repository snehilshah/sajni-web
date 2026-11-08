import { Section, Callout, Code, Kbd, RefTable, Feature, FeatureList } from './primitives';

export const notesMeta = {
  id: 'notes',
  label: 'Notes',
  title: 'Notes & Memos',
  blurb: 'Long-form writing in plain Markdown, and a frictionless inbox for half-formed thoughts.',
  sections: [
    { id: 'notes', label: 'Notes' },
    { id: 'editor', label: 'The editor' },
    { id: 'memos', label: 'Memos' },
  ],
};

export default function NotesDoc() {
  return (
    <>
      <Section id="notes" title="Notes" chip="notes tab">
        <p>
          Notes are titled, long-form documents. Rule of thumb across the two
          tabs: <em>if it has a title, it's a note; if it's a flash, it's a
          memo.</em>
        </p>
        <FeatureList>
          <Feature name="The library">
            <p>
              The left rail lists folders and notes as one tree: folders first,
              pinned items at the top of their group, the number beside a folder
              counts every note inside it. Click a folder to open or close it;
              what you open is remembered. Each row's <Kbd>⋯</Kbd> (or a
              right-click) holds the rest: new note or folder inside it,
              rename, pin, move, delete. Drag a note onto a folder to move it,
              or onto the empty space below to take it out of every folder.
            </p>
            <p>
              The search box filters titles and tags as you type. With no note
              open, the page lists what you edited most recently.
            </p>
            <p>
              Drag the inner edge of the library (or of Details) to make it
              wider or narrower; the width is remembered. Double-click the edge
              to reset it.
            </p>
          </Feature>
          <Feature name="Writing is instant">
            <p>
              Your title shows in the library as you type it, and everything
              saves on its own a moment after you stop. The bar at the bottom
              right says{' '}
              <em>Saving</em> and then <em>Saved</em>; if the connection drops it
              says <em>Retry save</em>. <Kbd>Ctrl</Kbd>+<Kbd>S</Kbd> saves at
              once. Switching notes or closing the tab saves first.
            </p>
          </Feature>
          <Feature name="Where a note lives">
            <p>
              The path above the title (<em>Notes › Work › Plans</em>) is also
              the way to move it: click it and pick a folder. A new note starts in
              the folder of the note you had open; choose another the same way
              before or after you write.
            </p>
          </Feature>
          <Feature name="Details">
            <p>
              The right rail (<Kbd>Details</Kbd> in the <Kbd>⋯</Kbd> menu on
              smaller screens) has the note's description, its outline (click a
              heading to jump), what links to it, what it links to and its
              tags. When the note was last edited shows above its title; when
              it was created is at the foot of the <Kbd>⋯</Kbd> menu (on a
              phone, along with when it was edited and its length).
            </p>
            <p>
              The <strong>description</strong> is one line on what the note is
              about, so it can be found by meaning as well as by title.
            </p>
          </Feature>
          <Feature name="Calm and focus">
            <p>
              The view switch, word count, Details and <Kbd>⋯</Kbd> sit in a
              small bar at the bottom right. Start typing and everything but
              the text fades out: that bar and the nav pill. Move the mouse (or
              scroll up) and they come back. Reading works the same way: scroll
              down and the chrome steps aside. Long notes run under the nav
              pill and fade out at the top edge.
            </p>
            <p>
              <strong>Focus</strong> (<Kbd>Ctrl</Kbd>+<Kbd>.</Kbd>, or{' '}
              <Kbd>⋯</Kbd> → Focus) also folds both rails away. <Kbd>Esc</Kbd>{' '}
              or <Kbd>Ctrl</Kbd>+<Kbd>.</Kbd> brings them back.
            </p>
            <p>
              Text uses the whole width of the page, with a steady margin on
              the left. <Kbd>⋯</Kbd> → <strong>Readable width</strong> keeps it
              to a narrow column, about a book page wide; <strong>Full
              width</strong> goes back. The choice is remembered. The buttons that hide and show
              the library and Details sit in the bottom corners, in the same
              place whether the panel is open or closed.
            </p>
          </Feature>
          <Feature name="Pin">
            <p>
              Both notes and folders pin. Pinning is ordering, nothing more.
            </p>
          </Feature>
          <Feature name="Share a link">
            <p>
              <Kbd>⋯</Kbd> → <strong>Copy link</strong> copies the note's web
              address, so it opens straight to that note. To link one note from
              another, type <Kbd>[[</Kbd> instead.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="editor" title="The Editor">
        <p>
          Everything you write is plain Markdown, stored exactly as you typed
          it. The same editor is used in Notes, the Journal and a task's notes.
          Notes has three ways to look at it (the switch at the bottom right;
          on a phone, at the top):
        </p>
        <RefTable
          head={['mode', 'what you see']}
          rows={[
            ['Live', 'Formatted, except the line you are on, which shows its Markdown so you can edit it. The default.'],
            ['Source', 'All the Markdown, with the symbols dimmed and headings sized.'],
            ['Read', 'Formatted and not editable. Links open with a click. Ctrl+E switches between Live and Read.'],
          ]}
        />
        <p>
          For example, typing <Code>## Plan</Code> on a line shows a heading
          the moment the cursor leaves it; click back into it and the{' '}
          <Code>##</Code> is there again.
        </p>
        <RefTable
          head={['type', 'to get']}
          rows={[
            ['/', 'The menu: headings, lists, checklist, task, quote, code block, table, divider, highlight, link, image, time, date'],
            ['[[', 'A link to a note (pick one, or type a new title: clicking it creates the note), or to a journal day'],
            ['#', 'A tag; the list suggests the ones you already use'],
            ['@', 'A time chip: @now, @9:30, @4pm, or a range like @9-18:30'],
            ['==text==', 'Highlighted text'],
            ['- [ ] ', 'A checkbox; click it to tick'],
          ]}
        />
        <p>
          While a list of suggestions is open, <Kbd>Tab</Kbd> or{' '}
          <Kbd>Enter</Kbd> takes the highlighted one and <Kbd>Esc</Kbd> closes
          it. A half-typed time already counts: <Code>@4:3</Code> offers 04:30.
        </p>
        <FeatureList>
          <Feature name="Task chips (/task)">
            <p>
              Pick an open task or create one; it appears in the text as a small
              chip with its title, a ring that fills when it's done, and its due
              date (red when overdue). The chip always shows the task as it is
              now, so renaming or finishing the task updates every note that
              mentions it. Click it to open the task. In the Markdown it's{' '}
              <Code>[[task:42|Call the bank]]</Code>.
            </p>
          </Feature>
          <Feature name="Tables, code and highlights">
            <p>
              Tables show as tables; click one to edit its Markdown. Code
              blocks are coloured by language (write it after the opening
              fence, like <Code>```go</Code>).
            </p>
          </Feature>
          <Feature name="Images and links">
            <p>
              Paste or drop a picture to upload it into the note. Paste a web
              address and it becomes a link; Sajni offers the page's title to
              use as its text. <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> turns selected
              text into a link. While editing, <Kbd>Ctrl</Kbd>-click opens a
              link.
            </p>
          </Feature>
          <Feature name="Shortcuts">
            <p>
              <Kbd>Ctrl</Kbd>+<Kbd>B</Kbd> bold · <Kbd>Ctrl</Kbd>+<Kbd>I</Kbd>{' '}
              italic · <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>H</Kbd> highlight ·{' '}
              <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>C</Kbd> checklist ·{' '}
              <Kbd>Ctrl</Kbd>+<Kbd>Alt</Kbd>+<Kbd>1–3</Kbd> headings ·{' '}
              <Kbd>Tab</Kbd> indents a list item · <Kbd>Alt</Kbd>+<Kbd>N</Kbd>{' '}
              new note. On a touch screen a small formatting bar appears while
              you type.
            </p>
          </Feature>
          <Feature name="#tags">
            <p>
              <Code>#tag</Code> anywhere in the text files the note under that
              tag (Analytics → Tags). In Read mode a tag opens its page.
            </p>
          </Feature>
          <Feature name="On the phone: read first, write when you mean to">
            <p>
              In the Android app a note opens as a page to read: headings,
              lists, quotes, tables and highlights are formatted, and checklist
              boxes tick with a tap (the note saves itself). Tap{' '}
              <strong>Edit</strong> or double-tap the page to write. New notes
              open straight to writing.
            </p>
            <p>
              While you write, the Markdown is styled as you type:{' '}
              <Code>## Plan</Code> shows as a heading,{' '}
              <Code>**done**</Code> as bold, and the symbols fade back. The
              formatting bar sits on the keyboard. Scroll down to read and the
              top bar and the nav dock fade out; scroll up or tap the page to
              bring them back.
            </p>
          </Feature>
        </FeatureList>
        <Callout tone="why">
          <Code>/task</Code> exists because meeting notes breed commitments.
          Without it you either lose the commitment in prose or duplicate it
          by hand into Tasks, and duplicates always drift.
        </Callout>
      </Section>

      <Section id="memos" title="Memos" chip="memos tab">
        <p>
          Memos are the capture inbox: no title, no folder, no friction. Type,
          save, move on.
        </p>
        <FeatureList>
          <Feature name="Quick capture">
            <p>
              A single text box at the top; entries stack newest-first.
              <Code>#tags</Code> work; pinning keeps a memo at the top.
            </p>
          </Feature>
          <Feature name="The Echo loop">
            <p>
              Memos don't rot silently: the Today page resurfaces a memo from
              3+ days ago (“Echo from earlier”). On re-read it either
              graduates, into a note, a task, a project card, or gets
              deleted with a clear conscience.
            </p>
          </Feature>
        </FeatureList>
      </Section>
    </>
  );
}
