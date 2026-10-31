import { Section, Callout, Kbd, Code, RefTable, Feature, FeatureList } from './primitives';

export const startMeta = {
  id: '',
  label: 'Start here',
  title: 'Sajni, explained',
  blurb: 'What Sajni is, the ideas behind how it looks, and how to move around it.',
  sections: [
    { id: 'what', label: 'What Sajni is' },
    { id: 'brand', label: 'The look & the name' },
    { id: 'navigation', label: 'Moving around' },
    { id: 'palette', label: 'Command palette' },
    { id: 'conventions', label: 'House rules' },
    { id: 'offline', label: 'Offline on the phone' },
  ],
};

export default function StartDoc() {
  return (
    <>
      <Section id="what" title="What Sajni Is">
        <p>
          Sajni is a personal knowledge &amp; life system for
          notes, journal, tasks, habits, projects, media and money. It is built
          for one person at a time: your data, your pace, no feed, no
          gamification, no one watching.
        </p>
        <p>
          The design bet is <em>calm density</em>: every space shows a lot
          without shouting. An AI (also called Sajni) lives ambiently inside.
          It can do anything the buttons can do, but it never advertises
          itself. These docs describe every feature, how it behaves, and why it behaves that way.
        </p>
      </Section>

      <Section id="brand" title="The Look & the Name">
        <FeatureList>
          <Feature name="The name">
            <p>
              “Sajni” is a Hindi/Urdu term of endearment meaning <em>beloved</em>.
              The app is meant to feel like that: something personal you
              return to daily, not a productivity dashboard.
            </p>
          </Feature>
          <Feature name="The mark">
            <p>
              The app icon is a mehendi-inspired flower: eight curved petals
              growing from a vermilion centre, framed by small henna dots.
              It follows light, dark, and Android wallpaper themes.
            </p>
          </Feature>
          <Feature name="Type">
            <p>
              Three voices, used strictly: a serif for titles and the figures
              that matter, a monospace for labels, dates and amounts (always
              tabular, so columns never wobble), and a plain sans for body
              text.
            </p>
          </Feature>
          <Feature name="Color & themes">
            <p>
              App surfaces use Material 3 tonal tokens, which is why entire
              themes swap cleanly. Built-in
              presets (Marine, PowerPuff, Gruvbox, Peach, Mauve) and
              AI-generated themes both carry full light <em>and</em> dark
              palettes, so the Appearance toggle flips any of them. See{' '}
              <em>Settings &amp; data</em>.
            </p>
          </Feature>
          <Feature name="Motion">
            <p>Springs, not fades: quick, emphatic, done. Nothing animates for decoration.</p>
          </Feature>
        </FeatureList>
        <Callout>
          Sajni thinks in IST. Days, weeks, months, streaks and budgets all
          roll on Asia/Kolkata wall-clock time, whatever device you're on.
        </Callout>
      </Section>

      <Section id="navigation" title="Moving Around">
        <p>
          Nine spaces sit in the navigation pill, <em>Today, Notes, Journal,
          Tasks, Habits, Projects, Media, Finance, Analytics</em>, each with
          its own docs page in the rail here. Inside a space, a secondary bar
          holds its tabs (Finance's Accounts/Transactions/…, Media's
          Movies/Shows/…). On scroll the two bars merge into one condensed
          pill so content keeps the room.
        </p>
        <p>
          First sign-in runs a short guided tour; replay it any time from
          Settings.
        </p>
      </Section>

      <Section id="palette" title="Command Palette">
        <p>
          Press <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> (or <Kbd>⌘K</Kbd>, or the search
          pill) anywhere. One box, three behaviors:
        </p>
        <FeatureList>
          <Feature name="Universal search">
            <p>
              Fuzzy-searches everything you own: memos, tasks, notes, journal
              entries, habits, media, tags, accounts, transactions, bookmarks.
              Prefix with a type to narrow, plurals and short forms accepted:
            </p>
            <RefTable
              head={['you type', 'it searches']}
              rows={[
                [<Code>task call bank</Code>, 'tasks only (also: todo, todos)'],
                [<Code>note design</Code>, 'notes only'],
                [<Code>txn swiggy</Code>, 'transactions (also: transaction/s)'],
                [<Code>movie dune</Code>, 'media (also: show, book, media)'],
                [<Code>tag goa</Code>, 'tags'],
                [<Code>journal june</Code>, 'journal entries'],
              ]}
            />
          </Feature>
          <Feature name="Quick actions">
            <p>
              Typed like anything else, ranked with results: Theme
              System/Light/Dark, Density Compact/Comfortable/Cozy, Open
              Settings, Sign out.
            </p>
          </Feature>
          <Feature name="Ask Sajni">
            <p>
              Type <Code>@sajni</Code> (or <Code>@s</Code> / <Code>@ai</Code>)
              and a space, the palette flips into AI mode and your next Enter
              asks the question. See the <em>Ask Sajni</em> page.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="conventions" title="House Rules">
        <p>Behaviors that hold everywhere, so the per-page docs don't repeat them:</p>
        <ul>
          <li>
            <strong>#tags are universal.</strong> Write <Code>#tag</Code> in a
            note, memo, task note, transaction note or bookmark. It's
            collected globally, browsable under Analytics → Tags, and every
            tag pill is tappable.
          </li>
          <li>
            <strong>Notifications use both channels, always.</strong> Every
            reminder and alert goes to push (each registered device){' '}
            <em>and</em> email. Miss the ping, catch the mail.
          </li>
          <li>
            <strong>Edits save when you press Save.</strong> Forms (a task, a
            transaction, an account, a habit…) change nothing until{' '}
            <em>Save</em> (or <em>Create</em> / <em>Add</em> for something
            new). Close one with unsaved changes (Esc, ×, Cancel, tapping
            outside; on the phone, back or a swipe down) and it stays open,
            says <em>Unsaved changes</em>, and the phone buzzes; close again
            within a few seconds to discard them. Notes and journal entries
            are writing, not forms: they save on their own.
          </li>
          <li>
            <strong>Abandoning is an outcome, not a deletion.</strong> Tasks
            can be <em>scratched</em>, media <em>dropped</em>, pockets{' '}
            <em>archived</em>. History stays honest instead of vanishing.
          </li>
          <li>
            <strong>Everything the UI does, the AI can do.</strong> A standing
            engineering rule (“AI parity”): each button has a matching tool.
          </li>
          <li>
            <strong>Your data leaves with you.</strong> Full takeout as a
            .zip, finance as CSV, type-to-confirm account deletion. See{' '}
            <em>Settings &amp; data</em>.
          </li>
        </ul>
      </Section>

      <Section id="offline" title="Offline on the Phone">
        <p>
          The Android app keeps a copy of everything you've opened, so it
          still works with no signal: on a flight, in the metro, in a dead
          zone. A small pill above the nav bar says so (<em>Offline · changes
          will sync</em>, or <em>Can't reach Sajni right now</em> when the
          phone is online but the server isn't answering). Pulling to refresh
          shows the saved copy instead of an error.
        </p>
        <FeatureList>
          <Feature name="What works offline">
            <p>
              Writing the journal (day, week and month pages), planning a day
              (adding tasks to a plan, moving them), tasks (add, tick, edit,
              move to tomorrow, delete), memos, logging an expense or income
              (a split included), lending cash, show and book progress, and
              saving a link from the share sheet. Each change shows straight
              away and waits in an outbox; the pill counts them (<em>Offline ·
              3 changes waiting</em>).
            </p>
            <p>
              Everything else (habits, settling lends, notes, the AI,
              search, uploads) needs a connection and says so if you try.
              A screen you never opened online has no copy yet: <em>Not saved
              for offline yet</em>. A journal day you haven't written opens
              empty and saves offline like any other.
            </p>
          </Feature>
          <Feature name="Syncing">
            <p>
              When the connection comes back, the changes go out in the order
              you made them, even if the app is closed by then. The pill reads{' '}
              <em>Syncing 3 changes</em>, then <em>Synced 3 changes</em> for a
              moment. A change can't be filed twice, even if the signal
              drops halfway through sending it.
            </p>
          </Feature>
          <Feature name="When the same thing changed elsewhere">
            <p>
              Field by field, the later edit wins. You tick <em>Pay rent</em>{' '}
              done on the phone in the metro at 9:00; at 9:30 you change its
              title on the web. When the phone syncs, both stick: they touched
              different fields. Had you also renamed it on the phone at 9:00,
              the web's 9:30 title would stay, being later.
            </p>
            <p>
              If Sajni refuses a change when it syncs (say, ticking a task
              whose subtasks were reopened on the web), it's dropped and a
              notice says why: <em>Couldn't sync “Pay rent”: Finish its 2 open
              subtasks first</em>.
            </p>
          </Feature>
        </FeatureList>
      </Section>
    </>
  );
}
