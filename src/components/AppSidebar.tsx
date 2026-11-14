"use client";

import { useEffect, useRef } from "react";
import type { WorkbenchView } from "./Workbench";

export type { WorkbenchView };

const icons: Record<WorkbenchView, React.ReactNode> = {
  generate: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 9.5v5l4-2.5-4-2.5Z" fill="currentColor" />
    </svg>
  ),
  merge: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h6v6H4zM14 12h6v6h-6z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 9h2.5a1.5 1.5 0 0 1 1.5 1.5V12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  library: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="7" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="4" width="8" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
};

const items: { id: WorkbenchView; label: string; hint: string }[] = [
  { id: "generate", label: "生成视频", hint: "写文案、配音、导出" },
  { id: "merge", label: "视频拼接", hint: "排序并合成成片" },
  { id: "library", label: "素材库", hint: "管理全部成片" },
];

type AppSidebarProps = {
  view: WorkbenchView;
  onNavigate: (view: WorkbenchView) => void;
  open: boolean;
  onClose: () => void;
};

/** 左侧主导航：生成视频 / 视频拼接 / 素材库 */
export default function AppSidebar({ view, onNavigate, open, onClose }: AppSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open || !window.matchMedia("(max-width: 1080px)").matches) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarRef.current?.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const buttons = [...(sidebarRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])].filter((element) => element.getClientRects().length);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return (
    <>
      <aside id="main-navigation" ref={sidebarRef} className={`sidebar${open ? " open" : ""}`} aria-label="主导航">
        <div className="sidebar-heading"><div className="sidebar-label">创作工作区</div><button type="button" className="sidebar-close" aria-label="收起导航" onClick={onClose}>关闭</button></div>
        <nav className="sidebar-nav">
          {items.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  onNavigate(item.id);
                  onClose();
                }}
              >
                <span className="nav-icon">{icons[item.id]}</span>
                <span className="nav-text">
                  <span className="nav-title">{item.label}</span>
                  <span className="nav-hint">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-note">
            <strong><span className="local-status-dot" aria-hidden="true" />本地工作区</strong>
            <span>草稿保存在当前浏览器<br />成片可在素材库查看与下载</span>
          </div>
        </div>
      </aside>
      {open ? <button type="button" className="sidebar-scrim" aria-label="关闭导航" onClick={onClose} /> : null}
    </>
  );
}
