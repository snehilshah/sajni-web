import { Section, Callout, Code, RefTable, Feature, FeatureList } from './primitives';

export const financeMeta = {
  id: 'finance',
  label: 'Finance',
  title: 'Finance',
  blurb: 'A calm personal ledger — accounts, transactions, pockets, budgets, billers, investments, cards.',
  sections: [
    { id: 'privacy', label: 'Privacy mode' },
    { id: 'overview', label: 'Overview' },
    { id: 'accounts', label: 'Accounts' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'pockets', label: 'Pockets' },
    { id: 'budgets', label: 'Budgets' },
    { id: 'billers', label: 'Billers' },
    { id: 'investments', label: 'Investments' },
    { id: 'cards', label: 'Cards' },
    { id: 'exports', label: 'Exports' },
  ],
};

export default function FinanceDoc() {
  return (
    <>
      <Section id="privacy" title="Privacy mode" chip="header toggle">
        <p>
          Figures are <strong>hidden by default</strong>. Every amount renders
          as stable decoy digits — same sign, same digit count, deterministic
          per value — so layouts don't jump and nothing flickers, but a
          shoulder-surfer learns nothing.
        </p>
        <ul>
          <li>
            Tap <em>Privacy</em> in the header to reveal. A reveal lasts{' '}
            <strong>30 minutes</strong>, then re-hides itself — including
            across reloads and laptop sleeps (the expiry is checked on load
            and when the tab becomes visible again).
          </li>
          <li>Re-hide manually any time; hiding clears the timer.</li>
          <li>
            Charts stay drawn (shapes aren't figures); every textual amount
            is decoyed. Pocket <em>names</em> stay visible — privacy hides
            numbers, not structure.
          </li>
        </ul>
      </Section>

      <Section id="overview" title="Overview" chip="tab">
        <p>The money dashboard, read-only:</p>
        <ul>
          <li>Net worth, total assets, total liabilities, investments total.</li>
          <li>This month's income, expense, savings, and recurring investing.</li>
          <li>Account balances, top expense categories, a daily income/expense trend.</li>
          <li>Upcoming card dues.</li>
        </ul>
        <p>
          Net worth is also snapshotted over time — the history exports as
          CSV (see Exports). Snapshots are never rewritten retroactively;
          history keeps its steps.
        </p>
      </Section>

      <Section id="accounts" title="Accounts" chip="tab">
        <p>
          Types: savings, checking, salary, credit card, investment, cash.
          Balances are <strong>computed from the ledger</strong> (opening
          balance + transactions), never edited directly.
        </p>
        <FeatureList>
          <Feature name="Salary accounts">
            <p>
              Carry an expected monthly inflow and the day it lands — income
              entries default to the salary account, and crediting the salary
              is one tap.
            </p>
          </Feature>
          <Feature name="Match hints">
            <p>
              Comma-separated SMS identifiers (card last-4, bank names). The
              share-to-add flow uses them server-side to pre-select the right
              account from a bank message.
            </p>
          </Feature>
          <Feature name="Credit cards">
            <p>
              Carry a credit limit, statement day, due day and a cashback
              scheme (percentage or fixed) — these drive the Cards tab.
            </p>
          </Feature>
          <Feature name="Savings buckets">
            <p>
              Virtual sub-goals <em>inside</em> an account (“Emergency fund ·
              3L of 5L”). Buckets don't move money — they earmark it, so one
              savings account can carry several intentions without opening
              more bank accounts.
            </p>
          </Feature>
          <Feature name="Archive">
            <p>
              Archived accounts leave the pickers and totals but keep their
              history. “Show archived” brings them back into view.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="transactions" title="Transactions" chip="tab">
        <p>
          The ledger. Three kinds — expense, income, transfer (a transfer is
          a linked pair; edits keep both sides in sync). Grouped by IST day
          with per-day net totals.
        </p>
        <FeatureList>
          <Feature name="Add / edit dialog">
            <p>
              Title, account, category, pocket, amount, date + time, note.
              Validation is per-field and explicit — the Add button never
              silently no-ops.
            </p>
          </Feature>
          <Feature name="AI category suggestion">
            <p>
              Typing a title on a new entry infers the category (debounced,
              marked “auto · change anytime”). The moment you pick one by
              hand it stops overriding you — including mid-flight requests.
            </p>
          </Feature>
          <Feature name="Add from a shared message">
            <p>
              Share a bank/UPI SMS to Sajni (Android share sheet → the PWA):
              it parses amount, direction, description, date/time, matches
              the account via your match hints, pre-fills the pocket from
              your active pocket — you review one screen and save. Text that
              doesn't look like a transaction becomes a bookmark instead.
            </p>
          </Feature>
          <Feature name="Filters & search">
            <p>
              Search by description/category, filter by account and type
              instantly (client-side over the loaded ledger); the pocket
              chips above the tabs add a server-side pocket filter with a
              visible, one-tap-clear banner.
            </p>
          </Feature>
          <Feature name="Categories">
            <p>
              Income and expense categories with color and icon, managed
              in-place (also from Budgets). Deleting or merging duplicates
              re-points history safely.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="pockets" title="Pockets" chip="chip bar">
        <p>
          A pocket is a <strong>spend context</strong> — “Goa Trip”,
          “Wedding”, “New flat”. The chip bar above the tabs shows each
          pocket's spend this month.
        </p>
        <RefTable
          head={['rule', 'behavior']}
          rows={[
            ['One pocket per transaction', 'never two; unfiled = the implicit General pocket'],
            ['Tap a chip', 'filters the ledger to that pocket; tap again to clear'],
            ['Active pocket', 'new manual / shared-SMS / AI transactions file into it by default'],
            ['Automatic transactions', 'biller auto-pay and investment auto-debit ALWAYS land in General'],
            ['Archive', 'retires the chip; history keeps the pocket name'],
            ['Delete', 'its transactions move to General (the confirm says how many)'],
          ]}
        />
        <Callout tone="why">
          Categories answer “what was it?” — pockets answer “what was it{' '}
          <em>for</em>?”. Dinner on a trip is Food <em>and</em> it's the trip;
          forcing that into one taxonomy is how “Trip Food” categories breed.
          The active pocket exists so a trip requires one decision at the
          airport, not one per transaction. Cron-posted money ignores it
          because your Netflix renewal isn't part of the trip.
        </Callout>
      </Section>

      <Section id="budgets" title="Budgets" chip="tab">
        <p>
          A budget = an overall amount + optional soft <strong>category
          caps</strong> that warn but never block. Two kinds:
        </p>
        <FeatureList>
          <Feature name="Monthly (rolling)">
            <p>
              Rolls with the IST calendar automatically — no dates to manage,
              ever. The ‹ month › nav (capped at the current month) recomputes
              past months from the ledger for history.
            </p>
          </Feature>
          <Feature name="Custom range (trips & seasons)">
            <p>
              Fixed start/end dates, plus an optional <strong>pocket
              filter</strong>: pick one or several pockets and the budget
              counts only spending filed in them. General spends never match
              a filtered budget.
            </p>
          </Feature>
        </FeatureList>
        <p>
          <strong>The one-ledger lens model.</strong> Budgets are read-time
          lenses over the single ledger — nothing is allocated or moved, so
          the same rupee can count in several budgets without double-counting
          money. You never assign a budget to a transaction.
        </p>
        <ul>
          <li>No pocket filter (every monthly budget) → sees all spending in its window.</li>
          <li>Pocket filter → sees only those pockets.</li>
          <li>
            <strong>Category caps inherit their budget's lens</strong> — a
            trip's Food cap counts only trip-pocket food; the monthly
            budget's Food cap counts all food, trip included.
          </li>
        </ul>
        <Callout>
          Worked example: Monthly ₹10,000 (Food cap ₹3,000) + “Goa Trip”
          ₹5,000 filtered to the Goa pocket (Food cap ₹1,000). A ₹400 beach
          dinner filed in the pocket counts in all four numbers at once; the
          ₹600 grocery delivery at home the same week counts only in the
          monthly pair. Progress bars escalate calm → attention (&gt;80%) →
          over.
        </Callout>
      </Section>

      <Section id="billers" title="Billers" chip="tab">
        <p>Recurring charges come in two honest kinds:</p>
        <RefTable
          head={['kind', 'behavior']}
          rows={[
            [
              'subscription',
              'fixed amount (Netflix, rent, EMI) — may auto-pay from the linked account each cycle',
            ],
            [
              'bill',
              'amount varies (electricity) — stored amount is an optional estimate; you enter the actual when paying; never auto-pays',
            ],
          ]}
        />
        <FeatureList>
          <Feature name="Marking a cycle paid">
            <p>The ✓ on a row opens a small popover with two paths:</p>
            <ul>
              <li>
                <strong>Record payment</strong> — posts an expense from the
                linked account. Bills ask the actual amount (prefilled from
                the last payment, else the estimate); subscriptions prefill
                the fixed amount.
              </li>
              <li>
                <strong>Attach existing</strong> — link expenses you already
                logged (multi-select from recent expenses, “Attach 2 ·
                ₹3,400”); nothing new is posted.
              </li>
            </ul>
            <p>
              Either way the due date rolls forward. A cycle can't be
              recorded twice — the payment is keyed on the due date, so a
              manual pay racing the auto-pay resolves to exactly one record
              (“already recorded” toast).
            </p>
          </Feature>
          <Feature name="Auto-pay (subscriptions)">
            <p>
              Posts the expense automatically each cycle and notifies on both
              channels. Auto-paid cycles can also be checked off manually —
              whoever gets there first wins, idempotently.
            </p>
          </Feature>
          <Feature name="Payment history">
            <p>
              Tap a biller row for its detail sheet: full details plus every
              recorded cycle — date, amount, auto/manual, and the attached
              transactions under each.
            </p>
          </Feature>
          <Feature name="Remind me / alerts">
            <p>
              “Remind me” spawns a <em>Pay …</em> task near each due date
              (moot under auto-pay, so it's disabled there — with the reason
              shown inline). Alert-days control the due-soon notification
              lead.
            </p>
          </Feature>
          <Feature name="Estimated monthly outflow">
            <p>
              The header estimate normalizes every frequency to a month and
              uses a bill's last actual payment as its baseline once one
              exists.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="investments" title="Investments" chip="tab">
        <p>
          Manually-valued instruments: SIP, RD, FD, mutual fund, other. You
          own the numbers — invested amount and current value are yours to
          update when you check in; gain/loss and totals derive from them.
        </p>
        <FeatureList>
          <Feature name="Auto-debit">
            <p>
              Recurring instruments (monthly / quarterly / yearly with a
              per-cycle amount and a linked account) can auto-debit: each
              cycle Sajni posts the contribution as an expense, grows the
              invested amount and current value, advances the next-debit
              date, and notifies on both channels.
            </p>
            <ul>
              <li>
                Catch-up: if the clock was missed (server asleep, long gap),
                each missed cycle posts exactly once — idempotent per due
                date.
              </li>
              <li>
                The checkbox explains itself when disabled (“link an account
                first”, “set the per-cycle amount”).
              </li>
              <li>Auto-debited contributions land in the General pocket, never the active one.</li>
            </ul>
          </Feature>
          <Feature name="Maturity">
            <p>
              FDs/RDs carry a maturity date; cards count down (“45d to
              maturity”).
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="cards" title="Cards" chip="tab">
        <p>Credit-card statements, generated per cycle:</p>
        <ul>
          <li>
            A statement = previous balance + new charges − payments, with
            cashback computed from the account's scheme. Preview before
            committing.
          </li>
          <li>
            Each statement carries its due date; unpaid ones surface in
            Overview's upcoming dues.
          </li>
          <li>
            Mark paid from any account — that posts the payment transfer and
            closes the cycle.
          </li>
        </ul>
      </Section>

      <Section id="exports" title="Exports" chip="header">
        <p>
          The Export menu downloads CSV — transactions, budgets (windows,
          pocket filters and caps included), and net-worth history. Files
          open directly in Sheets/Excel. <Code>Takeout</Code> in Settings
          covers everything else.
        </p>
      </Section>
    </>
  );
}
