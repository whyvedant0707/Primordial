import { criteria, guidanceUrl } from "./wcag";

export default function WcagGuidance({ tags }: { tags: string[] }) {
  const mapped = criteria(tags);
  return <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
    {mapped.length ? mapped.map(criterion => {
      const url = guidanceUrl(criterion);
      return url ? <a key={criterion} href={url} target="_blank" rel="noreferrer" className="text-brand underline">
        W3C {criterion}<span className="sr-only"> guidance (opens in new tab)</span>
      </a> : <span key={criterion}>WCAG {criterion}</span>;
    }) : <span>No mapped success criterion</span>}
  </span>;
}
