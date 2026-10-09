// Renders the styling engine's spans: one <span class="r-<role> ..."> per styled run. Colours come
// from the theme in styles.css. With ?styles in the URL, hovering a run shows its roles.
import type { Span } from "../styling";

const debug = typeof location !== "undefined" && new URLSearchParams(location.search).has("styles");

export function StyledText({ spans }: { spans: Span[] }) {
  return <>{spans.map((s, i) => s.roles.length || debug
    ? <span key={i} className={s.roles.map((r) => `r-${r}`).join(" ") || undefined}
            title={debug ? s.roles.join(" ") || "(no role)" : undefined}>{s.text}</span>
    : s.text)}</>;
}
