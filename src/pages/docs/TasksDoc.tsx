import { Section, Callout, Code, RefTable, Feature, FeatureList } from './primitives';

export const tasksMeta = {
  id: 'tasks',
  label: 'Tasks',
  title: 'Tasks',
  blurb: 'Lists, smart views, day/week/month scopes, blocking chains, steps, subtasks and reminders.',
  sections: [
    { id: 'views', label: 'Smart views & lists' },
    { id: 'scopes', label: 'Day / week / month scope' },
    { id: 'anatomy', label: 'Anatomy of a task' },
    { id: 'blocking', label: 'Blocked tasks' },
    { id: 'reminders', label: 'Reminders' },
    { id: 'lifecycle', label: 'Lifecycle & missed' },
    { id: 'board', label: 'List & Board' },
  ],
};

export default function TasksDoc() {
  return (
    <>
      <Section id="views" title="Smart views & lists" chip="pill row">
        <p>
          One swipeable pill row holds the smart views and your own lists.
          Smart views are queries, not containers — a task appears in every
          view it matches:
        </p>
        <RefTable
          head={['view', 'what it shows']}
          rows={[
            ['My Day', 'due today + overdue — the default working set'],
            ['This week', 'week-scoped tasks for the current week'],
            ['Month', 'month goals for the current month'],
            ['Important', 'starred tasks, any date'],
            ['Blocked', 'tasks waiting on another task (badge shows count)'],
            ['Missed', 'tasks whose date passed while still open'],
            ['Inbox', 'tasks in no list'],
            ['All', 'everything'],
          ]}
        />
        <FeatureList>
          <Feature name="Your lists">
            <p>
              Create, rename, delete from the same pill row. Deleting a list
              doesn't delete its tasks — they fall back to the Inbox. New
              tasks default into whichever list you're viewing.
            </p>
          </Feature>
          <Feature name="Context-aware quick-add">
            <p>
              The quick-add line (“Add a task. Press ↵.”) inherits the view:
              adding inside My Day pre-fills today's date, inside This week
              the current week, inside Important the star, inside Blocked it
              opens the full form so you can pick the blocker. What you see
              is where it lands.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="scopes" title="Day / week / month scope">
        <p>
          A task's due-ness has a <strong>scope</strong>, not just a date —
          picked in the form as Day / Week / Month:
        </p>
        <FeatureList>
          <Feature name="Day">
            <p>
              A dated task: due date, optional time-of-day, optional
              reminder. The classic.
            </p>
          </Feature>
          <Feature name="Week">
            <p>
              “Sometime this week” — anchored to a week, no specific day.
              Drives the This-week view and the journal's weekly review.
              Mutually exclusive with a date: switching scope clears the
              other anchors so nothing stale lingers.
            </p>
          </Feature>
          <Feature name="Month (month goals)">
            <p>
              A month-long agenda — “Ship the redesign” — broken into dated
              child <em>sessions</em>. The goal shows session progress
              (“3/8”); sessions are ordinary dated subtasks you schedule as
              the month unfolds. Reviewed in the journal's monthly view.
            </p>
          </Feature>
        </FeatureList>
        <Callout tone="why">
          Most systems force a fake date onto “this week-ish” work, and then
          you snooze it daily. Scopes let the honesty live in the data: a
          week task never nags on a Tuesday.
        </Callout>
      </Section>

      <Section id="anatomy" title="Anatomy of a task">
        <FeatureList>
          <Feature name="Steps">
            <p>
              A lightweight checklist <em>inside</em> the task — “pack
              charger, pack kindle”. Steps have no dates, no reminders, no
              identity of their own; they're for shape, not scheduling.
            </p>
          </Feature>
          <Feature name="Subtasks">
            <p>
              Full child tasks with their own status, dates and reminders.
              The parent row shows completion (“2/5”) and expands inline.
              Use subtasks when the child is real work; steps when it's just
              a checklist line. Month-goal sessions are subtasks.
            </p>
          </Feature>
          <Feature name="Priority & Important">
            <p>
              Priority (low/medium/high) is a sorting weight; Important is a
              star that pins the task into the Important smart view. High
              priority marks the row with a dot.
            </p>
          </Feature>
          <Feature name="Description & #tags">
            <p>
              Free-form details; <Code>#tags</Code> written there index the
              task under Analytics → Tags.
            </p>
          </Feature>
          <Feature name="History & activity">
            <p>
              Editing a task shows its trail — status flips, date moves,
              reschedules — so “when did I push this?” has an answer.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="blocking" title="Blocked tasks">
        <p>
          A task can be marked <strong>blocked by</strong> exactly one other
          task. Behavior:
        </p>
        <ul>
          <li>
            The blocked task shows its blocker (name + live status) on the
            row and in the form; it sits in the Blocked smart view until
            freed.
          </li>
          <li>
            Cycles are prevented at selection time — a task can't block a
            task that (transitively) blocks it; the picker simply won't
            offer it.
          </li>
          <li>
            Leaving blocked status clears the link; the blocker relationship
            never outlives the state that needed it.
          </li>
        </ul>
        <Callout tone="why">
          “Waiting on X” tasks pollute My Day and train you to ignore the
          list. Making blockage explicit gives waiting work a place to be —
          and the Blocked view doubles as a “what should I unblock first?”
          queue.
        </Callout>
      </Section>

      <Section id="reminders" title="Reminders">
        <FeatureList>
          <Feature name="Multiple reminders per task">
            <p>
              Each reminder is its own date + time. Every one fires on both
              channels: push to all your devices <em>and</em> email.
            </p>
          </Feature>
          <Feature name="Extra recipients">
            <p>
              A task can carry additional email addresses — when its
              reminders fire, those people get the mail too. Useful for the
              “remind us both about the booking” class of task.
            </p>
          </Feature>
          <Feature name="Scheduled time">
            <p>
              A dated task can carry a time-of-day; with “remind” on, the
              time is the reminder.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="lifecycle" title="Lifecycle & missed">
        <RefTable
          head={['status', 'meaning']}
          rows={[
            ['todo', 'open'],
            ['in progress', 'actively being worked'],
            ['blocked', 'waiting on its blocker task'],
            ['done', 'completed — moves to the collapsible Completed group'],
            ['scratched', 'abandoned on purpose — struck through, kept'],
          ]}
        />
        <FeatureList>
          <Feature name="Scratched">
            <p>
              Deciding <em>not</em> to do something is progress. Scratched
              tasks leave every open list, smart view and reminder queue, but
              stay visible in their own group and are reversible back to
              todo. Nothing is quietly deleted.
            </p>
          </Feature>
          <Feature name="Missed banner">
            <p>
              Tasks whose date passed while open are “missed”. A banner on
              the Tasks page (and on Today) surfaces them with a one-tap
              reschedule — a missed task should become a decision, fast.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="board" title="List & Board" chip="view toggle">
        <p>
          Desktop offers two projections of the same data: <strong>List</strong>{' '}
          (grouped Overdue / Today / This week / Later / No date) and{' '}
          <strong>Board</strong> (kanban columns by status — todo, in
          progress, blocked, done). Drag between columns to change status.
          Phones always get the list; a board on a phone is a horizontal
          scroll of regret.
        </p>
      </Section>
    </>
  );
}
