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
  ],
};

export default function StartDoc() {
  return (
    <>
      <Section id="what" title="What Sajni is">
        <p>
          Sajni is a personal knowledge &amp; life system — one quiet codex for
          notes, journal, tasks, habits, projects, media and money. It is built
          for one person at a time: your data, your pace, no feed, no
          gamification, no one watching.
        </p>
        <p>
          The design bet is <em>calm density</em>: every space shows a lot
          without shouting. An AI (also called Sajni) lives ambiently inside —
          it can do anything the buttons can do, but it never advertises
          itself. These docs describe every feature, how it behaves, and — where
          it isn't obvious — why it behaves that way.
        </p>
      </Section>

      <Section id="brand" title="The look & the name">
        <FeatureList>
          <Feature name="The name">
            <p>
              “Sajni” is a Hindi/Urdu term of endearment — <em>beloved</em>.
              The app is meant to feel like that: something personal you
              return to daily, not a productivity dashboard.
            </p>
          </Feature>
          <Feature name="The mark">
            <p>
              The app icon is a mehendi (henna) motif — dark paisleys on
              cream. Ornament with intent: hand-drawn, Indian, unhurried.
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
              Every color comes from a Material 3 tonal token — nothing is
              hard-coded — which is why entire themes swap cleanly. Built-in
              presets (Marine, PowerPuff, Gruvbox, Peach, Mauve) and
              AI-generated themes both carry full light <em>and</em> dark
              palettes, so the Appearance toggle flips any of them. See{' '}
              <em>Settings &amp; data</em>.
            </p>
          </Feature>
          <Feature name="Motion">
            <p>Springs, not fades — quick, emphatic, done. Nothing animates for decoration.</p>
          </Feature>
        </FeatureList>
        <Callout>
          Sajni thinks in IST. Days, weeks, months, streaks and budgets all
          roll on Asia/Kolkata wall-clock time, whatever device you're on.
        </Callout>
      </Section>

      <Section id="navigation" title="Moving around">
        <p>
          Nine spaces sit in the navigation pill — <em>Today, Notes, Journal,
          Tasks, Habits, Projects, Media, Finance, Analytics</em> — each with
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

      <Section id="palette" title="Command palette">
        <p>
          Press <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> (or <Kbd>⌘K</Kbd>, or the search
          pill) anywhere. One box, three behaviors:
        </p>
        <FeatureList>
          <Feature name="Universal search">
            <p>
              Fuzzy-searches everything you own: memos, tasks, notes, journal
              entries, habits, media, tags, accounts, transactions, bookmarks.
              Prefix with a type to narrow — plurals and short forms accepted:
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
              and a space — the palette flips into AI mode and your next Enter
              asks the question. See the <em>Ask Sajni</em> page.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="conventions" title="House rules">
        <p>Behaviors that hold everywhere, so the per-page docs don't repeat them:</p>
        <ul>
          <li>
            <strong>#tags are universal.</strong> Write <Code>#tag</Code> in a
            note, memo, task note, transaction note or bookmark — it's
            collected globally, browsable under Analytics → Tags, and every
            tag pill is tappable.
          </li>
          <li>
            <strong>Notifications use both channels, always.</strong> Every
            reminder and alert goes to push (each registered device){' '}
            <em>and</em> email. Miss the ping, catch the mail.
          </li>
          <li>
            <strong>Abandoning is an outcome, not a deletion.</strong> Tasks
            can be <em>scratched</em>, media <em>dropped</em>, pockets{' '}
            <em>archived</em> — history stays honest instead of vanishing.
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
    </>
  );
}
