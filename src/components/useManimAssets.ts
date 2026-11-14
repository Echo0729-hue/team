"use client";
import { useEffect, useMemo, useState } from "react";
import type { VideoEffect } from "@/remotion/effects";
import { isManimEffect, manimKey, type ManimAsset, type ManimJob } from "@/remotion/manim";

export function useManimAssets(effects: VideoEffect[], enabled: boolean) {
  const [jobs, setJobs] = useState<Record<string, ManimJob>>({});
  const [retry, setRetry] = useState(0);
  const wanted = effects.filter((e) => isManimEffect(e) && !e.hidden);
  const requestKey = JSON.stringify(wanted.map((e) => ({ id: e.id, key: manimKey(e) })));
  useEffect(() => {
    if (!enabled || !wanted.length) return;
    const controller = new AbortController();
    const signal = controller.signal;
    const timer = window.setTimeout(() => {
      void Promise.all(wanted.map(async (effect) => {
        const key = manimKey(effect);
        const update = (job: ManimJob) => { if (!signal.aborted) setJobs((old) => ({ ...old, [key]: job })); };
        try {
          const response = await fetch("/api/manim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ effect, retry: retry > 0 }), signal });
          const data = await response.json();
          if (!response.ok || !data.job) throw new Error(data.message ?? "无法生成数学动画，请重试。");
          let job: ManimJob = data.job;
          update(job);
          while (!signal.aborted && (job.status === "queued" || job.status === "rendering")) {
            await new Promise<void>((resolve) => {
              const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
              const timer = window.setTimeout(done, 1000);
              signal.addEventListener("abort", done, { once: true });
            });
            if (signal.aborted) return;
            const poll = await fetch(`/api/manim/${job.id}`, { signal, cache: "no-store" });
            const status = await poll.json();
            if (!poll.ok || !status.job) throw new Error(status.message ?? "无法读取动画进度，请重试。");
            job = status.job; update(job);
          }
        } catch (error) {
          if (!signal.aborted) update({ id: "", status: "failed", message: error instanceof Error ? error.message : "数学动画生成失败，请重试。" });
        }
      }));
    }, 650);
    return () => { window.clearTimeout(timer); controller.abort(); };
  // Only render data changes trigger rendering; moving/reordering an effect reuses its frames.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, retry, enabled]);
  const assets = useMemo(() => {
    const result: Record<string, ManimAsset> = {};
    for (const e of wanted) { const job = jobs[manimKey(e)]; if (job?.status === "ready" && job.asset) result[e.id] = job.asset; }
    return result;
  }, [requestKey, jobs]);
  return { assets, jobs, retry: () => setRetry((n) => n + 1) };
}
