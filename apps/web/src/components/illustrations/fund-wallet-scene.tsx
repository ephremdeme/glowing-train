export function FundWalletScene({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 740 360"
      className={className}
      role="img"
      aria-label="Sender funds transfer from personal wallet"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="wallet-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1d2f70" />
          <stop offset="100%" stopColor="#121b44" />
        </linearGradient>
        <linearGradient id="wallet-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1bd9ff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#49f0b6" stopOpacity="0.12" />
        </linearGradient>
      </defs>

      <rect x="8" y="8" width="724" height="344" rx="36" fill="url(#wallet-bg)" stroke="#3550a8" strokeOpacity="0.45" />
      <circle cx="620" cy="80" r="55" fill="#2ce4ff" fillOpacity="0.14" />
      <circle cx="130" cy="288" r="68" fill="#99ff58" fillOpacity="0.1" />

      <rect x="52" y="82" width="242" height="168" rx="24" fill="url(#wallet-card)" stroke="#79bdf4" strokeOpacity="0.4" />
      <rect x="76" y="108" width="194" height="44" rx="12" fill="#0d173f" stroke="#3a5bbf" strokeOpacity="0.55" />
      <rect x="76" y="168" width="128" height="24" rx="10" fill="#0d173f" stroke="#3a5bbf" strokeOpacity="0.55" />
      <rect x="212" y="168" width="58" height="24" rx="10" fill="#1ecfff" fillOpacity="0.2" />
      <text x="88" y="136" fill="#bde9ff" fontSize="17" fontWeight="700">Sender wallet</text>
      <text x="88" y="185" fill="#7db7d7" fontSize="12">USDC/USDT balance</text>

      <path d="M312 166H458" stroke="#4de8ff" strokeWidth="7" strokeLinecap="round" />
      <path d="M443 149L468 166L443 183" fill="none" stroke="#4de8ff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />

      <rect x="478" y="104" width="206" height="124" rx="22" fill="#0f1a46" stroke="#5f80f7" strokeOpacity="0.55" />
      <rect x="500" y="128" width="162" height="28" rx="10" fill="#111f52" stroke="#5674d2" strokeOpacity="0.6" />
      <rect x="500" y="168" width="118" height="18" rx="8" fill="#2df2b3" fillOpacity="0.2" />
      <text x="512" y="146" fill="#cde5ff" fontSize="13" fontWeight="700">Offshore deposit address</text>
      <text x="512" y="182" fill="#9fd5bc" fontSize="11">Funds route monitored offshore</text>

      <text x="54" y="292" fill="#9dc3f8" fontSize="14" fontWeight="700">Non-custodial: you keep control of keys.</text>
    </svg>
  );
}
