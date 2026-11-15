import type { ReactNode } from "react";
import { IconName, PixelIcon } from "./pixel/PixelIcon";

export type QuestStep = {
  icon: IconName;
  time?: string; // e.g. "12:40 PM"
  title: ReactNode;
  detail?: ReactNode;
  warn?: boolean; // warning colour (for example a long, cold wait)
  done?: boolean; // already passed
};

// A trip drawn as a quest path: a dotted trail with a marker for each step.
export function QuestPath({ steps }: { steps: QuestStep[] }) {
  return (
    <ol className="quest-path">
      {steps.map((step, index) => (
        <li
          key={index}
          className={`quest-step ${step.warn ? "quest-step-warn" : ""} ${step.done ? "quest-step-done" : ""}`}
        >
          <span className="quest-marker">
            <PixelIcon name={step.icon} size={16} />
          </span>
          <span className="quest-time">{step.time ?? ""}</span>
          <span className="quest-text">
            <span className="quest-title">{step.title}</span>
            {step.detail && <span className="quest-detail">{step.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
