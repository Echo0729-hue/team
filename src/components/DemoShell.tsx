"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Workbench from "./Workbench";
import ResultVideo from "./ResultVideo";
import DownloadVideo from "./DownloadVideo";
import { createDemoDraft, demoDraftKey, demoSampleId, DEMO_SAMPLES, DEMO_SELECTION_KEY, type DemoSampleId, type DemoStatus } from "@/demo/projects";

const emptyStatus: DemoStatus = { status: "idle", message: "准备三个带配音和字幕的样片，以及一条拼接成片。", progress: 0, manifest: { version: 1, samples: {} } };
const steps = [
  { tab: "content", title: "改文案", hint: "修改标题和三段正文，观察即时预览" },
  { tab: "visual", title: "选画面", hint: "切换六套模板、五种比例和颜色" },
  { tab: "layers", title: "编图层", hint: "上传图片，拖动文字，调整叠放顺序" },
  { tab: "effects", title: "调效果", hint: "修改公式或函数参数，拖动时间轴，再导出 MP4" },
  { tab: "voice", title: "听配音", hint: "试听或重新合成，修改文案后验证旧配音拦截" },
  { tab: "subtitle", title: "改字幕", hint: "修改字幕、调整样式，并下载 SRT" },
] as const;

export default function DemoShell() {
  const [status, setStatus] = useState<DemoStatus>(emptyStatus);
  const [selected, setSelected] = useState<DemoSampleId>("math");
  const [fresh, setFresh] = useState(false);
  const [entered, setEntered] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [watching, setWatching] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/demo", { cache: "no-store" });
      const data = await response.json() as DemoStatus;
      if (!response.ok) throw new Error(data.message ?? "无法读取演示状态。");
      if (data.status === "ready") {
        try {
          if (!localStorage.getItem(DEMO_SELECTION_KEY)) localStorage.setItem(DEMO_SELECTION_KEY, JSON.stringify(DEMO_SAMPLES.map(s => data.manifest.samples[s.id]!.videoId)));
        } catch { /* The editor reports browser storage failures separately. */ }
      }
      setStatus(data); setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法连接演示服务，请重试。"); }
    finally { setLoaded(true); }
  }, []);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setSelected(demoSampleId(query.get("scene"))); setFresh(query.get("fresh") === "1");
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (status.status !== "preparing") return;
    const timer = window.setInterval(() => { void refresh(); }, 1400);
    return () => window.clearInterval(timer);
  }, [status.status, refresh]);

  const prepare = async () => {
    setPosting(true); setError(null);
    try {
      const response = await fetch("/api/demo", { method: "POST" });
      const data = await response.json() as DemoStatus;
      if (!response.ok) throw new Error(data.message ?? "演示素材准备失败。");
      setStatus(data);
      if (data.status === "ready") void refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法连接演示服务，请重试。"); }
    finally { setPosting(false); }
  };
  const select = (id: DemoSampleId) => {
    setSelected(id); setFresh(false); setWatching(false);
    const url = new URL(window.location.href);
    url.searchParams.set("scene", id); url.searchParams.delete("tab"); url.searchParams.delete("fresh"); url.hash = "generate";
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  };
  const initial = useMemo(() => status.manifest.samples[selected]?.draft ?? createDemoDraft(selected), [selected, status.manifest]);
  const busy = posting || status.status === "preparing";
  const message = error ?? status.message;

  if (loaded && (entered || status.status === "ready")) return <Workbench key={selected}
    demoDraft={{ key: demoDraftKey(selected), initial, fresh }}
    playbackPaused={watching}
    banner={<DemoBanner selected={selected} onSelect={select} status={status} busy={busy} onPrepare={prepare} message={message} error={!!error} watching={watching} onWatchingChange={setWatching} />} />;

  return <main className="demo-start">
    <a href="/" className="demo-return">返回我的工作区</a>
    <section className="demo-intro">
      <div><h1>体验完整创作流程</h1><p>用三个可编辑项目，演示从文稿到配音、字幕、动画、导出和拼接的完整过程。</p></div>
      <span className="chip neutral">知映视频 Demo</span>
    </section>
    <section className="demo-projects" aria-label="演示项目">
      {DEMO_SAMPLES.map((sample, index) => <button type="button" key={sample.id} className={`demo-project${selected === sample.id ? " selected" : ""}`} aria-pressed={selected === sample.id} onClick={() => select(sample.id)}>
        <span className="demo-project-no">0{index + 1}</span><span><strong>{sample.name}</strong><small>{sample.description}</small></span><span>{sample.ratio}</span>
      </button>)}
    </section>
    <section className="demo-prepare" aria-label="准备演示">
      <h2>先准备可播放的样片</h2>
      <p>实际生成三个带配音和字幕的样片，再生成一条拼接合集。首次运行需等待渲染；完成后可直接编辑、试听、全屏播放和下载。</p>
      <p role={error || status.status === "failed" ? "alert" : "status"} className={error || status.status === "failed" ? "field-error" : "demo-status"}>{loaded ? message : "正在读取演示状态…"}</p>
      {busy ? <progress max={1} value={status.progress} aria-label="演示素材准备进度" /> : null}
      <div className="demo-actions"><button type="button" className="btn btn-primary" onClick={() => void prepare()} disabled={!loaded || busy}>{busy ? "正在准备…" : status.status === "failed" ? "继续准备演示素材" : "一键准备演示素材"}</button><button type="button" className="btn btn-ghost" onClick={() => setEntered(true)} disabled={!loaded}>先进入编辑器</button></div>
      <p className="field-hint">需要已安装的 Manim 环境和可用中文音色。演示草稿独立保存；生成的视频会进入当前服务器的素材库。</p>
    </section>
    <details className="demo-help"><summary>环境还没准备好？</summary><p>在项目目录先运行 <code>npm run setup:manim</code>。Windows 安装中文语音包，或按 README 配置云端配音。随后返回这里继续准备。已完成的样片会复用。</p><p>也可以先进入编辑器，体验文案、模板、比例、图层和效果编辑，再配置配音和渲染。</p></details>
  </main>;
}

