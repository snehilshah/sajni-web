import { Section, Code, Kbd, Feature, FeatureList } from './primitives';

export const memosMeta = {
  id: 'memos',
  label: 'Memos',
  title: 'Memos',
  blurb: 'A fast capture stream for thoughts that do not need the structure of a note.',
  sections: [
    { id: 'capture', label: 'Capture' },
    { id: 'timeline', label: 'Timeline' },
  ],
};

export default function MemosDoc() {
  return (
    <>
      <Section id="capture" title="Capture">
        <p>
          Memos are a first-class Sajni space at <Code>/memos</Code>. They are
          deliberately lightweight: write the thought, save it, and keep
          moving without choosing a title or folder first.
        </p>
        <FeatureList>
          <Feature name="Quick capture">
            <p>
              The composer sits at the top of the page. Save with the button
              or press <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> (or Command + Enter on
              macOS).
            </p>
          </Feature>
          <Feature name="Search">
            <p>
              The search field filters memos by content. Clear the query to
              return to the complete timeline.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="timeline" title="Timeline">
        <p>
          Saved memos appear as a newest-first timeline grouped by day, so
          recent captures stay easy to scan without turning the page into a
          document index.
        </p>
        <FeatureList>
          <Feature name="Pin">
            <p>
              Pin or unpin a memo when you want to keep an important capture
              prominent while still leaving it in the memo stream.
            </p>
          </Feature>
          <Feature name="Open and edit">
            <p>
              Open a memo for its detail view, where the content can be
              edited and saved without converting it into another object.
            </p>
          </Feature>
          <Feature name="Delete">
            <p>
              Memos can be deleted from the detail view. Sajni asks for
              confirmation before removing one.
            </p>
          </Feature>
        </FeatureList>
      </Section>
    </>
  );
}
