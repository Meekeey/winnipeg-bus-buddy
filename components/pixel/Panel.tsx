import type { ReactNode } from "react";
import { Rivet, Vine } from "./Decor";

type Props = {
  title?: ReactNode;
  actions?: ReactNode; // buttons on the right of the title
  children: ReactNode;
  className?: string;
  plain?: boolean; // no grass, straps or rivets (for small cards)
};

// A chunky wooden panel with a grassy top, gold straps and rivets.
export function Panel({ title, actions, children, className = "", plain = false }: Props) {
  return (
    <section className={`panel ${plain ? "panel-plain" : ""} ${className}`}>
      {!plain && (
        <>
          <div className="grass" aria-hidden="true" />
          <Vine className="vine-left" />
          <Vine className="vine-right" flip />
        </>
      )}
      {(title || actions) && (
        <header className="panel-header">
          <h2 className="panel-title">{title}</h2>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className="panel-body">{children}</div>
      {!plain && (
        <div className="panel-rivets" aria-hidden="true">
          <Rivet />
          <Rivet />
        </div>
      )}
    </section>
  );
}
