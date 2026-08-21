import { Section, Callout, Code, Feature, FeatureList } from './primitives';

export const settingsMeta = {
  id: 'settings',
  label: 'Settings & data',
  title: 'Settings & data',
  blurb: 'Appearance, themes, profile identity, reminder delivery, takeout and deletion.',
  sections: [
    { id: 'appearance', label: 'Appearance & density' },
    { id: 'themes', label: 'Themes & AI themes' },
    { id: 'account', label: 'Account' },
    { id: 'data', label: 'Your data' },
  ],
};

export default function SettingsDoc() {
  return (
    <>
      <Section id="appearance" title="Appearance & density">
        <FeatureList>
          <Feature name="Light / Dark / System">
            <p>
              System follows the OS live — flip your OS at sunset and Sajni
              follows without a reload. The choice applies before first paint,
              so there's no flash on load.
            </p>
          </Feature>
          <Feature name="Density">
            <p>
              Compact / Comfortable / Cozy scales the entire type ramp — one
              knob, no per-page settings.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="themes" title="Themes & AI themes">
        <FeatureList>
          <Feature name="Preset themes">
            <p>
              Marine, PowerPuff, Gruvbox, Peach, Mauve. Each is just a set of
              Material 3 seed colors — the full light <em>and</em> dark token
              families derive from the seeds, which is why every theme
              respects the Appearance toggle.
            </p>
          </Feature>
          <Feature name="AI themes">
            <p>
              Describe a vibe — <Code>“forest morning, calm,
              dark-leaning”</Code> — and Sajni mixes seed colors and derives
              the same token set. Behavior:
            </p>
            <ul>
              <li>Generated themes save to your list; activate or delete them any time.</li>
              <li>The Settings generator creates both palettes and follows your Appearance setting.</li>
              <li>Newly generated themes activate immediately, including themes made through Sajni chat.</li>
              <li>The active theme is remembered server-side and follows you across devices.</li>
              <li>Picking a preset releases the AI theme; your saved list keeps it.</li>
            </ul>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="account" title="Account">
        <FeatureList>
          <Feature name="Profile and voxel avatar">
            <p>
              The profile card keeps your larger voxel character beside your
              editable display name, email and linked sign-in methods. Reroll
              changes the character without uploading or storing an image —
              it is generated locally from your account and revision. Theme
              swatches tint it, motion follows reduced-motion preferences,
              and navigation uses a calmer close crop at its compact size.
            </p>
          </Feature>
          <Feature name="Sign-in and sessions">
            <p>
              Email, Google and GitHub sign-in methods land in the same
              account. Sessions refresh silently and end on sign-out; the
              guided tour can be replayed from Settings.
            </p>
          </Feature>
          <Feature name="Reminder delivery">
            <p>
              Android Settings offers one account-level choice for Email,
              Push or Both. It applies to personal reminders, task reminders,
              digests and other timed notices instead of adding channel knobs
              to every reminder.
            </p>
          </Feature>
        </FeatureList>
      </Section>

      <Section id="data" title="Your data">
        <FeatureList>
          <Feature name="Takeout">
            <p>
              One button downloads a .zip of everything you own. The same
              section imports a takeout back — the import reports exactly
              what it restored, per module.
            </p>
          </Feature>
          <Feature name="Delete account">
            <p>
              Type-to-confirm, and deletion is <em>scheduled</em> with a
              purge date rather than instant — a cooling-off window during
              which you can cancel from the same screen. After the purge
              date, it's gone server-side.
            </p>
          </Feature>
        </FeatureList>
        <Callout>
          Finance has its own CSV exports (transactions, budgets, net-worth)
          under Finance → Export — spreadsheet-shaped, no lock-in.
        </Callout>
      </Section>
    </>
  );
}
