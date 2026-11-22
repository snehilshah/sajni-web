import { Section, Callout, Code, Kbd, RefTable, Feature, FeatureList } from './primitives';

export const aiMeta = {
  id: 'ai',
  label: 'Ask Sajni',
  title: 'Ask Sajni',
  blurb: 'The ambient AI: one brain, two doors, the palette for quick asks, chat for long ones.',
  sections: [
    { id: 'doors', label: 'The two doors' },
    { id: 'abilities', label: 'What it can do' },
    { id: 'behavior', label: 'How it behaves' },
  ],
};

export default function AiDoc() {
  return (
    <>
      <Section id="doors" title="The Two Doors">
        <RefTable
          head={['door', 'built for']}
          rows={[
            [
              '@sajni in ⌘K',
              'one-shot asks: “add lunch 240 to cash”, “what’s due this week?”, “move last week’s spends to the Goa Trip slate”',
            ],
            [
              'The ✦ button in the nav',
              'a chat beside the page: ask while you look at your tasks or money, and what Sajni changes refreshes in place',
            ],
            ['Projects → Chat', 'long conversations with kept history, sessions you can reopen and continue'],
          ]}
        />
        <p>
          The ✦ button opens Sajni docked on the right. On a wide screen the page narrows to make room, so you can keep
          reading, scrolling and clicking it: ask &ldquo;what&rsquo;s overdue?&rdquo; on Tasks and tick them off as the
          answer comes in. Drag the panel&rsquo;s edge to make it wider or narrower (double-click puts it back to the
          default); the width is remembered. Close it with ✕, the ✦ button again, or <Kbd>Esc</Kbd> while you&rsquo;re
          typing in it. On a smaller window it sits over the page&rsquo;s right edge instead, and on a phone it fills
          the screen.
        </p>
        <p>
          Palette mode: <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>, type <Code>@sajni</Code> (or <Code>@s</Code> / <Code>@ai</Code>) +
          space, ask, Enter. The answer renders inline in the palette; actions it took show as cards that deep-link to
          what changed.
        </p>
        <Callout tone="why">
          AI is deliberately ambient, no floating bubble, no “try asking me!”. The rule of the codebase is that AI is
          discovered, not promoted. The one hard guarantee backing it:{' '}
          <strong>every action the UI can take exists as a tool</strong>, so whatever you learned to click, you can also
          just say.
        </Callout>
      </Section>

      <Section id="abilities" title="What It Can Do">
        <p>A non-exhaustive map of the tool surface, by space:</p>
        <ul>
          <li>
            <strong>Tasks</strong>: create/update/complete tasks and lists; query what's due.
          </li>
          <li>
            <strong>Reminders</strong>: create, list, edit, snooze, skip and delete standalone one-time or recurring
            reminders.
          </li>
          <li>
            <strong>Habits</strong>: log ticks, check streaks.
          </li>
          <li>
            <strong>Notes & memos</strong>: capture memos, search notes, and read any note in full: &ldquo;what does my
            Trip ideas note say?&rdquo;
          </li>
          <li>
            <strong>Journal</strong>: read entries, and write in one. &ldquo;Add to today's journal: lunch with
            Riya&rdquo; adds a paragraph to the end of the day; the day is only rewritten when you ask for that.
          </li>
          <li>
            <strong>Media</strong>: add/search the library, move statuses, advance episodes.
          </li>
          <li>
            <strong>Finance</strong>: add/edit transactions (they file into Plain like any direct entry), mark recurring
            payments (record or attach), create slates and sweep existing transactions into them, read and create
            budgets, toggle investment auto-debit.
          </li>
          <li>
            <strong>Projects</strong>: cards, synthesis, enrichment.
          </li>
          <li>
            <strong>Themes</strong>: generate and activate M3 themes from a description.
          </li>
        </ul>
      </Section>

      <Section id="behavior" title="How It Behaves">
        <FeatureList>
          <Feature name="Reminder wording stays lightweight">
            <p>
              “Remind me to call Mom tomorrow at 4” creates a standalone reminder, not a task. An explicit task stays a
              task, and a reminder requested for an existing task stays attached to that task. If you give a day but no
              clock time, Sajni asks one short follow-up instead of inventing an hour.
            </p>
          </Feature>
          <Feature name="It acts, then answers">
            <p>
              Asked to do something, it does it and confirms in a line, no feature tours, no “I can also…” upsells.
              That's a designed persona, not an accident.
            </p>
          </Feature>
          <Feature name="The screen refreshes itself">
            <p>
              Every mutation emits an event the open pages listen for, lists, chips and totals update in place without a
              manual reload.
            </p>
          </Feature>
          <Feature name="Context it carries">
            <p>
              It knows the current date in your time zone, your open tasks, habits, today's plans, and the names of your
              task lists and accounts, so “tomorrow”, “add it to Work” and “paid from HDFC” resolve without a lookup.
            </p>
          </Feature>
          <Feature name="It brings only the tools it needs">
            <p>
              Everyday tools (tasks, journal, memos, reminders, transactions) are always at hand; the rest (lends,
              budgets, events, themes and so on) join when your question is about them, or when Sajni finds it needs
              them. Answers cost less and pick the right tool more often. You never have to ask for this.
            </p>
          </Feature>
          <Feature name="A failed answer keeps your question">
            <p>
              If Sajni stops responding or hits a limit partway, the chat keeps your question and any changes already
              made, with a short note on what happened, so you can just ask again. A step that stalls with nothing shown
              yet is retried once on its own.
            </p>
          </Feature>
          <Feature name="Budget">
            <p>
              Every AI call, including themes, picking a category and Projects enrichment, shares a daily budget.
              (Insights show their findings as found; the AI rewording is switched off for now.) Chat questions also
              have an hourly one, which never holds up bank-message capture. Past a limit you get a plain sentence
              saying when to try again, never a silent failure. Palette answers are tuned short; chat goes as long as
              the thought does.
            </p>
          </Feature>
        </FeatureList>
      </Section>
    </>
  );
}
