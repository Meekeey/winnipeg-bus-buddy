"use client";
import { dataSource } from "@/lib/dataSource";
import { usePolling } from "@/hooks/usePolling";
import { useApp } from "./AppState";
import { IconButton } from "./pixel/Buttons";
import { PixelIcon } from "./pixel/PixelIcon";

// The title bar, the light/dark toggle, and the warning banners.
export function TopBar() {
  const { theme, toggleTheme } = useApp();
  // Check the service status first: an Emergency Service Plan means
  // times may be unreliable.
  const status = usePolling("status", () => dataSource.getStatus());

  return (
    <header className="topbar">
      <div className="topbar-plank">
        <span className="topbar-logo" aria-hidden="true">
          <PixelIcon name="bus" size={28} />
        </span>
        <h1 className="topbar-title">BUS BUDDY</h1>
        {dataSource.isDemo && <span className="tag tag-demo">DEMO DATA</span>}
        <IconButton
          icon={theme === "dark" ? "sun" : "moon"}
          label={theme === "dark" ? "Switch to daytime forest (light mode)" : "Switch to night camp (dark mode)"}
          onClick={toggleTheme}
        />
      </div>
      <div className="grass grass-under" aria-hidden="true" />
      {status.data?.isEmergency && (
        <div className="banner banner-warning" role="alert">
          <PixelIcon name="warning" size={18} />
          <span>
            Emergency Service Plan is active. Bus times may be unreliable.
            {status.data.message ? ` (${status.data.message})` : ""}
          </span>
        </div>
      )}
    </header>
  );
}
