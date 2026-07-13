import { Section, Callout, Code, Kbd, RefTable, Feature, FeatureList } from './primitives';

export const aiMeta = {
  id: 'ai',
  label: 'Ask Sajni',
  title: 'Ask Sajni',
  blurb: 'The ambient AI: one brain, two doors — the palette for quick asks, chat for long ones.',
  sections: [
    { id: 'doors', label: 'The two doors' },
    { id: 'abilities', label: 'What it can do' },
    { id: 'behavior', label: 'How it behaves' },
  ],
};

export default function AiDoc() {
  return (
    <>
      <Section id="doors" title="The two doors">
        <RefTable
          head={['door', 'built for']}
          rows={[
            [
              '@sajni in ⌘K',
              'one-shot asks: “add lunch 240 to cash”, “what’s due this week?”, “set active pocket to Goa Trip”',
            ],
            [
              'Projects → Chat',
              'long conversations with kept history — sessions you can reopen and continue',
            ],
          ]}
        />
        <p>
          Palette mode: <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>, type <Code>@sajni</Code>{' '}
          (or <Code>@s</Code> / <Code>@ai</Code>) + space, ask, Enter. The
          answer renders inline in the palette; actions it took show as cards
          that deep-link to what changed.
        </p>
        <Callout tone="why">
          AI is deliberately ambient — no floating bubble, no “try asking
          me!”. The rule of the codebase is that AI is discovered, not
          promoted. The one hard guarantee backing it: <strong>every action
          the UI can take exists as a tool</strong>, so whatever you learned
          to click, you can also just say.
        </Callout>
      </Section>

      <Section id="abilities" title="What it can do">
        <p>A non-exhaustive map of the tool surface, by space:</p>
        <ul>
          <li><strong>Tasks</strong> — create/update/complete tasks, lists, reminders; query what's due.</li>
          <li><strong>Habits</strong> — log ticks, check streaks.</li>
          <li><strong>Notes & memos</strong> — capture memos, search notes, read content back.</li>
          <li><strong>Journal</strong> — read/write entries, moods.</li>
          <li><strong>Media</strong> — add/search the library, move statuses, advance episodes.</li>
          <li>
            <strong>Finance</strong> — add/edit transactions (they file into
            your active pocket like any direct entry), pay billers (record or
            attach), manage pockets and the active pocket, read budgets with
            their rolling windows, toggle investment auto-debit.
          </li>
          <li><strong>Projects</strong> — cards, synthesis, enrichment.</li>
          <li><strong>Themes</strong> — generate and activate M3 themes from a description.</li>
        </ul>
      </Section>

      <Section id="behavior" title="How it behaves">
        <FeatureList>
          <Feature name="It acts, then answers">
            <p>
              Asked to do something, it does it and confirms in a line — no
              feature tours, no “I can also…” upsells. That's a designed
              persona, not an accident.
            </p>
          </Feature>
          <Feature name="The screen refreshes itself">
            <p>
              Every mutation emits an event the open pages listen for —
              lists, chips and totals update in place without a manual
              reload.
            </p>
          </Feature>
          <Feature name="Context it carries">
            <p>
              It knows the current date (IST), your open tasks and daily
              habits — so “tomorrow”, “my usual” and “what's left today”
              resolve correctly.
            </p>
          </Feature>
          <Feature name="Budget">
            <p>
              AI calls share a usage budget; if it runs dry mid-conversation
              you get a clear “out of quota” rather than silent failure.
              Palette answers are tuned short; chat goes as long as the
              thought does.
            </p>
          </Feature>
        </FeatureList>
      </Section>
    </>
  );
}
