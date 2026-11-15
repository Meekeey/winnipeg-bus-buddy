import { getStatusLabel } from "@/lib/time";

type Props = { scheduled: number; estimated: number; cancelled?: boolean };

// A little game-style tag: EARLY / ON TIME / LATE / SCHEDULED.
export function StatusTag({ scheduled, estimated, cancelled }: Props) {
  const label = getStatusLabel(scheduled, estimated, cancelled);
  const className = "tag tag-" + label.toLowerCase().replace(" ", "-");
  return <span className={className}>{label.toUpperCase()}</span>;
}
