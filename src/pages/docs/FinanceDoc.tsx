import { Section, Callout, Code, RefTable, Feature, FeatureList } from './primitives';

// The finance chapter of the field guide, written for someone new to Sajni:
// what each part does, how to use it, and a worked example for every money
// flow. Keep it in step with the app (AGENTS.md "User guide").

export const financeMeta = {
  id: 'finance',
  label: 'Finance',
  title: 'Finance',
  blurb: 'Your money in one calm ledger: accounts, spending, people who owe you, cards, bills, budgets and investments.',
  sections: [
    { id: 'privacy', label: 'Privacy mode' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'accounts', label: 'Accounts' },
    { id: 'transactions', label: 'Adding a transaction' },
    { id: 'split', label: 'Splitting a bill' },
    { id: 'lending', label: 'Lending money' },
    { id: 'paid-back', label: 'Getting paid back' },
    { id: 'adjust', label: 'Adjusting' },
    { id: 'refunds', label: 'Refunds' },
    { id: 'card-offers', label: 'A friend uses your card' },
    { id: 'cashback', label: 'Cashback' },
    { id: 'categories', label: 'Categories' },
    { id: 'slates', label: 'Slates' },
    { id: 'budgets', label: 'Budgets' },
    { id: 'cards', label: 'Cards' },
    { id: 'billers', label: 'Billers' },
    { id: 'investments', label: 'Investments' },
    { id: 'capture', label: 'Automatic capture' },
    { id: 'ask', label: 'Asking Sajni' },
    { id: 'exports', label: 'Exports' },
    { id: 'faq', label: 'Quick answers' },
  ],
};

