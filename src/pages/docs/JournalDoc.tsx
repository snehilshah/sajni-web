import { Section, Callout, Feature, FeatureList } from './primitives';

export const journalMeta = {
  id: 'journal',
  label: 'Journal',
  title: 'Journal',
  blurb: 'One entry per day, on purpose, with weekly and monthly roll-ups that do the remembering.',
  sections: [
    { id: 'daily', label: 'Daily editor' },
    { id: 'margin', label: 'The margin' },
    { id: 'plans', label: 'Plans' },
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
              On the web, entries save as you type; there is no save button.
              On the phone, an entry saves when you close it (back, or Save).
              Content and location save together.
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

      <Section id="plans" title="Plans" chip="day view">
        <p>
          A plan is a moment to decide what a day is about: “Office start”
          every workday at 9:00, “Weekend start” on Saturdays at 10:00. You
          make the ones you want. At that time you pick what the day is for,
          from your open tasks or by typing new ones, and you can plan ahead
          for any future day the plan runs. The day's plans sit at the top of
          the margin, in time order (“Office start · 9:00 AM · 1/3”); today
          and later days open unfolded. Today's plans also show at the top of
          the Today page.
        </p>
        <FeatureList>
          <Feature name="Setting one up">
            <p>
              Tap <em>Edit</em> beside Plans (or <em>Set up a plan</em> when
              you have none). Give it a name, pick its days (Workdays,
              Weekends, Every day, or single days) and a start time, then
              press <em>Add plan</em>.
            </p>
          </Feature>
          <Feature name="Planning">
            <p>
              Under an unfolded plan, <em>Add to Office start</em> types a
              new task for that day. <em>Pick from your tasks</em> lists your
              open tasks in groups (Left over, Overdue, Due that day, That
              week, Coming up, No date); tap one to move it to that day. It
              keeps its own time if it has one. Planned tasks are normal
              tasks: they show in Tasks with a small “Office start” chip, and
              tick off anywhere.
            </p>
          </Feature>
          <Feature name="Left over">
            <p>
              A planned task you don't finish stays as an overdue task on its
              day. From the next day on, the plan lists it under{' '}
              <em>Left over</em>; <em>Move here</em> brings it to the day
              you're planning. Nothing moves on its own.
            </p>
          </Feature>
          <Feature name="Every time">
            <p>
              For something you do at every office start, make it a repeating
              task (Workdays) and put it in the plan once: each time it
              repeats it comes back to that plan's day. See Tasks → Repeating
              tasks.
            </p>
          </Feature>
          <Feature name="The alert">
            <p>
              Each plan sends one notification at its start time: what's
              planned (“Standup · Reply to Rahul +2 more”), or “Nothing
              planned yet. Plan your day.” Tapping it opens that day in
              Journal. Switch <em>Alert</em> off in its editor if you don't
              want it.
            </p>
          </Feature>
        </FeatureList>
        <Callout>
          <strong>Example.</strong> It's Monday and Thursday has a client
          meeting.
          <ul className="mt-2 flex flex-col gap-1 pl-5 [&>li]:list-decimal">
            <li>Make “Office start”: Workdays, 9:00 AM.</li>
            <li>
              Open Thursday in Journal, unfold Office start and add “Prepare
              for the client meeting”.
            </li>
            <li>
              Thursday at 9:00 the alert reads “Office start · 9:00 AM:
              Prepare for the client meeting”. Tap it, then <em>Pick from
              your tasks</em> and add “Send the invoice” from Overdue.
            </li>
            <li>
              Finish the meeting prep but not the invoice. On Friday the
              invoice shows under Left over in Office start; tap{' '}
              <em>Move here</em>.
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
