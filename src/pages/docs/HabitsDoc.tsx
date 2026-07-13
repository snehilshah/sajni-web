import { Section, Callout, Feature, FeatureList } from './primitives';

export const habitsMeta = {
  id: 'habits',
  label: 'Habits',
  title: 'Habits',
  blurb: 'Tick once a day. Streak math, a weekly strip, honest backfill — nudges, never guilt.',
  sections: [
    { id: 'model', label: 'The model' },
    { id: 'week', label: 'The weekly strip' },
    { id: 'streaks', label: 'Streaks & backfill' },
  ],
};

export default function HabitsDoc() {
  return (
    <>
      <Section id="model" title="The model">
        <p>
          A habit is a name, a color, and a frequency — <strong>daily</strong>{' '}
          or <strong>weekly</strong>. That's the whole schema on purpose: no
          quantities, no time targets, no skip tokens. One tick per period,
          logged against the IST calendar day.
        </p>
        <FeatureList>
          <Feature name="Ticking">
            <p>
              Tick from the Habits page or from Today — same log either way.
              Ticks are idempotent per day; un-ticking removes the log.
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

      <Section id="week" title="The weekly strip">
        <p>
          Each habit renders as a row of the current week — seven cells,
          ticked or not — with ‹ › to walk previous weeks. The strip is the
          primary display because <em>the week is the honest unit</em>: a
          single missed day reads as texture, not failure.
        </p>
      </Section>

      <Section id="streaks" title="Streaks & backfill">
        <FeatureList>
          <Feature name="Streaks">
            <p>
              Each habit tracks its current streak and total logs; Analytics
              shows current <em>and</em> longest streaks side by side. Streak
              math runs on IST days, so a late-night tick before 12am still
              counts for the day it belongs to.
            </p>
          </Feature>
          <Feature name="Backfill">
            <p>
              Recent past days (up to four weeks back) can be ticked
              retroactively from the strip — for the days you did the thing
              but not the logging. The point is a truthful record, not
              streak-repair theater; there are no “freeze” tokens.
            </p>
          </Feature>
        </FeatureList>
      </Section>
    </>
  );
}
