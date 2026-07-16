import { useAppNav } from "./appNav";

/**
 * The Vault mark, shown at the left of each page's title as a persistent brand.
 * A number badge appears when something needs attention; tapping jumps there.
 */
export function AppLogo() {
  const { reminderCount, onLogoClick } = useAppNav();
  const hasNotice = reminderCount > 0;
  return (
    <button
      type="button"
      onClick={hasNotice ? onLogoClick : undefined}
      aria-label="Vault"
      className={"relative flex shrink-0 " + (hasNotice ? "active:opacity-70" : "cursor-default")}
    >
      <svg viewBox="0 0 512 512" className="h-7 w-7" aria-hidden>
        <defs>
          <linearGradient id="vaultV" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fb7185" />
            <stop offset="1" stopColor="#e11d48" />
          </linearGradient>
        </defs>
        <rect width="512" height="512" rx="112" fill="#1e293b" />
        <path
          d="M160 150 L256 372 L352 150"
          fill="none"
          stroke="url(#vaultV)"
          strokeWidth="46"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="256" cy="150" r="26" fill="#34d399" />
      </svg>
      {reminderCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-900 ring-2 ring-slate-900">
          {reminderCount}
        </span>
      )}
    </button>
  );
}
