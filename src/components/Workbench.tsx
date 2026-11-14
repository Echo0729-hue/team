"use client";

import { useCallback, useEffect, useState } from "react";
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
export default function Workbench() {
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
        const stored = window.localStorage.getItem(STORAGE_KEY);
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
      try { window.localStorage.setItem(STORAGE_KEY, view); } catch {}
    };
    window.addEventListener("hashchange", syncLocation);
    window.addEventListener("popstate", syncLocation);
    return () => {
      window.removeEventListener("hashchange", syncLocation);
      window.removeEventListener("popstate", syncLocation);
    };
  }, []);

  const navigate = useCallback((next: WorkbenchView) => {
    setView(next);
    setNavOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 忽略写入失败
    }
    if (window.location.hash !== `#${next}`) {
      window.history.pushState(null, "", `#${next}`);
    }
  }, []);

  return (
    <div className="app">
      <AppSidebar view={view} onNavigate={navigate} open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="app-main" inert={navOpen}>
        <div hidden={view !== "generate"}>
          <GeneratorClient active={view === "generate"} onNavigate={navigate} onOpenNav={() => setNavOpen(true)} />
        </div>
        <div hidden={view !== "merge"}>
          <MergeWorkspace active={view === "merge"} onNavigate={navigate} onOpenNav={() => setNavOpen(true)} />
        </div>
        {view === "library" ? (
          <LibraryPage onNavigate={navigate} onOpenNav={() => setNavOpen(true)} />
        ) : null}
      </div>
    </div>
  );
}