export default function FinanceDoc() {
  return (
    <>
      <Section id="privacy" title="Privacy Mode" chip="header toggle">
        <p>
          Amounts are <strong>hidden by default</strong>, so you can open
          Finance in public. Hidden amounts show as stand-in digits of the same
          length, so nothing jumps around when you reveal them.
        </p>
        <ul>
          <li>
            Tap <em>Privacy</em> at the top of Finance to show the real
            figures. They hide again by themselves after{' '}
            <strong>30 minutes</strong>, even if the laptop slept in between.
          </li>
          <li>Tap it again to hide them straight away.</li>
          <li>Charts and names stay visible; only the numbers are hidden.</li>
        </ul>
        <p>
          When shown, every amount is exact to the paisa, for example
          ₹1,200.00. Sajni never rounds money.
        </p>
      </Section>

      <Section id="analytics" title="Analytics" chip="tab">
        <p>
          Finance opens on Analytics: one month at a time, with ‹ and › to
          step back through earlier months. It answers “how much went out,
          and why”.
        </p>
        <RefTable
          head={['figure', 'what it means']}
          rows={[
            ['Spent', 'expenses and adjusted lends, less refunds; every slate counts'],
            ['Income', 'salary and other money in (refunds and paybacks are not income)'],
            ['Saved', 'income minus spent; negative when you spent more than came in'],
            ['Savings rate', 'saved as a share of income'],
            ['Daily average', 'spent divided by the days so far'],
            ['Month end, at this pace', 'this month only: what you have spent, plus what usually goes out in the rest of the month'],
          ]}
        />
        <FeatureList>
          <Feature name="Usual">
            <p>
              Your usual is the average of up to three earlier months, counted
              to the <strong>same day</strong>. On 16 October, “usual” is what
              July, August and September had spent by their 16th, so rent on
              the 1st doesn't make the month look high. Comparisons use your{' '}
              <em>Plain</em> spending only, so a Goa trip in its own slate
              never makes a month look unusual. It starts once there is an
              earlier month to compare with.
            </p>
          </Feature>
          <Feature name="How the month built up">
            <p>
              The running total through the month, against your usual and
              last month. Point at the chart to read any day.
            </p>
          </Feature>
          <Feature name="Why it's higher">
            <p>
              The categories that are above their usual by this day, biggest
              rise first. For example, Food at ₹4,800 against a usual ₹2,000
              shows “+₹2,800.00”.
            </p>
          </Feature>
          <Feature name="Stood out">
            <p>Plain expenses that don't look like the rest:</p>
            <ul>
              <li>
                At least 2.5× your usual spend in that category (its median over
                the last six months), and ₹300 or more above it: a ₹4,000
                dinner where lunch is usually ₹500 reads “8.0× your usual Food
                spend”.
              </li>
              <li>
                A big one-off in a category you rarely use: ₹1,000 or more and
                at least 15% of the month.
              </li>
              <li>
                Something new: a title you haven't used in the last year, of
                ₹1,000 or more.
              </li>
            </ul>
          </Feature>
          <Feature name="Where it went">
            <p>
              Day by day, the five largest, every category with its share, and
              the places you spent most. Places group by title, ignoring
              capitals and spacing, so “Cafe X” and “cafe x” are one.
            </p>
          </Feature>
          <Feature name="Saving, month by month">
            <p>Income against spending for each month, with the savings rate.</p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="accounts" title="Accounts" chip="tab">
        <p>
          The tab opens with your <strong>net worth</strong>: what you have
          (accounts, investments, money owed to you) minus what you owe
          (cards), with its history and what it's made of. Press{' '}
          <em>Snapshot</em> to save today's figure; snapshots build the history
          chart and are never rewritten.
        </p>
        <p>An account is anywhere your money lives. Pick the type that fits:</p>
        <RefTable
          head={['type', 'use it for']}
          rows={[
            ['Savings', 'a regular bank account'],
            ['Salary', 'the account your pay lands in; it remembers your monthly salary and payday'],
            ['Credit card', 'a card; add its statement day and due day so Sajni can work out each bill'],
            ['Cash', 'the money in your wallet'],
            ['Investment', 'a brokerage or similar account'],
          ]}
        />
        <p>
          When you add an account, enter its <strong>opening balance</strong>:
          what it held on the day you started. From then on Sajni works the
          balance out from your transactions; you never edit a balance by hand.
          A card's balance is negative, because it is money you owe.
        </p>
        <FeatureList>
          <Feature name="Crediting salary">
            <p>
              On a salary account, the credit button adds your salary (or a
              bonus) with the amount and date already filled in. New income
              also defaults to your salary account.
            </p>
          </Feature>
          <Feature name="Matching hints">
            <p>
              Add the card's or account's last four digits and the bank's name.
              When a bank message is captured or shared, Sajni uses them to file
              it under the right account without asking.
            </p>
          </Feature>
          <Feature name="Buckets">
            <p>
              Set money aside inside an account without moving it, such as
              “Emergency fund: ₹3,00,000 of ₹5,00,000” inside savings. Open an
              account's buckets with its bucket button. The account shows how
              much of its balance is spoken for.
            </p>
          </Feature>
          <Feature name="Archive">
            <p>
              An archived account leaves the pickers and totals but keeps its
              history. “Show archived” brings it back into view.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="transactions" title="Adding a transaction" chip="tab">
        <p>
          Press <em>Add</em> in Transactions. The sheet always asks for the
          same few things: whether it's an <strong>Expense</strong>,{' '}
          <strong>Income</strong> or <strong>Transfer</strong>; the amount; a
          title (“Lunch at Cafe X”); the account, date and time; and a
          category. Sajni suggests a category as you type the title (marked{' '}
          <em>auto</em>); pick one yourself and it stops guessing.
        </p>
        <p>
          Every transaction needs a <strong>title</strong>; the sheet won't
          save without one. Something captured from an SMS that Sajni couldn't
          name is titled after its category (or “Expense” / “Income”) so you
          can rename it.
        </p>
        <p>
          Everything else is optional and sits under the form as small{' '}
          <strong>+ chips</strong>. Tap one and it becomes part of the form,
          with its name on the left and a × on the right to take it off again.
          Slate only shows up once you have a slate to pick.
        </p>
        <RefTable
          head={['kind', 'optional extras']}
          rows={[
            ['Expense', 'Split, Slate, Note'],
            ['Income', 'Settles a lend, Refund, Slate, Note'],
            ['Transfer', 'Note'],
          ]}
        />
        <FeatureList>
          <Feature name="Transfers">
            <p>
              Moving money between your own accounts: savings to cash at an
              ATM, or salary to pay a card. A transfer is neither spending nor
              income, so it never changes your totals. Both sides stay in step
              when you edit it.
            </p>
          </Feature>
          <Feature name="Editing">
            <p>
              Tap any transaction to edit it. Changes save on their own a few
              seconds after you stop typing, and when you close the sheet.{' '}
              <em>Undo changes</em> puts it back the way it was when you opened
              it.
            </p>
          </Feature>
          <Feature name="Notes and tags">
            <p>
              Add a note for context (“with Priya, birthday”). Any{' '}
              <Code>#tag</Code> in a note files the transaction under that tag,
              alongside your notes and journal.
            </p>
          </Feature>
          <Feature name="Finding things">
            <p>
              Search by title or category, and filter by account, category,
              type (Expense, Income, Refund, Transfer, Lend, Repayment,
              Adjusted) or slate. Tick <strong>several accounts</strong> or{' '}
              <strong>several categories</strong> to see them together, say
              your two cards, or Food and Groceries. Days are grouped with their totals; split bills count only
              your part as spent.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="split" title="Splitting a bill" chip="split">
        <p>
          Use Split when you paid the whole bill but part of it belongs to
          someone else.
        </p>
        <Callout>
          <strong>Example.</strong> On 1 October you pay ₹754.96 for dinner on
          your RuPay card. Rahul will pay you back half.
          <ul className="mt-2 flex flex-col gap-1 pl-5 [&>li]:list-decimal">
            <li>
              Add the expense: ₹754.96, “Dinner”, RuPay card, Food. The
              category is for <em>your</em> part, so pick what your half was.
            </li>
            <li>
              Tap <em>+ Split</em>, type Rahul (or tap his name if he's owed you
              before). <strong>½</strong> is already picked, so{' '}
              <em>Their share</em> reads ₹377.48.
            </li>
            <li>
              Sajni shows <em>You ₹377.48 · Rahul owes ₹377.48</em>. Press Add.
            </li>
          </ul>
        </Callout>
        <p>What happens:</p>
        <ul>
          <li>
            Your card still shows the full <strong>₹754.96</strong>, so it
            matches the bank's message and your card statement.
          </li>
          <li>Your Food spending goes up by only <strong>₹377.48</strong>, your half.</li>
          <li>Rahul owes you ₹377.48, listed under Finance → Lends.</li>
          <li>
            The transaction row reads ₹754.96 with <em>yours ₹377.48</em>{' '}
            under it and a <em>Split · Rahul</em> tag.
          </li>
        </ul>
        <FeatureList>
          <Feature name="Other shares">
            <p>
              Type any amount into <em>Their share</em> (Rahul had the
              expensive dish and owes ₹500), or tap <strong>All</strong> if
              the whole bill is his.
            </p>
          </Feature>
          <Feature name="When it's due">
            <p>
              For a card, the due date defaults to that card bill's due date,
              so you know when you need the money back. Pick another date if
              you like, and turn on <em>Remind</em> to get a nudge.
            </p>
          </Feature>
          <Feature name="A bill that's already in Sajni">
            <p>
              Open it, tap <em>+ Split</em> and fill it in; the sheet's Done
              button becomes <em>Split this bill</em>. Press it. This is how you split card charges that
              were captured automatically.
            </p>
          </Feature>
          <Feature name="Changing it later">
            <p>
              Open the bill: it shows <em>Split with Rahul</em> and what each
              of you owes. Change the bill amount there and your part changes
              while his stays put. Everything about Rahul's part (who, his
              share, when it's due, the reminder) lives in one place:{' '}
              <em>Edit lend</em>, from the bill's <em>Edit lend</em> button or
              by tapping the lend in Lends. Changing his share only moves the
              line between your part and his; the bill stays ₹754.96.{' '}
              <em>Remove split</em> there makes the whole bill yours again.
            </p>
          </Feature>
        </FeatureList>
        <Callout tone="why">
          The card was charged the full amount, so the card has to show the
          full amount, or it will never match the statement. But only your
          half is your spending. A split keeps the bill whole and moves the
          other half out of your spending into what Rahul owes.
        </Callout>
      </Section>

      <Section id="lending" title="Lending money" chip="tab: Lends">
        <p>
          Lending is an expense where <strong>all</strong> of it belongs to
          someone else.
        </p>
        <Callout>
          <strong>Example.</strong> You give Aman ₹500 in cash. Add an Expense
          of ₹500 from Cash, tap <em>+ Split</em>, type Aman and pick{' '}
          <strong>All</strong>. No category is needed, because it isn't your
          spending. Your cash goes down by ₹500 and Aman owes you ₹500.
        </Callout>
        <FeatureList>
          <Feature name="A friend's purchase on your card">
            <p>
              Priya buys a ₹1,499 jacket on your card for its offers. None of
              it is yours: Expense on the card → <em>+ Split</em> → Priya →{' '}
              <strong>All</strong>. Category disappears, because none of it is
              your spending, and it's due with that card bill. The whole
              story, offers and cashback included, is in{' '}
              <a href="#card-offers">A friend uses your card</a>.
            </p>
          </Feature>
          <Feature name="Already recorded it">
            <p>
              Something already in Sajni that was really for someone else, like
              Dad's electricity bill on your card: open it, tap{' '}
              <em>+ Split</em>, pick Dad and <strong>All</strong> (or his part),
              then press <em>Split this bill</em>. One transaction at a time.
            </p>
          </Feature>
          <Feature name="The Lends tab">
            <p>
              Everyone who owes you, with the total at the top. Tap a person to
              see their history as a timeline, oldest first: what you lent (↗),
              what came back (↙) and anything adjusted (✓). Tap any line to
              edit it. People who have paid everything fold away under{' '}
              <em>Settled</em>.
            </p>
            <p>
              <em>Lend</em>, and a person's <em>Settle</em>, open the same
              transaction sheet already filled in (Expense → Split → All, or
              Income → Settles a lend → them). There is one way to record a
              lend and one way to record a payment back: the sheet.
            </p>
          </Feature>
          <Feature name="Editing or deleting a lend">
            <p>
              Tap the lend (in Lends, or its row in Transactions) to open{' '}
              <em>Edit lend</em>: who, the amount or their share, when it's
              due, the reminder. <em>Delete</em> (a cash lend) or{' '}
              <em>Unmark</em> (a bill you marked) is at the bottom of the same
              sheet.
            </p>
          </Feature>
        </FeatureList>
        <p>
          Lent money isn't spending. It stays in your net worth, as money owed
          to you, until it comes back.
        </p>
      </Section>

      <Section id="paid-back" title="Getting paid back" chip="from a person">
        <p>
          When someone pays you back, mark the money you received as theirs,
          and say which lend it was for if it was for one.
        </p>
        <Callout>
          <strong>Example.</strong> Alefiya owes you for an order on 3 October
          (₹398) and one on 11 October (₹1,836). The 11 October order's ₹200
          instant cashback lands in your Amazon Pay balance. Add an Income of
          ₹200 on that account, tap <em>+ Settles a lend</em>, pick Alefiya,
          and set <strong>Toward</strong> to the 11 October order. That order
          now shows <em>₹1,636 left</em>, and she owes ₹2,034 in total.
        </Callout>
        <ul>
          <li>
            <strong>Toward a lend</strong>: the payment pays that lend off. If
            it's more than the lend, the extra still lowers their total.
          </li>
          <li>
            <strong>Overall</strong> (the default): the payment lowers their
            total, and no single lend shows it. Use it for a lump sum (“₹3,000
            for everything”) or when you don't know what it was for.
          </li>
          <li>
            When their total reaches ₹0, every lend of theirs is settled. A lend
            never shows more left than their total.
          </li>
          <li>
            The money can land in <strong>any</strong> account. It doesn't
            have to be the one you lent from.
          </li>
          <li>
            Paying more than they owe keeps the extra <em>held</em> for them;
            it nets off their next lend.
          </li>
          <li>
            A payment can't be dated before what it pays back: the lend it's
            Toward, or for Overall, their first lend. Paid back on 3 October
            for a coffee on the 15th? Sajni says so and saves nothing, so fix
            whichever date is wrong. The same day at an earlier time is fine.
            Moving a lend or a split bill after its payments is refused the
            same way.
          </li>
        </ul>
        <FeatureList>
          <Feature name="Money that's already in Sajni">
            <p>
              The repayment was usually captured from a UPI message. Open it,
              tap <em>+ Settles a lend</em>, pick the person (and Toward), then
              press <em>Mark as paid back</em> (the sheet's Done button takes
              that name once a person is picked).
            </p>
          </Feature>
          <Feature name="Money that isn't in Sajni yet">
            <p>
              Cash, or a transfer that was never captured: add it as an Income
              with its real date and time and <em>+ Settles a lend</em>. In
              Lends, the person's <em>Settle</em> button opens exactly that.
              Don't add it again if the SMS already did; settle that one.
            </p>
          </Feature>
          <Feature name="Changing it later">
            <p>
              Tap the payment (in Transactions, or in the person's timeline) to
              open <em>Edit repayment</em>. Change its title, its note, or{' '}
              <em>Toward</em>. Its amount, account and date stay put.{' '}
              <em>Unmark</em> at the bottom turns it back into ordinary income.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="adjust" title="Adjusting what someone owes" chip="adjust">
        <Callout>
          <strong>Example.</strong> Rahul still owes ₹317.48 and you tell him
          to leave it. Open Rahul in Lends and press <em>Adjust</em>. The
          amount starts at everything he owes; lower it to adjust only part.
          Choose what it counts as (say, Gifts) and the date and time.
        </Callout>
        <ul>
          <li>Rahul then owes ₹0.00, or whatever you didn't adjust.</li>
          <li>
            The adjusted amount <strong>counts as your spending</strong> on
            that date, in the category you chose. You did give that money
            away.
          </li>
          <li>
            No money moves: balances and card bills don't change, because the
            money already left when you lent it.
          </li>
        </ul>
        <p>
          Like a payment, an adjustment can go <em>Toward</em> one lend or
          their overall total. Tap the <em>Adjusted</em> line in the timeline
          to change its amount, what it counts as, or its date and time (up to
          what they'd owe without it), or press <em>Undo adjustment</em>.
        </p>
        <FeatureList>
          <Feature name="Adjusting their share of a cashback">
            <p>
              Alefiya paid ₹378 for a ₹398 order, keeping the ₹20 your card
              will give back at month end. Adjust the ₹20 in your{' '}
              <em>Cashback</em> category. It adds ₹20 to your spending for now;
              when the month's cashback arrives as a refund in the same
              category (see <a href="#cashback">Cashback</a>), it takes the ₹20
              back off. You never split the month's cashback by order.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="refunds" title="Refunds" chip="refund">
        <p>
          A refund is money back on something you bought. It isn't income, so
          Sajni treats it differently.
        </p>
        <Callout>
          <strong>Example.</strong> You returned a ₹1,299 order and Amazon
          refunded it to your card. Add an Income of ₹1,299 to the card, tap{' '}
          <em>+ Refund</em> and, if you like, pick the original purchase. Sajni
          fills in its category, Shopping.
        </Callout>
        <ul>
          <li>Your card balance goes up by ₹1,299, like any money coming in.</li>
          <li>
            Your <strong>Shopping spending goes down</strong> by ₹1,299, and so
            do budgets that count it.
          </li>
          <li>
            It is <strong>not</strong> income, so a month of returns won't look
            like a pay rise.
          </li>
        </ul>
        <p>
          A refund that arrived as income (automatic capture records them that
          way): open it and tap <em>+ Refund</em>. Tap × on the Refund pill to
          turn it back into income.
        </p>
        <FeatureList>
          <Feature name="Why it says “Not linked”">
            <p>
              Linking a refund to its purchase is optional. “Not linked” just
              means it isn't tied to one; the refund still lowers spending in
              the category you pick. Linking only copies the purchase's
              category and slate for you.
            </p>
            <p>
              The list offers your 30 newest ordinary expenses{' '}
              <strong>on the account the refund lands in</strong>. So it's
              empty when that account has no purchases (Income switches to your
              salary account; switch it to the card you bought on), and it
              never shows lends or bills that are already split.
            </p>
          </Feature>
          <Feature name="Cashback is a refund too">
            <p>
              Cashback is money back on what you spent, so file it as an
              unlinked refund in a <em>Cashback</em> category; see{' '}
              <a href="#cashback">Cashback</a>.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="card-offers" title="A friend uses your card for its offers" chip="worked example">
        <p>
          A friend buys something on your card because your card gets a
          better deal. None of it is your spending: it's a lend, and every
          offer that comes back is settled between you.
        </p>
        <Callout>
          <strong>Example.</strong> Priya orders a ₹1,499 jacket on your
          Amazon Pay card. Amazon gives ₹200 instant cashback into your Amazon
          Pay balance, and the card pays 5% cashback at month end. You ask
          Priya for the full amount minus the ₹200, and pass the 5% on to her
          once it arrives.
          <ul className="mt-2 flex flex-col gap-1 pl-5 [&>li]:list-decimal">
            <li>
              <strong>Order day.</strong> Expense ₹1,499 on the card →{' '}
              <em>+ Split</em> → Priya → <strong>All</strong>. No category.
              Priya owes ₹1,499.
            </li>
            <li>
              <strong>The ₹200 lands in Amazon Pay balance.</strong> It's hers:
              Income ₹200 on that account → <em>+ Settles a lend</em> → Priya,
              Toward the jacket. No category. She owes ₹1,299.
            </li>
            <li>
              <strong>She sends ₹1,299.</strong> Income →{' '}
              <em>+ Settles a lend</em> → Priya. She owes ₹0.00 and the lend is
              settled.
            </li>
            <li>
              <strong>Month end, the card pays ₹500 cashback</strong> for all
              your spending, hers included. Income ₹500 on the card →{' '}
              <em>+ Refund</em>, not linked, category <em>Cashback</em>.
            </li>
            <li>
              <strong>You send her ₹74.95</strong> (5% of ₹1,499). Expense in{' '}
              <em>Cashback</em>. Not a split: she doesn't owe it back.
            </li>
          </ul>
        </Callout>
        <p>What happens:</p>
        <ul>
          <li>
            The card shows the ₹1,499 charge and the ₹500 cashback, so it
            matches the statement. Amazon Pay balance is up ₹200.
          </li>
          <li>Your spending never counts the jacket.</li>
          <li>Priya's lend is settled; nobody owes anybody.</li>
          <li>
            Cashback nets to −₹425.05 (₹74.95 passed on, ₹500 back): your
            spending is ₹425.05 lower, exactly what you kept.
          </li>
        </ul>
        <FeatureList>
          <Feature name="She pays you less instead">
            <p>
              If Priya keeps the 5% up front and sends ₹1,224.05 (₹1,499 −
              ₹200 − ₹74.95), mark it paid back as above. She still owes
              ₹74.95; open her in Lends and <em>Adjust</em> it in{' '}
              <em>Cashback</em>. Record the card's cashback as usual: the
              adjustment and the refund cancel out in that category.
            </p>
          </Feature>
          <Feature name="Two orders, one payment">
            <p>
              Priya owes ₹1,499 and ₹2,000 and sends ₹3,499 in one go. Mark it
              paid back once, Toward <em>Overall</em>: her total reaches ₹0,
              so both lends are settled, and you never split her payment by
              hand. Whatever is still short (her 5% on both, if she kept it) is
              one adjustment.
            </p>
          </Feature>
          <Feature name="Which credit is whose">
            <p>
              A credit that is <strong>all hers</strong>, like the order's ₹200
              offer, <em>settles a lend</em>. A credit that mixes hers with
              yours, like the card's monthly cashback, is yours: record it as
              a Cashback refund, and pass her share on (or adjust it) in
              Cashback. One credit can't be part repayment and part refund.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="cashback" title="Cashback" chip="refund">
        <p>
          Cashback is money back on what you spent, so record it as a{' '}
          <strong>refund</strong>: Income → <em>+ Refund</em>, not linked to a
          purchase, in an expense category called <em>Cashback</em> (make it in
          Categories in Transactions). Your spending then shows what things
          really cost you, and nothing about cashback looks like a pay rise.
        </p>
        <Callout>
          <strong>Example.</strong> Your card credits ₹500 cashback on the
          30th. Add an Income of ₹500 on the card, tap <em>+ Refund</em>, leave
          it <em>Not linked</em>, category Cashback. The card balance goes up
          ₹500 and this month's spending goes down ₹500.
        </Callout>
        <ul>
          <li>
            One refund for the month's total: you never break it down by
            order.
          </li>
          <li>
            Part of it belongs to a friend whose orders earned it? Adjust (or
            pay out) their share in <em>Cashback</em> too. Those add to
            spending and the refund takes them off, so the category nets to
            what you kept. See{' '}
            <a href="#adjust">Adjusting their share of a cashback</a>.
          </li>
          <li>
            If the cashback lands next month, the adjustment shows this month and
            the refund next month; the two months even out.
          </li>
          <li>
            Cashback that is <strong>all</strong> someone else's (their
            order's instant offer) goes toward what they owe instead:{' '}
            <em>+ Settles a lend</em>, with an honest title like “Amazon
            instant cashback”. See <a href="#card-offers">A friend uses your card</a>.
          </li>
          <li>
            The Cards tab estimates the cashback a cycle should earn from the
            card's rate; the credit you record is the real figure.
          </li>
        </ul>
      </Section>

      <Section id="categories" title="Categories" chip="tab: Transactions">
        <p>
          Categories group what you spend (Food, Transport, Bills) and what you
          earn (Salary, Interest). Manage them with the{' '}
          <em>Categories</em> button in Transactions, or from Budgets. Expense
          and income categories are separate lists, and <em>Others</em> is
          always there as the fallback. Deleting or merging duplicates moves
          their history safely.
        </p>
        <p>
          Sajni learns from you: once you file “Swiggy” under Food, the next
          Swiggy transaction is filed there too.
        </p>
      </Section>

      <Section id="slates" title="Slates" chip="tab">
        <p>
          A slate answers one question: <strong>is this normal life, or
          not?</strong> Every transaction is on exactly one.{' '}
          <strong>Plain</strong> is normal life and where everything lands by
          default; every other slate is something unusual you named: “Goa
          Trip”, “Wedding”, “Fridge”.
        </p>
        <RefTable
          head={['rule', 'behaviour']}
          rows={[
            ['One slate per transaction', 'never two, never none; unfiled means Plain'],
            ['Plain', 'built in; cannot be renamed, archived or deleted'],
            ['Budgets', 'ignore every slate they do not name'],
            ['Filing one', 'tap + Slate in the transaction sheet'],
            ['Filing many', 'select rows in Transactions (long-press on Android), then Move to slate'],
            ['Automatic transactions', 'bill auto-pay and investment auto-debit land in Plain'],
            ['Opening one', 'tap a slate to see its transactions and total: “what did Goa cost?”'],
            ['Archive', 'hides a finished slate from pickers; its transactions and budgets stay'],
            ['Delete', 'everything on it moves back to Plain; the confirm says how many'],
          ]}
        />
        <Callout tone="why">
          One trip inflates a month and you can no longer tell normal spending
          from unusual spending. Categories can't fix that: dinner in Goa is
          Food whether you're on holiday or at home. A slate is a separate
          label, so a budget on Plain simply never sees the trip. You usually
          notice something was unusual only afterwards, which is why you can
          file it later.
        </Callout>
      </Section>

      <Section id="budgets" title="Budgets" chip="tab">
        <p>
          A budget is an overall spending limit, with optional{' '}
          <strong>caps per category</strong> that warn but never block, and a
          choice of <strong>which slates it counts</strong>. Each budget is
          separate: July and August are two budgets, and editing one never
          rewrites the other.
        </p>
        <FeatureList>
          <Feature name="Dates (optional)">
            <p>
              Start and end dates limit what the budget counts; leave them off
              for no limit, as with a budget for a slate. Presets fill this
              week, this month or this year. When the end date passes, the
              budget moves to <em>Closed</em>.
            </p>
          </Feature>
          <Feature name="Which slates it counts">
            <p>
              Leave it empty and the budget counts <strong>Plain only</strong>,
              your normal life. Name a slate and it counts that instead, so
              “Goa Trip · ₹40,000” tracks just the trip. Name several and they
              share one limit.
            </p>
          </Feature>
          <Feature name="What counts as spent">
            <p>
              Expenses and adjusted lends count; refunds take away; your share
              of a split bill counts, not the whole bill. Category caps follow
              the budget's slates.
            </p>
          </Feature>
          <Feature name="Next month">
            <p>
              Nothing resets on its own. Duplicate a budget to get the next one
              with the same limit, caps and slates, and its dates moved forward.
            </p>
          </Feature>
        </FeatureList>
        <Callout>
          <strong>Example.</strong> “August” ₹10,000 with a Food cap of ₹3,000,
          and “Goa Trip” ₹5,000 on the Goa slate. A ₹400 beach dinner filed on
          the Goa slate counts only toward the trip; a ₹600 grocery order at
          home counts only toward August. Bars go from calm to attention (above
          80%) to over.
        </Callout>
      </Section>

      <Section id="cards" title="Credit cards and statements" chip="tab">
        <p>
          Add a card as a <em>Credit card</em> account with its statement day
          (when the bill is made) and due day (when it must be paid), and
          optionally its limit and cashback (a percentage or a fixed amount).
          The Cards tab keeps one statement per billing cycle. Sajni works out:
        </p>
        <ul>
          <li><strong>Previous balance</strong>: the last statement, less payments since.</li>
          <li>
            <strong>New charges</strong>: what the card was charged in the
            cycle, including bills you split or paid for others, less refunds
            and other credits.
          </li>
          <li><strong>Amount due</strong> and <strong>cashback earned</strong>.</li>
        </ul>
        <p>
          Preview it, and overwrite any figure with the one on the real
          statement. Press <em>Mark paid</em> and choose the account it's paid from: Sajni
          records the transfer to the card and closes the cycle.
        </p>
      </Section>

      <Section id="billers" title="Billers" chip="tab">
        <p>Payments that repeat come in two kinds:</p>
        <RefTable
          head={['kind', 'behaviour']}
          rows={[
            ['Subscription', 'fixed amount (Netflix, rent, EMI); can auto-pay from the linked account each cycle'],
            ['Bill', 'amount varies (electricity); store an estimate if you like and enter the actual when paying; never auto-pays'],
          ]}
        />
        <FeatureList>
          <Feature name="Paying a cycle">
            <p>The ✓ on a biller gives two choices:</p>
            <ul>
              <li>
                <strong>Record payment</strong> adds the expense from the
                linked account. Bills ask for the actual amount, prefilled from
                last time.
              </li>
              <li>
                <strong>Attach existing</strong> links expenses already in
                Sajni (say, captured from an SMS), so nothing is added twice.
              </li>
            </ul>
            <p>
              Either way the due date moves on. A cycle can only be paid once,
              even if you and auto-pay get there at the same moment.
            </p>
          </Feature>
          <Feature name="Auto-pay">
            <p>
              Subscriptions can add their expense on each due date by
              themselves, and tell you when they do.
            </p>
          </Feature>
          <Feature name="Reminders">
            <p>
              <em>Remind me</em> adds a “Pay …” task near each due date (not
              needed with auto-pay, so it's off there). Alert days set how
              early the due-soon notification comes.
            </p>
          </Feature>
          <Feature name="History and monthly estimate">
            <p>
              Tap a biller for every paid cycle and the transactions under
              each. The header estimates your monthly outflow across all
              frequencies, using a bill's last actual payment once there is
              one.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="investments" title="Investments" chip="tab">
        <p>
          Track SIPs, mutual funds, recurring and fixed deposits, and anything
          else. Each has an invested amount and a current value, so you see
          your gain or loss. RD and FD values are estimated to today from the
          amount, dates and annual rate (quarterly compounding); for SIPs and
          other market-linked ones, update the value from your statement.
        </p>
        <FeatureList>
          <Feature name="Auto-debit">
            <p>
              For something paid every month, quarter or year, set the amount
              per cycle and link the paying account. Each cycle Sajni records
              the payment from that account, adds it to the invested amount,
              and tells you. If cycles were missed, each one is caught up
              exactly once.
            </p>
          </Feature>
          <Feature name="Maturity">
            <p>
              FDs and RDs carry a maturity date and count down to it (“45d to
              maturity”). The estimate stops growing at maturity; the bank's
              final figure may round differently.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="capture" title="Capturing transactions automatically" chip="android · share">
        <FeatureList>
          <Feature name="On Android">
            <p>
              Sajni can read bank SMS and payment-app notifications (GPay,
              PhonePe, bank apps) and add the transaction for you. Turn it on
              in Settings and allow what it asks for.
            </p>
            <ul>
              <li>
                If the account is matched (see matching hints), it's added
                straight away, with an <em>Undo</em> in the notification.
              </li>
              <li>If Sajni can't tell which account, the notification asks you.</li>
              <li>
                The same payment often arrives twice, as an SMS and a UPI
                notification. Sajni recognises the bank reference number and
                asks <em>Add anyway?</em> rather than adding it twice. Two
                payments are never merged just because the amounts match.
                One bank text seen twice (as the SMS itself and as your
                messages app's notification of it) is the same message, so
                it's read only once.
              </li>
            </ul>
          </Feature>
          <Feature name="From the share menu">
            <p>
              Share a bank or UPI message to Sajni from your phone. It reads
              the amount, direction, title and time, picks the account from
              your matching hints, and opens one screen to check and save. A
              shared link that isn't a payment is saved as a bookmark instead.
            </p>
          </Feature>
          <Feature name="Someone else's charge">
            <p>
              The check screen (shared, or when Sajni asks which account) has
              the same <em>+ Split</em> as a new expense: pick the person and ½,
              All or their share, and it's filed split or lent in one go.
            </p>
          </Feature>
        </FeatureList>
        <p>Afterwards, open the transaction to split it, mark it paid back, or mark it as a refund.</p>
      </Section>

      <Section id="ask" title="Asking Sajni" chip="@sajni">
        <p>
          In the command palette, type <Code>@sajni</Code> and say what you
          want. It makes the change and shows you what it did.
        </p>
        <RefTable
          head={['you type', 'it does']}
          rows={[
            ['spent 450 on lunch, card', 'adds the expense'],
            ['the 754.96 dinner on Oct 1 was half Rahul\'s', 'splits that bill ½ with Rahul'],
            ['Rahul sent me 100 for the cab, mark it paid back', 'settles it toward the cab lend'],
            ['the Amazon credit yesterday was a refund', 'turns that income into a refund'],
            ['adjust what Aman owes', 'adjusts it'],
            ['what did the Goa trip cost?', 'totals the Goa slate'],
            ['why is spending so high this month?', 'explains it, with the same figures as Analytics'],
          ]}
        />
      </Section>

      <Section id="exports" title="Exports" chip="header">
        <p>
          The export button downloads CSV files of transactions, budgets (with
          their dates, slates and caps) and net-worth history. They open in
          Sheets or Excel. <Code>Takeout</Code> in Settings covers everything
          else.
        </p>
      </Section>

      <Section id="faq" title="Quick answers">
        <FeatureList>
          <Feature name="I paid a group dinner and three friends owe me">
            <p>
              A split has one person, so spread the bill over rows on the same
              card and date. For ₹1,000 shared by four: add ₹500 split ½ with
              Rahul (your ₹250 and his), then ₹250 split All with Priya and ₹250
              split All with Aman. The card shows ₹1,000, your spending is ₹250,
              and each friend owes ₹250.
            </p>
          </Feature>
          <Feature name="A friend paid for me">
            <p>
              Sajni tracks money owed <em>to</em> you. Record your expense when
              you pay them back.
            </p>
          </Feature>
          <Feature name="Is a split bill counted twice?">
            <p>
              No. The card counts the whole bill once, your spending counts
              your part, and their part is money owed to you.
            </p>
          </Feature>
          <Feature name="My card doesn't match the statement">
            <p>
              Look for a charge captured twice, or a refund still recorded as
              income. You can also type the real statement figures over
              Sajni's.
            </p>
          </Feature>
          <Feature name="Can I delete a lend?">
            <p>
              Yes, from <em>Edit lend</em>. A cash lend (Split → All) is
              deleted along with its transaction. A bill you marked, or a
              split, is <em>unmarked</em> instead, which hands the whole bill
              back to you as an expense. To delete a split bill itself, remove
              its split first. Payments that were toward it go back to the
              person's overall total.
            </p>
          </Feature>
        </FeatureList>
      </Section>
    </>
  );
}
