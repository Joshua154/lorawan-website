"use client";

import type { ReactNode } from "react";

type CollapsibleSectionProps = {
  children: ReactNode;
  collapsed: boolean;
  title: ReactNode;
  titleAccessory?: ReactNode;
  onToggle: () => void;
};

export function CollapsibleSection({
  children,
  collapsed,
  title,
  titleAccessory,
  onToggle,
}: CollapsibleSectionProps) {
  return (
    <section className="panel-section">
      <div
        className="section-title-row"
        onClick={onToggle}
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {title}
          {titleAccessory}
        </div>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{collapsed ? "▼" : "▲"}</span>
      </div>
      {!collapsed ? <div style={{ marginTop: "0.85rem" }}>{children}</div> : null}
    </section>
  );
}