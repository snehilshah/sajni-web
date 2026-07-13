import { Section, Callout, Code, RefTable, Feature, FeatureList } from './primitives';

export const projectsMeta = {
  id: 'projects',
  label: 'Projects',
  title: 'Projects',
  blurb: 'Thinking as a material: cards with kinds and relations, AI synthesis — and the full chat next door.',
  sections: [
    { id: 'projects', label: 'Projects tab' },
    { id: 'cards', label: 'Cards, kinds & relations' },
    { id: 'ai', label: 'Synthesize & enrich' },
    { id: 'chat', label: 'Chat tab' },
  ],
};

export default function ProjectsDoc() {
  return (
    <>
      <Section id="projects" title="Projects" chip="projects tab">
        <p>
          A project is a container for a line of thinking — a decision you're
          circling, a thing you're designing, a question you keep reopening.
          Inside it: cards, a synthesis, and the AI tools that work the
          material. The page keeps a second tab, <em>Chat</em>, so long
          conversations with Sajni live next to the thinking they feed.
        </p>
      </Section>

      <Section id="cards" title="Cards, kinds & relations">
        <p>
          The unit of thought is a <strong>card</strong>: short text with a{' '}
          <strong>kind</strong>, connectable to other cards with typed{' '}
          <strong>relations</strong>.
        </p>
        <RefTable
          head={['kinds', 'relations']}
          rows={[
            [
              'note · entity · question · idea · reflection',
              'supports · contradicts · extends · depends on',
            ],
            [
              'claim · fact · hypothesis · evidence',
              'refines · fixes · refs · points · questions',
            ],
            [
              'contradiction · decision · todo',
              'exemplifies · generalizes · related',
            ],
          ]}
        />
        <FeatureList>
          <Feature name="Kind chips">
            <p>
              Every card wears its kind as a tonal chip — a board scans as
              epistemology at a glance: what's claimed, what's known, what's
              still a question. Kinds filter the board.
            </p>
          </Feature>
          <Feature name="Detail drawer">
            <p>
              Opening a card shows its text, its AI enrichment, and its
              connections with jump-through to the related cards. Kind and
              relations are editable in place.
            </p>
          </Feature>
        </FeatureList>
        <Callout tone="why">
          Prose hides disagreement — two contradicting beliefs can live three
          paragraphs apart forever. Cards force claims to stand alone, and
          typed relations (<Code>contradicts</Code>, <Code>depends_on</Code>)
          make the tension a first-class object you can see and resolve.
        </Callout>
      </Section>

      <Section id="ai" title="Synthesize & enrich">
        <FeatureList>
          <Feature name="Synthesize">
            <p>
              With two or more cards, Sajni reads the whole board and drafts
              the through-line — a thesis for the project. Behavior: the
              synthesis is stamped with when it ran; when enough new cards
              accumulate after it, the page marks it stale and offers
              re-synthesis (it won't nag about the same un-synthesized
              cards twice).
            </p>
          </Feature>
          <Feature name="Enrich">
            <p>
              Per card, Sajni expands the thought — a summary, angles,
              questions, and suggested connections to sibling cards.
              Enrichment runs server-side asynchronously; the card fills in
              when it lands. You can edit or re-run it; your edits are kept
              as yours.
            </p>
          </Feature>
          <Feature name="Connections">
            <p>
              Suggested links surface on the card (“3 connections”) and can
              be accepted into real relations — the AI proposes, you commit.
            </p>
          </Feature>
        </FeatureList>
        <p>
          Intended rhythm: dump cards fast during the week, run Synthesize
          when the board feels full, promote what survives into notes or
          tasks.
        </p>
      </Section>

      <Section id="chat" title="Chat" chip="chat tab">
        <p>
          The full conversation surface with Sajni — the same brain as the
          palette, with room to go long.
        </p>
        <FeatureList>
          <Feature name="Sessions">
            <p>
              Conversations are kept as sessions: start a new chat, or reopen
              a previous one from history and continue with its context
              intact.
            </p>
          </Feature>
          <Feature name="It acts, not just answers">
            <p>
              Chat has the full tool set — it can create tasks, log
              transactions, pay billers, file pockets, search your notes.
              When it changes data, the affected pages refresh themselves;
              action cards deep-link to what it touched.
            </p>
          </Feature>
        </FeatureList>
        <p>
          For the one-line question, prefer the palette (<Code>@sajni</Code>);
          see the <em>Ask Sajni</em> page for the split.
        </p>
      </Section>
    </>
  );
}
