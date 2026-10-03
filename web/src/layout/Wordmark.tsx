export function Wordmark({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <a
      className="wordmark"
      href="/"
      onClick={(event) => {
        if (!onNavigate) return;
        event.preventDefault();
        onNavigate();
      }}
    >
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#0f6e66" />
        <rect x="7" y="6" width="18" height="20" rx="2" fill="#f7f3ea" />
        <path
          d="M11 12h10M11 16h10M11 20h6"
          stroke="#0f6e66"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <span>FormGuide</span>
    </a>
  );
}
