type Props = { size?: number; className?: string };

export default function MeridianMark({ size = 36, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="m-bg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4338ca" />
          <stop offset="100%" stopColor="#0e7490" />
        </linearGradient>
        <radialGradient id="m-ping" cx="61%" cy="25%" r="25%">
          <stop offset="0%" stopColor="white" stopOpacity="0.35" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <clipPath id="m-clip">
          <rect width="36" height="36" rx="10" />
        </clipPath>
      </defs>

      {/* Background */}
      <rect width="36" height="36" rx="10" fill="url(#m-bg)" />

      <g clipPath="url(#m-clip)">
        {/* Radar arcs — three scan rings emanating from source */}
        <path d="M 6,11 A 7,7 0 0,1 6,25"
          stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.28" />
        <path d="M 6,5 A 13,13 0 0,1 6,31"
          stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.50" />
        <path d="M 6,-1 A 19,19 0 0,1 6,37"
          stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.72" />

        {/* Glow at found target */}
        <circle cx="22" cy="9" r="6" fill="url(#m-ping)" />

        {/* Target found — bright dot on outer ring */}
        <circle cx="22" cy="9" r="3.5" fill="white" opacity="0.18" />
        <circle cx="22" cy="9" r="2.25" fill="white" opacity="0.55" />
        <circle cx="22" cy="9" r="1.5"  fill="white" />

        {/* Source — play triangle (video origin point) */}
        <path d="M 4,15.5 L 4,20.5 L 9,18 Z" fill="white" opacity="0.90" />
      </g>
    </svg>
  );
}
