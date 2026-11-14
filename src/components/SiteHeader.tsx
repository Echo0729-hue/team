"use client";

import type { ReactNode } from "react";
import type { WorkbenchView } from "./Workbench";

type SiteHeaderProps = {
  view: WorkbenchView;
  projectName: string;
  status?: ReactNode;
  actions?: ReactNode;
  onOpenNav: () => void;
};

const MarkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M7 4.6v14.8L20 12 7 4.6Z" fill="currentColor" />
  </svg>
);

const MenuIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

/** 顶部导航：产品名 + 当前项目 + 状态 + 主要操作，高度 64px */
export default function SiteHeader({ view, projectName, status, actions, onOpenNav }: SiteHeaderProps) {
  return (
    <header className="topnav">
      <button type="button" className="nav-toggle" aria-label="打开导航" aria-controls="main-navigation" onClick={onOpenNav}>
        <MenuIcon />
      </button>

      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <MarkIcon />
        </span>
        <span className="brand-name">知映视频</span>
      </div>

      <span className="nav-divider" aria-hidden="true" />

      <div className="project">
        <span className="project-label">
          {view === "generate" ? "当前项目" : view === "merge" ? "拼接项目" : "素材库"}
        </span>
        <span className="project-name" title={projectName}>
          {projectName}
        </span>
      </div>

      <div className="topnav-status">{status}</div>
      <div className="topnav-actions">{actions}</div>
    </header>
  );
}
