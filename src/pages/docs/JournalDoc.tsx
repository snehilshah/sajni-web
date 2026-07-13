import { Section, Callout, Feature, FeatureList } from './primitives';

export const journalMeta = {
  id: 'journal',
  label: 'Journal',
  title: 'Journal',
  blurb: 'One entry per day, on purpose — with weekly and monthly roll-ups that do the remembering.',
  sections: [
    { id: 'daily', label: 'Daily editor' },
    { id: 'margin', label: 'The margin' },
    { id: 'weekly', label: 'Weekly view' },
    { id: 'monthly', label: 'Monthly view' },
  ],
};

export default function JournalDoc() {
  return (
    <>
      <Section id="daily" title="The daily editor" chip="day view">
        <p>
          The journal is strictly <strong>one entry per day</strong>. The
          constraint is the feature: you can't binge-journal, you can only
          show up.
        </p>
        <FeatureList>
          <Feature name="Autosave">
            <p>
              Entries save as you type — there is no save button. Content,
              mood and location all mark the entry dirty and flush together.
            </p>
          </Feature>
          <Feature name="Mood">
            <p>
              One emoji per day from a fixed scale. Tapping cycles through
              the scale. Moods feed the trends in Analytics.
            </p>
          </Feature>
          <Feature name="Location">
            <p>
              The location pill attaches a place (label + coordinates) to the
              day — a quiet map of where your days happened, searchable
              later.
            </p>
          </Feature>
          <Feature name="Day navigation">
            <p>
              ‹ › arrows step days; the calendar rail (left) jumps anywhere.
              Days with entries are marked, so gaps are visible without being
              scolded.
            </p>
          </Feature>
          <Feature name="Prompt">
            <p>
              The Today page offers one line when the blank page stares back;
              tapping it lands here with the prompt ready.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="margin" title="The margin" chip="right rail">
        <p>
          The collapsible right margin holds the day's <em>context</em> so the
          entry itself stays prose. Its open/closed state is remembered; on
          mobile it becomes a bottom sheet.
        </p>
        <FeatureList>
          <Feature name="That day's habits & tasks">
            <p>
              Two columns show what you ticked and what was due that day —
              read-only checkmarks with jump-throughs. The journal never
              edits tasks; it shows the shape of the day.
            </p>
          </Feature>
          <Feature name="Backlinks">
            <p>
              Notes and entries that reference this day appear automatically.
            </p>
          </Feature>
          <Feature name="#tags">
            <p>Tags used in the entry, collected and tappable.</p>
          </Feature>
        </FeatureList>
        <Callout tone="why">
          Reflection needs evidence. Seeing what actually happened that day —
          habits ticked, tasks done or missed — next to what you{' '}
          <em>wrote</em> about it is the whole point of a journal in a system
          that already knows your day.
        </Callout>
      </Section>

      <Section id="weekly" title="Weekly view" chip="week">
        <p>
          Days roll up into weeks (‹ › to shift). The weekly surface is a
          review, not an editor:
        </p>
        <FeatureList>
          <Feature name="Week stats">
            <p>
              Four tiles: Tasks done (x/y due), Missed, Entries written
              (x/7), and Expenses for the week — the journal borrows the
              number from Finance so the review includes money without
              switching apps.
            </p>
          </Feature>
          <Feature name="This week's tasks">
            <p>
              Week-scoped tasks (see the Tasks page — tasks can be due “this
              week” rather than a specific day) list here with inline
              quick-add, because the weekly review is where week-level
              commitments are made.
            </p>
          </Feature>
          <Feature name="Weekly entry & Sajni's summary">
            <p>
              You can write a weekly entry in your own words; Sajni also
              drafts a summary of the week from your daily entries. Both are
              kept — the machine's memory and yours.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="monthly" title="Monthly view" chip="month">
        <p>
          The same shape one level up: month stats (tasks done, missed,
          entries x/days, expenses), the month's goals with their session
          progress (“3/8 sessions”), a monthly entry, and a month shifter.
          Month goals themselves are a Tasks feature — the journal is where
          you review them.
        </p>
      </Section>
    </>
  );
}
