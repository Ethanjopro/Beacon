/** Beacon's mark: a lighthouse lamp throwing two beams. Inline SVG, no network. */
export function BeaconMark({ size = 24, glow = false, className = "" }: { size?: number; glow?: boolean; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
      style={glow ? { filter: "drop-shadow(0 0 6px rgba(255,200,97,0.65))" } : undefined}
    >
      <path d="M16 9 L2 4.5 L2 13.5 Z" fill="var(--color-lamp)" opacity="0.35" />
      <path d="M16 9 L30 4.5 L30 13.5 Z" fill="var(--color-lamp)" opacity="0.35" />
      <circle cx="16" cy="9" r="3.6" fill="var(--color-lamp)" />
      <path d="M12.5 14 h7 l1.6 15 h-10.2 Z" fill="currentColor" opacity="0.92" />
      <rect x="11.6" y="12.2" width="8.8" height="2.2" rx="1.1" fill="currentColor" />
      <rect x="13.2" y="19" width="5.6" height="1.6" rx="0.8" fill="var(--color-harbor-900)" opacity="0.55" />
    </svg>
  );
}
