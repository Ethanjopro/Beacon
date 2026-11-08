/** Magenta-Guard's own mark: a protective shield built from an M and a live signal. */
export function MagentaGuardLogo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" className={className}>
      <path d="M24 3.5 42 10v12.2C42 33 34.8 41 24 45 13.2 41 6 33 6 22.2V10L24 3.5Z" fill="currentColor" opacity=".18" />
      <path d="M24 3.5 42 10v12.2C42 33 34.8 41 24 45 13.2 41 6 33 6 22.2V10L24 3.5Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="m13.5 29.5 3.2-13.2 7.3 8 7.3-8 3.2 13.2" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 33h11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="36.2" cy="12.2" r="3.2" fill="#83efaa" stroke="#17141b" strokeWidth="1.5" />
    </svg>
  );
}
