"use client";

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
  return (
    <>
      <aside className={`sidebar${open ? " open" : ""}`} aria-label="主导航">
        <div className="sidebar-label">工作区</div>
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
            <strong>本地渲染</strong>
            <span>Remotion + FFmpeg · 视频保存在 output/</span>
          </div>
        </div>
      </aside>
      {open ? <button type="button" className="sidebar-scrim" aria-label="关闭导航" onClick={onClose} /> : null}
    </>
  );
}