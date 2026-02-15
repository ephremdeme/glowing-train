export function EtbPayoutScene({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 740 360"
      className={className}
      role="img"
      aria-label="Recipient receives Ethiopian birr bank payout"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="payout-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1a255f" />
          <stop offset="100%" stopColor="#10183a" />
        </linearGradient>
      </defs>

      <rect x="8" y="8" width="724" height="344" rx="36" fill="url(#payout-bg)" stroke="#3a4f97" strokeOpacity="0.45" />

      <rect x="52" y="92" width="236" height="154" rx="20" fill="#111d4f" stroke="#6384ff" strokeOpacity="0.58" />
      <text x="76" y="126" fill="#cce0ff" fontSize="17" fontWeight="700">Offshore settlement</text>
      <rect x="74" y="142" width="188" height="22" rx="9" fill="#17275d" stroke="#6077d5" strokeOpacity="0.6" />
      <rect x="74" y="174" width="146" height="20" rx="9" fill="#2de9ba" fillOpacity="0.16" />
      <text x="76" y="228" fill="#9eb5ef" fontSize="12">Converts and settles through legal rails</text>

      <path d="M304 168H446" stroke="#ffd24a" strokeWidth="7" strokeLinecap="round" />
      <path d="M429 150L454 168L429 186" fill="none" stroke="#ffd24a" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />

      <rect x="470" y="76" width="214" height="188" rx="24" fill="#0f1c47" stroke="#6ef2a6" strokeOpacity="0.6" />
      <rect x="492" y="104" width="170" height="44" rx="12" fill="#132557" stroke="#60be8b" strokeOpacity="0.58" />
      <text x="506" y="132" fill="#dbffe8" fontSize="15" fontWeight="700">ETB bank payout</text>
      <rect x="492" y="160" width="124" height="20" rx="9" fill="#2de9ba" fillOpacity="0.2" />
      <rect x="492" y="190" width="142" height="20" rx="9" fill="#2de9ba" fillOpacity="0.2" />
      <text x="492" y="238" fill="#b7f4d2" fontSize="12">Recipient side remains crypto-free</text>

      <g opacity="0.75">
        <path d="M580 292L596 308L564 308Z" fill="#f8ce45" />
        <path d="M598 292L614 308L582 308Z" fill="#2ce4ff" />
        <path d="M616 292L632 308L600 308Z" fill="#98ff62" />
      </g>
    </svg>
  );
}