function DemoBanner({ selected, onSelect, status, busy, onPrepare, message, error, watching, onWatchingChange }: {
  selected: DemoSampleId; onSelect: (id: DemoSampleId) => void; status: DemoStatus; busy: boolean; onPrepare: () => Promise<void>; message: string; error: boolean; watching: boolean; onWatchingChange: (open: boolean) => void;
}) {
  const [output, setOutput] = useState<"sample" | "merge">("sample");
  const videoId = output === "merge" ? status.manifest.mergedId : status.manifest.samples[selected]?.videoId;
  const link = (tab: string) => `/demo?scene=${selected}&tab=${tab}#generate`;
  return <section className="demo-banner" aria-label="Demo 演示引导">
    <div className="demo-banner-top"><div><strong>完整功能 Demo</strong><span>三个示例各自保存，随时切换或恢复。</span></div>
      <div className="demo-banner-actions"><label htmlFor="demo-sample">示例项目</label><select id="demo-sample" value={selected} onChange={event => onSelect(event.target.value as DemoSampleId)}>{DEMO_SAMPLES.map(sample => <option key={sample.id} value={sample.id}>{sample.name}</option>)}</select><a href={`/demo?scene=${selected}&fresh=1#generate`} className="btn btn-ghost btn-sm" title="重置当前示例的演示草稿，恢复原始设置">恢复本示例</a></div>
    </div>
    <details className="demo-guide" open><summary>按这条路线演示完整功能</summary>
      <ol>{steps.map((step, index) => <li key={step.tab}><a href={link(step.tab)}><span>{index + 1}</span><strong>{step.title}</strong><small>{step.hint}</small></a></li>)}</ol>
      <p className="demo-next">完成编辑后点击工作区的“导出视频”，查看真实进度并下载 MP4。再进入素材库重命名、选择片段，在视频拼接调整顺序并导出合集。</p>
    </details>
    {status.status !== "ready" ? <div className="demo-banner-prepare"><p role={error || status.status === "failed" ? "alert" : "status"}>{message}</p><button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => void onPrepare()}>{busy ? "正在准备…" : "准备配音与样片"}</button>{busy ? <progress max={1} value={status.progress} aria-label="演示素材准备进度" /> : null}</div> : null}
    {videoId ? <details className="demo-watch" onToggle={event => onWatchingChange(event.currentTarget.open)}><summary>查看已生成的示范成片与合集</summary>
      <div className="demo-watch-options"><label htmlFor="demo-output">播放内容</label><select id="demo-output" className="input" value={output} onChange={e => setOutput(e.target.value as "sample" | "merge")}><option value="sample">当前示例样片</option><option value="merge">三段拼接合集</option></select></div>
      {watching ? <ResultVideo key={videoId} src={`/api/videos/${videoId}`} title={output === "merge" ? "Demo · 完整演示合集" : "Demo · 示例成片"} active={watching} onExpandedChange={() => undefined}>
        <DownloadVideo id={videoId} name={output === "merge" ? "Demo 完整演示合集" : `Demo ${DEMO_SAMPLES.find(s => s.id === selected)!.name}`} href={`/api/videos/${videoId}?download=1`} className="btn btn-primary">下载示范 MP4</DownloadVideo>
      </ResultVideo> : null}
      <p className="field-hint">这是原始示例的渲染结果。编辑后的效果请通过“导出视频”重新生成。恢复本示例会载入已准备的配音与图片。</p>
    </details> : null}
  </section>;
}
