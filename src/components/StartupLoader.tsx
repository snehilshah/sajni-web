const REACT_STARTUP_DELAY_MS = -performance.now();

export function StartupMark() {
  return (
    <svg
      className="startup-loader__mark"
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ animationDelay: `${REACT_STARTUP_DELAY_MS}ms` }}
    >
      <path d="M32 6C14 18 9 40 22 53C29 60 40 57 47 48C58 33 51 15 32 6Z" fill="currentColor" />
      <path d="M34 17C25 29 25 43 34 50" fill="none" stroke="var(--startup-mark-detail)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="20" cy="31" r="2.5" fill="var(--startup-mark-detail)" />
      <circle cx="44" cy="36" r="2.5" fill="var(--startup-mark-detail)" />
    </svg>
  );
}

export default function StartupLoader() {
  return (
    <div className="startup-loader" role="status" aria-label="Opening Sajni">
      <StartupMark />
    </div>
  );
}
