import { Section, Code, Feature, FeatureList } from './primitives';

export const analyticsMeta = {
  id: 'analytics',
  label: 'Analytics',
  title: 'Analytics',
  blurb: 'Your year at a glance, Sajni’s weekly observations, and every #tag under one roof.',
  sections: [
    { id: 'activity', label: 'Activity' },
    { id: 'insights', label: 'Insights' },
    { id: 'tags', label: 'Tags' },
  ],
};

export default function AnalyticsDoc() {
  return (
    <>
      <Section id="activity" title="Activity" chip="tab">
        <p>Read-only panels computed from everything you've logged:</p>
        <FeatureList>
          <Feature name="Activity heatmap (365 days)">
            <p>
              One cell per day, intensity = contributions across every module
              — notes, tasks, habits, journal, media, finance. The header
              counts total contributions and active days.
            </p>
          </Feature>
          <Feature name="Journal consistency">
            <p>Days written vs days elapsed this month, as a percentage.</p>
          </Feature>
          <Feature name="Module breakdown (30 days)">
            <p>Where the activity went — per-module counts for the last month.</p>
          </Feature>
          <Feature name="Task velocity">
            <p>Completed tasks per week — trend, not judgment.</p>
          </Feature>
          <Feature name="Habit streaks">
            <p>
              Current <em>and</em> longest streak per habit, side by side —
              the longest is the reminder that the current one is rebuildable.
            </p>
          </Feature>
          <Feature name="Top tags & media stats">
            <p>Most-used tags ranked; the library counted by status.</p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="insights" title="Insights" chip="tab">
        <p>
          Each week Sajni reads your data and writes short observations worth
          acting on — spending drifts, habit patterns, task pile-ups. They
          accrue as a feed; skim them Sunday evening. Insights are
          observations, not nags: nothing here fires a notification beyond
          the weekly digest.
        </p>
      </Section>

      <Section id="tags" title="Tags" chip="tab">
        <p>
          Every <Code>#tag</Code> you've written anywhere — notes, memos,
          task notes, transaction notes, bookmarks — collected with counts.
          Opening a tag lists everything filed under it across all modules,
          with jump-throughs. Tags are created by writing them; there is no
          tag manager to maintain.
        </p>
      </Section>
    </>
  );
}
