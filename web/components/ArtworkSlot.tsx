// The luna moth's place. Nesthallow supplies the illustrated artwork; until then this is a
// plain placeholder. To swap it in, drop her file at public/art/luna-moth.svg (or .png) and
// change ARTWORK_SRC below. Nothing else references the artwork, so it stays replaceable.

const ARTWORK_SRC: string | null = null; // e.g. "/art/luna-moth.svg"

export function ArtworkSlot({ label = "Nesthallow" }: { label?: string }) {
  if (ARTWORK_SRC) {
    return <img className="artwork-slot" src={ARTWORK_SRC} alt={label} />;
  }
  return (
    <svg className="artwork-slot" viewBox="0 0 72 72" role="img" aria-label={`${label} (artwork to come)`}>
      <circle cx="36" cy="36" r="34" fill="none" stroke="#c9a94e" strokeWidth="2" strokeDasharray="5 5" />
      <ellipse cx="24" cy="32" rx="12" ry="16" fill="#8fb996" />
      <ellipse cx="48" cy="32" rx="12" ry="16" fill="#8fb996" />
      <ellipse cx="36" cy="38" rx="4" ry="14" fill="#7a4b2a" />
    </svg>
  );
}
