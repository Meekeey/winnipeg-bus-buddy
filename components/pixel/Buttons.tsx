import type { ReactNode } from "react";
import { IconName, PixelIcon } from "./PixelIcon";

type IconButtonProps = {
  icon: IconName;
  label: string; // read by screen readers and shown as a tooltip
  onClick?: () => void;
  active?: boolean;
  rotate?: number;
  disabled?: boolean;
};

// A rounded-square framed icon button (at least 44px so it's easy to tap).
export function IconButton({ icon, label, onClick, active, rotate, disabled }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? "icon-btn-active" : ""}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
    >
      <PixelIcon name={icon} size={22} rotate={rotate} />
    </button>
  );
}

type BigButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  kind?: "gold" | "wood" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
};

// A chunky text button.
export function BigButton({ children, onClick, kind = "gold", disabled, type = "button" }: BigButtonProps) {
  return (
    <button type={type} className={`big-btn big-btn-${kind}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

// Friendly loading and error messages.
export function LoadingNote({ text = "Loading…" }: { text?: string }) {
  return (
    <p className="note note-loading" role="status">
      <span className="loading-bus" aria-hidden="true">
        <PixelIcon name="bus" size={22} />
      </span>
      {text}
    </p>
  );
}

export function ErrorNote({ text }: { text: string }) {
  return (
    <p className="note note-error" role="alert">
      <PixelIcon name="warning" size={18} />
      <span>{text}</span>
    </p>
  );
}
