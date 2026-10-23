type Artwork = "connect" | "continuity" | "access";

export function LoginArt({ kind }: { kind: Artwork }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 384 280"
      fill="none"
      className="mx-auto w-full max-w-sm text-link"
    >
      {kind === "connect" ? (
        <ConnectedGrid />
      ) : kind === "continuity" ? (
        <ContinuityOrbit />
      ) : (
        <AccountNetwork />
      )}
    </svg>
  );
}

function ConnectedGrid() {
  return (
    <>
      <rect x="36" y="28" width="312" height="224" rx="16" className="stroke-border" />
      {Array.from({ length: 12 }, (_, row) =>
        Array.from({ length: 18 }, (_, column) => (
          <rect
            key={`${row}-${column}`}
            x={50 + column * 16}
            y={42 + row * 17}
            width="8"
            height="8"
            rx="2"
            fill="currentColor"
            opacity={0.12 + ((row + column) % 5) * 0.07}
          />
        )),
      )}
      <g className="loom-login-pulse">
        <rect
          x="126"
          y="108"
          width="132"
          height="64"
          rx="12"
          className="fill-background stroke-link/35"
        />
        <rect x="134" y="116" width="116" height="48" rx="8" className="fill-accent/25" />
        <path
          d="M155 129v21h12m11-21v21h12m10-21v21m11-21v21m-11-21 6 10 5-10m11 21v-21l7 10 7-10v21"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <path d="M38 140H126m132 0h88" className="loom-login-trace stroke-link/65" strokeWidth="2" />
      <circle cx="37" cy="140" r="3" fill="currentColor" />
      <circle cx="347" cy="140" r="3" fill="currentColor" />
    </>
  );
}

function ContinuityOrbit() {
  return (
    <>
      <ellipse cx="192" cy="140" rx="145" ry="76" className="stroke-link/15" />
      <ellipse
        cx="192"
        cy="140"
        rx="145"
        ry="76"
        transform="rotate(60 192 140)"
        className="stroke-link/15"
      />
      <ellipse
        cx="192"
        cy="140"
        rx="145"
        ry="76"
        transform="rotate(120 192 140)"
        className="stroke-link/15"
      />
      <g className="loom-login-orbit">
        <circle cx="67" cy="100" r="6" className="fill-link" />
        <circle cx="306" cy="185" r="4" className="fill-link/60" />
        <circle cx="164" cy="26" r="3" className="fill-link/45" />
      </g>
      <g className="loom-login-orbit loom-login-orbit-reverse">
        <circle cx="320" cy="91" r="4" className="fill-success/80" />
        <circle cx="111" cy="221" r="5" className="fill-link/55" />
      </g>
      <circle cx="192" cy="140" r="43" className="loom-login-pulse fill-accent/25 stroke-link/30" />
      <path
        d="m169 140 23-15 23 15-23 15-23-15Zm0-11 23-15 23 15m-46 22 23 15 23-15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function AccountNetwork() {
  return (
    <>
      <path
        d="M70 76h72l50 64m122-64h-72l-50 64M70 204h72l50-64m122 64h-72l-50-64"
        className="stroke-link/20"
      />
      <path
        d="M70 76h72l50 64m122 64h-72l-50-64"
        className="loom-login-trace stroke-link/75"
        strokeWidth="2"
      />
      {[
        [70, 76],
        [314, 76],
        [70, 204],
        [314, 204],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect
            x={x! - 17}
            y={y! - 17}
            width="34"
            height="34"
            rx="9"
            className="fill-card stroke-link/25"
          />
          <circle cx={x} cy={y} r="4" className="fill-link/70" />
        </g>
      ))}
      <rect
        x="145"
        y="91"
        width="94"
        height="98"
        rx="22"
        className="fill-background stroke-link/30"
      />
      <circle cx="192" cy="126" r="12" className="stroke-link" strokeWidth="2" />
      <path
        d="M172 162v-3a20 20 0 0 1 40 0v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <g className="loom-login-pulse">
        <circle cx="235" cy="184" r="16" className="fill-background stroke-success/40" />
        <path
          d="m228 184 5 5 9-10"
          className="stroke-success"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </>
  );
}
