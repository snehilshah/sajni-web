import { Section, Callout, Code, RefTable } from './primitives';

export const connectedAppsMeta = {
  id: 'connected-apps',
  label: 'Connected apps',
  title: 'Connected apps',
  blurb: 'Use your Sajni from ChatGPT, Gemini or Claude: they read and change the same data the in-app Sajni does.',
  sections: [
    { id: 'connect', label: 'Connect an app' },
    { id: 'access', label: 'What it can see and do' },
    { id: 'remove', label: 'Remove an app' },
  ],
};

export default function ConnectedAppsDoc() {
  return (
    <>
      <Section id="connect" title="Connect an App">
        <p>
          Sajni speaks MCP, the standard way assistants plug into other apps.
          Any assistant that takes a custom MCP server can connect with one
          address, also shown in Settings → Connected apps. Menu names move
          around as these apps update; look for “custom connector” or “MCP”.
        </p>
        <p><Code>https://www.ohmysajni.com/mcp</Code></p>
        <RefTable
          head={['app', 'where to add it']}
          rows={[
            ['ChatGPT', 'Settings → Apps: turn on Developer mode under Advanced, then create an app with this address and OAuth sign-in. Needs a paid plan.'],
            ['Gemini', 'Settings → Connected apps → add a custom app with this address. Personal Google accounts only.'],
            ['Claude', 'Settings → Connectors → add a custom connector with this address.'],
          ]}
        />
        <p>
          The app opens a Sajni page asking <em>Connect ChatGPT?</em>, showing
          the app’s web address so a look-alike stands out. Sign in if asked,
          choose whether it may make changes, and press Connect. You land back
          in the app, ready to ask.
        </p>
        <p>
          Example: in ChatGPT, “Using Sajni, what are my pending tasks this
          week, and which should I do first?” reads your open tasks, week tasks
          and month goals, then ranks them the same way the in-app Sajni does.
        </p>
      </Section>

      <Section id="access" title="What It Can See and Do">
        <p>
          A connected app reads everything the in-app Sajni reads: tasks,
          habits, journal, plans, notes, memos, media, bookmarks, finance and
          projects. With <strong>Allow changes</strong> on, it can also add and
          edit them: “add milk to my tasks for tomorrow”, “log ₹240 lunch on
          cash”. With it off, the app only reads; ask it to change something
          and it says the connection is read-only.
        </p>
        <p>
          Your theme and avatar stay in Sajni. Each app runs on its own model and
          its own account, so its answers and costs are its own.
        </p>
        <Callout tone="why">
          What a connected app sees is also sent to that app’s company. Keep
          changes off for an app you only want to ask questions, and never
          paste text from a stranger into a chat that can change your data:
          a hidden instruction in it could ask the app to edit things.
        </Callout>
      </Section>

      <Section id="remove" title="Remove an App">
        <p>
          Settings → Connected apps lists each app with its address, whether
          it can make changes and when it last used Sajni. Remove signs it out
          at once; its next request fails until you connect it again. To
          switch an app between read-only and changes, connect it again and
          flip <strong>Allow changes</strong>.
        </p>
      </Section>
    </>
  );
}
