import { MARK_PATHS, MARK_TRANSFORM, MARK_VIEWBOX } from "./mark-data";

/** The traced mark as inline SVG, in `currentColor`. */
export function MarkPaths() {
  return (
    <g transform={MARK_TRANSFORM} fill="currentColor">
      {MARK_PATHS.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
  );
}

export function Mark({ className, title = "V Barbersz" }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox={MARK_VIEWBOX} role="img" aria-label={title}>
      <MarkPaths />
    </svg>
  );
}
