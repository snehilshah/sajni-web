import { Section, Callout, RefTable, Feature, FeatureList } from './primitives';

export const mediaMeta = {
  id: 'media',
  label: 'Media',
  title: 'Media',
  blurb: 'Movies, shows and books with real tracking — plus the read-later shelves for shared links.',
  sections: [
    { id: 'library', label: 'Movies · Shows · Books' },
    { id: 'statuses', label: 'Statuses' },
    { id: 'shows', label: 'Episode tracking' },
    { id: 'movies', label: 'Collections & upcoming' },
    { id: 'bookmarks', label: 'Videos · Sites' },
  ],
};

export default function MediaDoc() {
  return (
    <>
      <Section id="library" title="The library" chip="movies · shows · books">
        <p>
          Three library tabs share one shape: search-to-add, a poster grid,
          and a detail sheet per item.
        </p>
        <FeatureList>
          <Feature name="Search-to-add (TMDB)">
            <p>
              Adding a movie or show searches TMDB — poster, year, genre and
              release date come along for free. Books are added by hand.
              Everything is editable after; the external link just seeds it.
            </p>
          </Feature>
          <Feature name="Per-item fields">
            <p>
              Rating (your own scale), platform (Netflix, Prime, Disney+ …),
              notes with <em>#tags</em>, genre, year. The platform field is a
              memory aid — “where was I watching this?” — not an integration.
            </p>
          </Feature>
          <Feature name="Library controls">
            <p>
              Free-text search filters the grid; sort by recently updated /
              added, completion date, rating, year, title, or status. Status
              filters narrow the grid to one shelf of the lifecycle.
            </p>
          </Feature>
          <Feature name="Events timeline">
            <p>
              Each item accumulates events — added, started, finished,
              episode progress — so “when did we watch this?” has an answer.
              The latest completion date is what the “recently completed”
              sort uses.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="statuses" title="Statuses">
        <RefTable
          head={['status', 'meaning']}
          rows={[
            ['in progress', 'currently watching / reading'],
            ['upcoming', 'not released yet — tracked from its release date'],
            ['pending', 'owned/queued, not started'],
            ['waiting', 'paused on something external (next season, library copy)'],
            ['complete', 'finished'],
            ['archived', 'shelved, out of the active views'],
            ['dropped', 'started and abandoned — a valid ending'],
            ['scratched', 'decided against before starting'],
          ]}
        />
        <Callout tone="why">
          Most trackers have three states and a guilt pile. Splitting
          “dropped” from “scratched” from “waiting” keeps the library honest:
          abandoning a bad book is recorded as a decision, not hidden as
          eternal “in progress”.
        </Callout>
      </Section>

      <Section id="shows" title="Episode tracking" chip="shows">
        <p>
          Shows track progress at two levels: seasons and episodes. TMDB
          supplies per-season episode counts, so behavior is precise:
        </p>
        <ul>
          <li>
            Progress is “season + episode within it” (“S2 · E5 of 10”); the
            cumulative count is derived, so totals stay correct across
            uneven seasons.
          </li>
          <li>
            Switching to a new season anchors you at its start; switching
            back to the season you're mid-way through keeps your place.
          </li>
          <li>
            Marking the show <em>complete</em> snaps progress to the very
            end — last season, last episode — so a finished show never reads
            half-watched.
          </li>
          <li>
            When TMDB doesn't know the counts, set totals by hand — tracking
            degrades gracefully instead of blocking.
          </li>
        </ul>
      </Section>

      <Section id="movies" title="Collections & upcoming" chip="movies">
        <FeatureList>
          <Feature name="Collections">
            <p>
              A movie that belongs to a franchise carries its TMDB
              collection (“The Godfather Collection”) — the detail sheet
              shows the sibling films so the next installment is one tap to
              add.
            </p>
          </Feature>
          <Feature name="Upcoming releases">
            <p>
              Adding an unreleased film sets it to <em>upcoming</em> with its
              release date; it graduates to your queue when the date passes.
              Track the sequel the day it's announced, forget about it until
              it exists.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="bookmarks" title="Read-later shelves" chip="videos · sites">
        <p>
          The last two tabs are bookmarks, not library items — links you
          saved to come back to, split by kind (video hosts vs everything
          else).
        </p>
        <FeatureList>
          <Feature name="Share to save">
            <p>
              Share any page or video to Sajni (PWA share sheet) — it lands
              here with the title fetched server-side when the share didn't
              carry one. YouTube/Vimeo/Twitch links auto-file under Videos.
              A note with <em>#tags</em> can be added at save time.
            </p>
          </Feature>
          <Feature name="Unread & archive">
            <p>
              New bookmarks are <em>unread</em>; opening or explicitly
              marking clears it. Archive keeps the link but removes it from
              the active shelf — the read-later pile stays a pile you can
              actually finish.
            </p>
          </Feature>
        </FeatureList>
        <Callout>
          Sharing a bank/UPI SMS does <em>not</em> land here — text that
          looks like a transaction routes to Finance's add-from-message flow
          instead. The share target reads the content, not just the type.
        </Callout>
      </Section>
    </>
  );
}
