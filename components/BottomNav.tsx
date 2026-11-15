"use client";
import { Tab, useApp } from "./AppState";
import { IconName, PixelIcon } from "./pixel/PixelIcon";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "map", label: "Map", icon: "pin" },
  { id: "track", label: "Track", icon: "bus" },
  { id: "trip", label: "Trip", icon: "signpost" },
];

export function BottomNav() {
  const { tab, setTab, tracked } = useApp();
  return (
    <nav className="nav" aria-label="Main">
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`nav-btn ${tab === item.id ? "nav-btn-active" : ""}`}
          onClick={() => setTab(item.id)}
          aria-current={tab === item.id ? "page" : undefined}
        >
          <PixelIcon name={item.icon} size={24} />
          <span>{item.label}</span>
          {item.id === "track" && tracked && <span className="count-badge nav-badge">1</span>}
        </button>
      ))}
    </nav>
  );
}
