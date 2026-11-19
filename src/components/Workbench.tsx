"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { EditorDraft } from "@/lib/projectDraft";
import { DEMO_MERGE_KEY, DEMO_SELECTION_KEY, DEMO_VIEW_KEY } from "@/demo/projects";
import AppSidebar from "./AppSidebar";
import GeneratorClient from "./GeneratorClient";
import LibraryPage from "./LibraryPage";
import MergeWorkspace from "./MergeWorkspace";

export type WorkbenchView = "generate" | "merge" | "library";

const STORAGE_KEY = "codevideo:view";

const isView = (value: string | null): value is WorkbenchView =>
  value === "generate" || value === "merge" || value === "library";

/**
 * 应用外壳：左侧主导航 + 各功能页。
 * 当前页面记在 hash 与 localStorage，刷新后停留在同一页。
 */
export default function Workbench({ demoDraft, banner, playbackPaused = false }: { demoDraft?: { key: string; initial: EditorDraft; fresh?: boolean }; banner?: ReactNode; playbackPaused?: boolean }) {
  const viewKey = demoDraft ? DEMO_VIEW_KEY : STORAGE_KEY;
  const [view, setView] = useState<WorkbenchView>("generate");
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1081px)");
    const closeOnDesktop = () => { if (desktop.matches) setNavOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    let next: WorkbenchView | null = isView(hash) ? hash : null;
    if (!next) {
      try {
        const stored = window.localStorage.getItem(viewKey);
        if (isView(stored)) {
          next = stored;
        }
      } catch {
        // 隐私模式下 localStorage 不可用
      }
    }
    if (next) {
      setView(next);
    }
    window.history.replaceState(null, "", `#${next ?? "generate"}`);
    const syncLocation = () => {
      const hash = window.location.hash.slice(1);
      const view = isView(hash) ? hash : "generate";
      setView(view);
      setNavOpen(false);
      try { window.localStorage.setItem(viewKey, view); } catch {}
    };
    window.addEventListener("hashchange", syncLocation);
    window.addEventListener("popstate", syncLocation);
    return () => {
      window.removeEventListener("hashchange", syncLocation);
      window.removeEventListener("popstate", syncLocation);
    };
  }, [viewKey]);

  const navigate = useCallback((next: WorkbenchView) => {
    setView(next);
    setNavOpen(false);
    try {
      window.localStorage.setItem(viewKey, next);
    } catch {
      // 忽略写入失败
    }
    if (window.location.hash !== `#${next}`) {
      window.history.pushState(null, "", `#${next}`);
    }
  }, [viewKey]);

  return (
    <div className="app">
      <AppSidebar view={view} onNavigate={navigate} open={navOpen} onClose={() => setNavOpen(false)} demo={!!demoDraft} />

      <div className="app-main" inert={navOpen}>
        {banner}
        <div hidden={view !== "generate"}>
          <GeneratorClient active={view === "generate" && !playbackPaused} onNavigate={navigate} onOpenNav={() => setNavOpen(true)} demoDraft={demoDraft} />
        </div>
        <div hidden={view !== "merge"}>
          <MergeWorkspace active={view === "merge" && !playbackPaused} onNavigate={navigate} onOpenNav={() => setNavOpen(true)} storageKeys={demoDraft ? { selection: DEMO_SELECTION_KEY, project: DEMO_MERGE_KEY } : undefined} />
        </div>
        {view === "library" ? (
          <LibraryPage onNavigate={navigate} onOpenNav={() => setNavOpen(true)} selectionKey={demoDraft ? DEMO_SELECTION_KEY : undefined} />
        ) : null}
      </div>
    </div>
  );
}
