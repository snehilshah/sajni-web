import { Section, Callout, Feature, FeatureList } from './primitives';

export const journalMeta = {
  id: 'journal',
  label: 'Journal',
  title: 'Journal',
  blurb: 'One entry per day, on purpose, with weekly and monthly roll-ups that do the remembering.',
  sections: [
    { id: 'daily', label: 'Daily editor' },
    { id: 'margin', label: 'The margin' },
    { id: 'routines', label: 'Routines' },
    { id: 'weekly', label: 'Weekly view' },
    { id: 'monthly', label: 'Monthly view' },
  ],
};

export default function JournalDoc() {
  return (
    <>
      <Section id="daily" title="The Daily Editor" chip="day view">
        <p>
          The journal is strictly <strong>one entry per day</strong>. The
          constraint is the feature: you can't binge-journal, you can only
          show up.
        </p>
        <FeatureList>
          <Feature name="Autosave">
            <p>
              Entries save as you type, there is no save button. Content
              and location both mark the entry dirty and flush together.
            </p>
          </Feature>
          <Feature name="Location">
            <p>
              The location pill notes where you wrote the day. Type a short
              place, like “Cinepolis, Vashi”, and press Enter. It stays with
              the entry and you can search for it later.
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

      <Section id="margin" title="The Margin" chip="right rail">
        <p>
          The collapsible right margin holds the day's <em>context</em> so the
          entry itself stays prose. Its open/closed state is remembered; on
          mobile it becomes a bottom sheet.
        </p>
        <FeatureList>
          <Feature name="That day's habits & tasks">
            <p>
              Two columns show what you ticked and what was due that day.
              Tick a task to finish it, or tick a done one again to reopen it
              if you checked it by mistake; tap a title to open the task.
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
          Reflection needs evidence. Seeing what actually happened that day,
          habits ticked, tasks done or missed, next to what you{' '}
          <em>wrote</em> about it is the whole point of a journal in a system
          that already knows your day.
        </Callout>
      </Section>

      <Section id="routines" title="Routines" chip="day view">
        <p>
          A routine is a time slot that repeats: “Office start” every workday
          at 9:00, “Closing” at 6:00, “Weekend reset” on Saturdays. Each has
          a short checklist that starts fresh every day it runs, and room for
          one-off things you want to handle in that slot. The day's routines
          sit at the top of the margin, in time order, folded to one line
          each (“Office start · 9:00 AM · 1/5”). Tap one to unfold it.
        </p>
        <FeatureList>
          <Feature name="Setting one up">
            <p>
              Tap <em>Edit</em> beside Routines (or <em>Set up a routine</em>{' '}
              when you have none). Give it a name, pick its days (Workdays,
              Weekends, Every day, or single days), a start time, and type its
              checklist. Edits to a routine save themselves.
            </p>
          </Feature>
          <Feature name="The checklist">
            <p>
              Tick items as you go. Ticks belong to that day only, so tomorrow
              starts clean, and past days keep what you ticked. Future days
              can't be ticked yet.
            </p>
          </Feature>
          <Feature name="Adding to a routine">
            <p>
              <em>Add to Office start</em> under an unfolded routine creates a
              task for that day, timed at the routine's start. It is a normal
              task: it shows in Tasks with a small “Office start” chip, and if
              you don't finish it that day it becomes Missed like any other
              task. It doesn't roll over to the next run.
            </p>
          </Feature>
          <Feature name="The alert">
            <p>
              Each routine sends one notification at its start time, naming
              the first few things on it. Switch <em>Alert</em> off in its
              editor if you don't want it.
            </p>
          </Feature>
        </FeatureList>
        <Callout>
          <strong>Example.</strong> You want a calm start to work.
          <ul className="mt-2 flex flex-col gap-1 pl-5 [&>li]:list-decimal">
            <li>
              Make “Office start”: Workdays, 9:00 AM, with “Check calendar”,
              “Clear inbox” and “Plan the day”.
            </li>
            <li>
              On Monday evening, open Tuesday in Journal, unfold Office start
              and add “Ask Rahul about the invoice”.
            </li>
            <li>
              At 9:00 on Tuesday the alert reads “Office start · 9:00 AM:
              Check calendar · Clear inbox · Plan the day +1 more”. Tapping it
              opens Tuesday in Journal.
            </li>
            <li>
              Tick the three items and the task: the row reads 4/4. Skip the
              task instead and it shows as Missed on Wednesday.
            </li>
          </ul>
        </Callout>
      </Section>

      <Section id="weekly" title="Weekly View" chip="week">
        <p>
          Days roll up into weeks (‹ › to shift). The weekly surface is a
          review, not an editor:
        </p>
        <FeatureList>
          <Feature name="Week stats">
            <p>
              Four tiles: Tasks done (x/y due), Missed, Entries written
              (x/7), and Expenses for the week, the journal borrows the
              number from Finance so the review includes money without
              switching apps.
            </p>
          </Feature>
          <Feature name="This week's tasks">
            <p>
              Week-scoped tasks (see the Tasks page, tasks can be due “this
              week” rather than a specific day) list here with inline
              quick-add, because the weekly review is where week-level
              commitments are made.
            </p>
          </Feature>
          <Feature name="Habit rhythms">
            <p>
              Daily habits keep their seven-day strip. Weekly, fortnightly,
              and monthly habits appear as one cadence period, so the review
              never turns a monthly check into seven daily ones.
            </p>
          </Feature>
          <Feature name="Weekly entry & Sajni's summary">
            <p>
              You can write a weekly entry in your own words; Sajni also
              drafts a summary of the week from your daily entries. Both are
              kept, the machine's memory and yours.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="monthly" title="Monthly View" chip="month">
        <p>
          The same shape one level up: month stats (tasks done, missed,
          entries x/days, expenses), the month's goals with their session
          progress (“3/8 sessions”), a monthly entry, and a month shifter.
          Month goals themselves are a Tasks feature, the journal is where
          you review them.
        </p>
      </Section>
    </>
  );
}
