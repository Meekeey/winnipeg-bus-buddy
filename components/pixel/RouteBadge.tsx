import type { RouteInfo } from "@/lib/staticData";

type Props = {
  routeId: string;
  route?: RouteInfo; // gives the badge its route colour
  size?: "small" | "medium" | "large";
  count?: number; // small number badge, like an item stack
};

// A route number inside a round "item slot" frame.
export function RouteBadge({ routeId, route, size = "medium", count }: Props) {
  const longText = routeId.length > 3;
  return (
    <span className={`slot slot-${size}`}>
      <span
        className={`slot-item ${longText ? "slot-item-long" : ""}`}
        style={route ? { background: route.color, color: route.textColor } : undefined}
      >
        {routeId}
      </span>
      {count !== undefined && <span className="count-badge">{count}</span>}
    </span>
  );
}
