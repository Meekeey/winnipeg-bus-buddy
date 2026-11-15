"use client";
import { ReactNode, useState } from "react";
import { Panel } from "./pixel/Panel";

type Props = {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  size?: "half" | "tall" | "full"; // how much of the phone screen it covers
};

// On phones: a bottom sheet you can fold down to peek at the map.
// On laptops: a panel docked on the left side.
export function Sheet({ title, actions, children, size = "half" }: Props) {
  const [folded, setFolded] = useState(false);
  return (
    <div className={`sheet sheet-${size} ${folded ? "sheet-folded" : ""}`}>
      <button
        type="button"
        className="sheet-handle"
        onClick={() => setFolded(!folded)}
        aria-label={folded ? "Open panel" : "Fold panel down to see the map"}
      >
        <span className="sheet-handle-bar" />
      </button>
      <Panel title={title} actions={actions}>
        {children}
      </Panel>
    </div>
  );
}
