import { Section, Callout, Feature, FeatureList } from './primitives';

export const todayMeta = {
  id: 'today',
  label: 'Today',
  title: 'Today',
  blurb: 'The morning page — one screen that pulls the day together so you don’t have to tour the app.',
  sections: [
    { id: 'intent', label: 'Intent' },
    { id: 'sections', label: 'What’s on it' },
  ],
};

export default function TodayDoc() {
  return (
    <>
      <Section id="intent" title="Intent">
        <p>
          Today is a <strong>read-and-go</strong> page: open it, scan it,
          start. It aggregates from every other space; the only interactions
          it offers are the one-tap ones (tick a habit, mark a task done,
          jump into the journal). Deep work happens in the spaces themselves.
        </p>
        <Callout tone="why">
          Aggregation pages rot when they become editors. Today stays a
          surface, so it stays fast to scan — every element on it links back
          to the space that owns it.
        </Callout>
      </Section>

      <Section id="sections" title="What's on it">
        <FeatureList>
          <Feature name="Missed tasks banner">
            <p>
              Yesterday's slips surface at the very top — not buried — with a
              reschedule action so a missed task becomes a decision, not a
              lingering guilt object.
            </p>
          </Feature>
          <Feature name="On deck">
            <p>
              The tasks that deserve today: due today plus overdue, with
              inline check-off. Tapping opens the full task sheet.
            </p>
          </Feature>
          <Feature name="Today's habits">
            <p>
              Every daily habit with a one-tap tick. The header counts
              progress (“3/5 done”). Ticking here is identical to ticking on
              the Habits page — same log, same streak math.
            </p>
          </Feature>
          <Feature name="Recent thinking">
            <p>
              The project cards you touched last, so an open train of thought
              is one tap away from where you left it.
            </p>
          </Feature>
          <Feature name="Echo from earlier">
            <p>
              A memo you wrote three or more days ago, resurfaced. Behavior:
              picked from your memo stream, shown with its age (“YOU · 4 days
              ago”).
            </p>
            <p>
              <em>Why:</em> quick captures rot in silence. A gentle re-read a
              few days later is when a memo either becomes a task/note or gets
              to die honestly.
            </p>
          </Feature>
          <Feature name="At a glance">
            <p>The day's numbers — compact stat tiles, no charts.</p>
          </Feature>
          <Feature name="Today's prompt">
            <p>
              One line to push the journal along. Tapping it drops you into
              today's journal entry with the prompt in hand.
            </p>
          </Feature>
        </FeatureList>
      </Section>
    </>
  );
}
