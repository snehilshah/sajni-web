import { Section, Callout, Feature, FeatureList } from './primitives';

export const habitsMeta = {
  id: 'habits',
  label: 'Habits',
  title: 'Habits',
  blurb: 'Build rhythms with Habits, and remember when things happened with Events.',
  sections: [
    { id: 'model', label: 'The model' },
    { id: 'week', label: 'The rhythm ledger' },
    { id: 'streaks', label: 'Streaks & backfill' },
    { id: 'events', label: 'Events' },
  ],
};

export default function HabitsDoc() {
  return (
    <>
      <Section id="model" title="The model">
        <p>
          A habit is a name, a color, and a frequency — <strong>daily</strong>,{' '}
          <strong>weekly</strong>, <strong>fortnightly</strong>, or{' '}
          <strong>monthly</strong>. There are no quantities, partial credits,
          or skip tokens: one check completes one calendar period.
        </p>
        <FeatureList>
          <Feature name="Ticking">
            <p>
              Tick from Habits, Today, Journal, or Sajni — every surface resolves
              the same cadence period. An unfinished current period stays open.
            </p>
          </Feature>
          <Feature name="Editing">
            <p>
              Name, color and frequency are editable any time; history stays.
              Deleting a habit deletes its logs — the dialog says so before
              you do.
            </p>
          </Feature>
        </FeatureList>
        <Callout tone="why">
          Habit apps die of feature weight: the more knobs (quantities,
          partial credit, freeze days), the more the tracking becomes the
          hobby. A binary tick is the only signal that survives contact with
          a bad week.
        </Callout>
      </Section>

      <Section id="week" title="The rhythm ledger">
        <p>
          Habits are grouped by cadence, so every row in a ledger shares the
          same timeline and highlighted current column. Creating a habit does
          not move that column or give the habit a separate window.
        </p>
        <FeatureList>
          <Feature name="Four window shapes">
            <p>
              Daily shows the current Monday–Sunday week. Weekly shows twelve
              consecutive weeks, fortnightly shows twelve consecutive 14-day
              periods, and monthly shows the calendar year from JAN–DEC.
            </p>
          </Feature>
          <Feature name="Stable period pages">
            <p>
              Weekly and fortnightly pages are anchored to their cadence rather
              than cut at month boundaries. The current marker advances through
              the twelve cells and wraps to the first cell after the twelfth.
              The ‹ › controls move exactly twelve periods at a time, so no
              week is duplicated, skipped, or made unreachable.
            </p>
          </Feature>
          <Feature name="Calendar labels">
            <p>
              The page title names the months actually visible. A week belongs
              to the month containing its Thursday and is numbered W1–W5 there.
              A fortnight uses the label of its starting week: July W5 spans
              that week and the following August W1, so the next fortnight is
              August W2.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="streaks" title="Streaks & backfill">
        <FeatureList>
          <Feature name="Streaks">
            <p>
              Each habit tracks current and longest consecutive cadence periods.
              Daily counts days, weekly counts weeks, fortnightly counts 14-day
              buckets, and monthly counts months. Sajni uses the owner’s local
              calendar throughout.
            </p>
          </Feature>
          <Feature name="Backfill">
            <p>
              Any past period can be checked retroactively, including periods
              before the habit was created. Future periods stay visible but
              disabled. Changing a habit’s frequency keeps every stored log and
              regroups that history into the new rhythm.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="events" title="Events">
        <p>
          Events share the Habits page but answer a different question:
          <strong> when did this last happen?</strong> Use them for haircuts,
          beard trims, leave, maintenance, health appointments, or any
          irregular occurrence where elapsed time matters more than a streak.
        </p>
        <FeatureList>
          <Feature name="Fast logging">
            <p>
              Log an occurrence with its date and time, an optional note, and
              up to six optional numeric variables. Variables can carry a unit,
              such as haircut cost in ₹ or trim size in mm.
            </p>
          </Feature>
          <Feature name="Timeline">
            <p>
              Each event has its own chronological spine. It shows exact dates,
              the time between occurrences, notes, and recorded values. Search
              notes or narrow the history to a date range.
            </p>
          </Feature>
          <Feature name="Trends">
            <p>
              The Trends view summarizes the last occurrence, total logs, and
              average interval. It charts intervals and any selected variable
              when enough comparable entries exist.
            </p>
          </Feature>
          <Feature name="Connected history">
            <p>
              Event occurrences appear read-only beside the matching Journal
              day and are included in global search and data takeout. Sajni can
              create events, manage variables, and log or edit occurrences too.
            </p>
          </Feature>
        </FeatureList>
        <Callout tone="why">
          Habits are commitments to repeat. Events are landmarks worth
          remembering. Keeping them as sibling tabs makes the distinction clear
          without adding another destination to Sajni.
        </Callout>
      </Section>
    </>
  );
}
