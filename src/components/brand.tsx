import { cn } from "@/lib/utils";

/**
 * AirClean brand mark.
 *
 * A droplet cut by an air current, drawn from the live theme tokens so it
 * follows the user's accent hue instead of hard-coding a colour. The sheen and
 * the current lines animate on their own; `animated={false}` freezes them for
 * dense surfaces such as table rows.
 */
export function AirCleanMark({
  className,
  animated = true,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label="AirClean" className={cn("size-8", className)}>
      <defs>
        <linearGradient id="airclean-drop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--primary-glow)" />
          <stop offset="100%" stopColor="var(--primary)" />
        </linearGradient>
      </defs>

      <rect x="1" y="1" width="46" height="46" rx="13" fill="url(#airclean-drop)" />

      {/* Droplet */}
      <path
        d="M24 11c5.4 6.1 8.6 10.4 8.6 14.6A8.6 8.6 0 0 1 24 34.2a8.6 8.6 0 0 1-8.6-8.6c0-4.2 3.2-8.5 8.6-14.6Z"
        fill="var(--primary-foreground)"
        opacity="0.94"
      />
      {/* Sheen */}
      <path
        d="M21 24.5c0-2.6 1.2-4.9 3-6.6"
        stroke="url(#airclean-drop)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        className={animated ? "animate-sheen" : undefined}
      />
      {/* Air currents */}
      <g
        stroke="var(--primary-foreground)"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.85"
        className={animated ? "animate-drift" : undefined}
      >
        <path d="M6 17h7" />
        <path d="M8 23h5" />
        <path d="M35 31h7" />
        <path d="M35 37h5" />
      </g>
    </svg>
  );
}

/** Mark plus wordmark, used on the landing page, in the sidebar and in menus. */
export function AirCleanLogo({
  className,
  markClassName,
  showWord = true,
}: {
  className?: string;
  markClassName?: string;
  showWord?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <AirCleanMark className={cn("size-8 drop-shadow-sm", markClassName)} />
      {showWord && (
        <span className="font-display text-base font-semibold tracking-tight">
          Air<span className="text-gradient-brand">Clean</span>
        </span>
      )}
    </span>
  );
}
