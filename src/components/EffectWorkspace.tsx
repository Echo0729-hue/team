"use client";

import { memo, useCallback, useId, useMemo, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from "react";
import katex from "katex";
import { createEffect, createEffectId, EFFECT_CATEGORIES, EFFECT_PRESETS, effectVariants, getEffectPreset, MAX_EFFECTS, sanitizeEffects, type EffectCategory, type EffectPresetId, type VideoEffect } from "@/remotion/effects";
import { EffectVisual } from "@/remotion/EffectTrack";
import { getDurationInFrames, VIDEO_CONFIG, type VideoProps } from "@/remotion/params";
import PreviewPlayer from "./PreviewPlayer";
import { isManimEffect, manimKey, validateManimFormula, type ManimJob } from "@/remotion/manim";

const paths = {
  web: "M3 5h18v14H3zM3 9h18M7 7h.01M10 7h.01M7 13h6M7 16h10",
  draw: "m5 16 11-11 3 3L8 19l-5 2 2-5ZM13 8l3 3",
  three: "m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10 9-5M3 8l9 5v9M8 5l9 5v5",
  math: "M3 18h4l3-12 4 15 4-12h3M15 5h6",
  motion: "M3 5h18v14H3zM7 9v6l5-3-5-3ZM16 9v6M19 9v6",
  plus: "M12 5v14M5 12h14", up: "m6 14 6-6 6 6", down: "m6 10 6 6 6-6",
  copy: "M9 9h12v12H9zM15 9V3H3v12h6", trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  eye: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  off: "m3 3 18 18M9 5c1-.3 2-.5 3-.5 7 0 10 7.5 10 7.5s-1 2.4-3.2 4.4M6 6.5C3.3 8.7 2 12 2 12s3 7.5 10 7.5c2 0 3.5-.5 5-1.3",
};
function Icon({ name }: { name: keyof typeof paths }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

const EffectThumbnail = memo(function EffectThumbnail({ preset }: { preset: EffectPresetId }) {
  const sample = useMemo(() => createEffect(preset), [preset]);
  const motion = getEffectPreset(preset).category === "motion";
  const math = isManimEffect(sample);
  return <span className={`effect-thumb${motion ? " motion-thumb" : ""}${math ? " manim-thumb" : ""}`} aria-hidden="true">{math ? <span>{preset === "math-formula" ? "E = mc²" : "ƒ(x)"}<small>Manim</small></span> : motion ? <Icon name="motion" /> : <EffectVisual effect={sample} seconds={1.8} progress={0.5} />}</span>;
});

function RangeField({ label, value, min, max, step = 1, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  const id = useId();
  return <div className="effect-field"><div className="label-row"><label htmlFor={id}>{label}</label><output htmlFor={id}>{Number(value.toFixed(2))}{suffix}</output></div><input id={id} className="range" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}

function EffectInspector({ effect: e, total, update }: { effect: VideoEffect; total: number; update: (patch: Partial<VideoEffect>) => void }) {
  const prefix = useId();
  const [rawValues, setRawValues] = useState(e.values.join(", "));
  const [dataError, setDataError] = useState("");
  const category = getEffectPreset(e.preset).category;
  const isMotion = category === "motion";
  const isMath = category === "math";
  const variants = effectVariants(e.preset);
  const fps = VIDEO_CONFIG.fps;
  const end = Math.min(total, e.endFrame ?? total);
  const formulaError = useMemo(() => {
    if (e.preset !== "math-formula") return "";
    for (const text of [e.text, ...(e.variant === "transform" ? [e.targetText] : [])]) {
      const error = validateManimFormula(text);
      if (error) return error;
      try { katex.renderToString(text, { throwOnError: true, trust: false, strict: "ignore", maxExpand: 100, maxSize: 4 }); }
      catch { return "公式语法有误，请检查命令和花括号。修正后会自动重新生成动画。"; }
    }
    return "";
  }, [e.preset, e.text, e.targetText, e.variant]);
  return <div className="effect-inspector">
    <div className="effect-field"><label htmlFor={`${prefix}-name`}>组件名称</label><input id={`${prefix}-name`} className="input" maxLength={40} value={e.name} onChange={(event) => update({ name: event.target.value })} /></div>
    {!["three-cube", "three-orbit", "math-sine", "motion-fade", "motion-zoom"].includes(e.preset) ? <div className="effect-field">
      <label htmlFor={`${prefix}-text`}>{e.preset === "math-formula" ? "公式（LaTeX）" : "显示文字"}</label>
      <textarea id={`${prefix}-text`} className="textarea" rows={3} maxLength={180} value={e.text} onChange={(event) => update({ text: event.target.value })} />
      {e.preset === "math-formula" ? <p className={formulaError ? "field-error" : "field-hint"} role={formulaError ? "alert" : undefined}>{formulaError || "例如：E = mc^2 或 \\frac{a}{b}。修改后自动生成数学动画。"}</p> : null}
    </div> : null}
    {e.preset === "web-bars" ? <div className="effect-field"><label htmlFor={`${prefix}-data`}>图表数值</label><input id={`${prefix}-data`} className={`input${dataError ? " invalid" : ""}`} value={rawValues} aria-invalid={Boolean(dataError)} onChange={(event) => {
      setRawValues(event.target.value);
      const parts = event.target.value.split(/[,，]/).map((value) => value.trim());
      const valid = parts.length >= 1 && parts.length <= 6 && parts.every((v) => v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100);
      setDataError(valid ? "" : "请输入 1–6 个 0–100 的数值，用逗号隔开；预览保留上次有效数据。");
      if (valid) update({ values: parts.map(Number) });
    }} /><p className={dataError ? "field-error" : "field-hint"}>{dataError || "用逗号隔开，例如 30, 65, 90。请替换为你的真实数据。"}</p></div> : null}
    <div className="effect-field"><label htmlFor={`${prefix}-variant`}>效果样式</label><select id={`${prefix}-variant`} className="input" value={e.variant} onChange={(event) => update({ variant: event.target.value })}>{variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
    {e.preset === "math-formula" && e.variant === "transform" ? <div className="effect-field"><label htmlFor={`${prefix}-target`}>变换后的公式（LaTeX）</label><textarea id={`${prefix}-target`} className="textarea" rows={3} maxLength={180} value={e.targetText} onChange={(event) => update({ targetText: event.target.value })} /><p className="field-hint">先书写原公式，再把对应形状变换为目标公式。</p></div> : null}
    {e.preset === "math-sine" ? <fieldset className="effect-fieldset"><legend>函数参数</legend><RangeField label={e.variant === "parabola" ? "二次项系数 a" : "振幅 A"} value={e.amplitude} min={0.1} max={3} step={0.1} onChange={(v) => update({ amplitude: v })} />{e.variant !== "parabola" ? <RangeField label="频率 ω" value={e.frequency} min={0.25} max={3} step={0.05} onChange={(v) => update({ frequency: v })} /> : null}<RangeField label="垂直偏移 b" value={e.offset} min={-2} max={2} step={0.1} onChange={(v) => update({ offset: v })} /><p className="field-hint">{e.variant === "parabola" ? "y = ax² + b" : "y = A sin(ωx) + b"}，坐标范围随函数自动调整。</p></fieldset> : null}
    <fieldset className="effect-fieldset"><legend>出场时间</legend><div className="effect-time-inputs">
      <label>开始（秒）<input aria-label="效果开始秒数" type="number" className="input" min={0} max={(end - 1) / fps} step={1 / fps} value={Number((e.startFrame / fps).toFixed(2))} onChange={(event) => update({ startFrame: Math.max(0, Math.min(end - 1, Math.round(Number(event.target.value) * fps))) })} /></label>
      <label>结束（秒）<input aria-label="效果结束秒数" className="input" type="number" min={(e.startFrame + 1) / fps} max={total / fps} step={1 / fps} disabled={e.endFrame === null} value={Number((end / fps).toFixed(2))} onChange={(event) => update({ endFrame: Math.max(e.startFrame + 1, Math.min(total, Math.round(Number(event.target.value) * fps))) })} /></label>
    </div><label className="effect-check"><input type="checkbox" checked={e.endFrame === null} onChange={(event) => update({ endFrame: event.target.checked ? null : total })} />结束跟随视频时长</label>
    {isMotion ? <p className="field-hint">作用于这段时间内的整幅画面，配音与字幕时间轴不变。</p> : null}</fieldset>
    {!isMotion ? <>
      <fieldset className="effect-fieldset"><legend>位置与尺寸</legend>
        <RangeField label="水平位置" value={Math.round(e.x * 100)} min={0} max={100} suffix="%" onChange={(v) => update({ x: v / 100 })} />
        <RangeField label="垂直位置" value={Math.round(e.y * 100)} min={0} max={100} suffix="%" onChange={(v) => update({ y: v / 100 })} />
        <RangeField label="组件大小" value={Math.round(e.size * 100)} min={15} max={150} suffix="%" onChange={(v) => update({ size: v / 100 })} />
        <RangeField label="旋转角度" value={e.rotation} min={-180} max={180} suffix="°" onChange={(v) => update({ rotation: v })} />
      </fieldset>
      <div className="effect-field"><label htmlFor={`${prefix}-entrance`}>进出场方式</label><select id={`${prefix}-entrance`} className="input" value={e.entrance} onChange={(event) => update({ entrance: event.target.value as VideoEffect["entrance"] })}><option value="fade">淡入淡出</option><option value="rise">上浮淡入淡出</option><option value="none">直接出现</option></select></div>
      <div className="effect-field"><label htmlFor={`${prefix}-placement`}>叠放位置</label><select id={`${prefix}-placement`} className="input" value={e.placement} onChange={(event) => update({ placement: event.target.value as VideoEffect["placement"] })}><option value="front">在文字 / 图片图层前方</option><option value="back">在文字 / 图片图层后方</option></select><p className="field-hint">字幕始终在最前方，同一位置按组件列表从下到上叠放。</p></div>
    </> : null}
    <fieldset className="effect-fieldset"><legend>效果调节</legend>
      <RangeField label={isMath ? "线条强度" : "效果强度"} value={Math.round(e.intensity * 100)} min={0} max={100} suffix="%" onChange={(v) => update({ intensity: v / 100 })} />
      <RangeField label="动画速度" value={e.speed} min={0.25} max={3} step={0.05} suffix="×" onChange={(v) => update({ speed: v })} />
      <RangeField label={isMotion ? "作用程度" : "不透明度"} value={Math.round(e.opacity * 100)} min={0} max={100} suffix="%" onChange={(v) => update({ opacity: v / 100 })} />
      {isMath ? <p className="field-hint">速度控制数学动画的书写与变换。动画结束后停在最后一帧，直到组件出场时间结束。</p> : null}
    </fieldset>
    {e.preset !== "motion-zoom" ? <div className="effect-colors"><label><span>{e.preset === "motion-fade" ? "过渡底色" : "主色"}<small>{e.color}</small></span><input aria-label="效果主色" type="color" value={e.color} onChange={(event) => update({ color: event.target.value.toUpperCase() })} /></label>{!isMotion ? <label><span>文字 / 辅色<small>{e.secondaryColor}</small></span><input aria-label="效果辅色" type="color" value={e.secondaryColor} onChange={(event) => update({ secondaryColor: event.target.value.toUpperCase() })} /></label> : null}</div> : null}
  </div>;
}

type Props = {
  effects: VideoEffect[]; setEffects: Dispatch<SetStateAction<VideoEffect[]>>;
  selectedId: string | null; onSelect: (id: string | null) => void;
  previewProps: VideoProps; active: boolean; onFullscreen: () => void;
  exportContent: ReactNode;
  manimJobs: Record<string, ManimJob>; onRetryManim: () => void;
};

export default function EffectWorkspace({ effects, setEffects, selectedId, onSelect, previewProps, active, onFullscreen, exportContent, manimJobs, onRetryManim }: Props) {
  const [category, setCategory] = useState<EffectCategory>("web");
  const [message, setMessage] = useState("");
  const [frame, setFrame] = useState(24);
  const [seek, setSeek] = useState<number>(24);
  const [mobilePanel, setMobilePanel] = useState<"library" | "inspector">("library");
  const total = getDurationInFrames(previewProps);
  const selected = (previewProps.effects ?? []).find((effect) => effect.id === selectedId);
  const mathJob = selected && isManimEffect(selected) ? manimJobs[manimKey(selected)] : undefined;
  const index = effects.findIndex((effect) => effect.id === selectedId);
  const add = (preset: EffectPresetId) => {
    if (effects.length >= MAX_EFFECTS) return;
    const next = createEffect(preset);
    if (preset === "motion-fade") { next.color = previewProps.backgroundColor; next.intensity = 1; }
    setEffects((old) => [...old, next]); onSelect(next.id);
    setSeek(Math.min(total - 1, 30));
    setMessage(`已添加${next.name}`);
    setMobilePanel("inspector");
  };
  const select = (id: string) => {
    onSelect(id);
    setMobilePanel("inspector");
    const effect = (previewProps.effects ?? []).find((e) => e.id === id);
    if (effect) setSeek(Math.min(total - 1, (effect.endFrame ?? total) - 1, effect.startFrame + 24));
  };
  const update = (patch: Partial<VideoEffect>) => setEffects((old) => old.map((e) => e.id === selectedId ? sanitizeEffects([{ ...e, ...patch }], total)[0] : e));
  const move = (delta: number) => setEffects((old) => {
    const from = old.findIndex((e) => e.id === selectedId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= old.length) return old;
    const next = [...old]; [next[from], next[to]] = [next[to], next[from]]; return next;
  });
  const onFrame = useCallback((value: number) => setFrame(value), []);
  return <div className="split split-editor effects-workspace" data-mobile-panel={mobilePanel}>
    <aside id="effect-library-panel" className="card editor-card effect-library-panel">
      <div className="card-head"><div className="card-title"><h2>效果组件库</h2><span className="card-note">五类效果，自由组合</span></div></div>
      <div className="effect-library">
        <div className="effect-categories" role="group" aria-label="效果分类">{EFFECT_CATEGORIES.map((item) => <button type="button" key={item.id} aria-pressed={category === item.id} className={category === item.id ? "is-active" : ""} onClick={() => setCategory(item.id)}><Icon name={item.id} />{item.name}</button>)}</div>
        <p className="field-hint">{EFFECT_CATEGORIES.find((c) => c.id === category)?.description}</p>
        <div className="effect-presets">{EFFECT_PRESETS.filter((p) => p.category === category).map((p) => <button type="button" className="effect-preset" key={p.id} disabled={effects.length >= MAX_EFFECTS} aria-label={`添加${p.name}`} onClick={() => add(p.id)}><EffectThumbnail preset={p.id} /><span><strong>{p.name}</strong><small>{p.description}</small></span><span className="effect-add-mark"><Icon name="plus" /></span></button>)}</div>
        <div className="effect-stack-head"><h3>已加入视频</h3><span>{effects.length} / {MAX_EFFECTS}</span></div>
        {effects.length ? <>
          <ol className="effect-stack">{effects.toReversed().map((e) => <li key={e.id} className={`${selectedId === e.id ? "is-selected" : ""}${e.hidden ? " is-hidden" : ""}`}>
            <button type="button" className="effect-select" aria-pressed={selectedId === e.id} onClick={() => select(e.id)}><Icon name={getEffectPreset(e.preset).category} /><span><strong>{e.name || getEffectPreset(e.preset).name}</strong><small>{(e.startFrame / 30).toFixed(1)}s — {e.endFrame === null ? "视频结束" : `${(Math.min(total, e.endFrame) / 30).toFixed(1)}s`}</small></span></button>
            <button type="button" className="effect-icon-btn" aria-label={`${e.hidden ? "显示" : "隐藏"}${e.name}`} aria-pressed={!e.hidden} onClick={() => setEffects((old) => old.map((effect) => effect.id === e.id ? { ...effect, hidden: !effect.hidden } : effect))}><Icon name={e.hidden ? "off" : "eye"} /></button>
          </li>)}</ol>
          <div className="effect-stack-tools"><button type="button" className="effect-icon-btn" aria-label="上移组件" title="上移组件" disabled={index < 0 || index === effects.length - 1} onClick={() => move(1)}><Icon name="up" /></button><button type="button" className="effect-icon-btn" aria-label="下移组件" title="下移组件" disabled={index <= 0} onClick={() => move(-1)}><Icon name="down" /></button><button type="button" className="effect-icon-btn" aria-label="复制组件" title="复制组件" disabled={!selected || effects.length >= MAX_EFFECTS} onClick={() => {
            if (!selected) return; const copy = { ...selected, id: createEffectId(), name: `${selected.name} 副本`.slice(0, 40) }; setEffects((old) => [...old, copy]); onSelect(copy.id); setMessage("已复制组件");
          }}><Icon name="copy" /><span>复制</span></button><button type="button" className="effect-icon-btn danger" aria-label="删除组件" title="删除组件" disabled={!selected} onClick={() => {
            setEffects((old) => old.filter((e) => e.id !== selectedId)); onSelect(null); setMessage("组件已从视频移除");
          }}><Icon name="trash" /><span>删除</span></button></div>
        </> : <div className="effect-empty"><strong>让画面多一点表达</strong><p>点击预设右侧的加号加入视频，再调整样式和出场时间。</p></div>}
        <p className="field-hint" role="status">{effects.length >= MAX_EFFECTS ? `最多同时使用 ${MAX_EFFECTS} 个组件，请先移除不需要的效果。` : message}</p>
      </div>
    </aside>
    <div className="stage-col editor-stage effect-preview-panel">
      <section className="card preview-card">
        <div className="card-head"><div className="card-title"><h2>效果预览</h2><span className="card-note">{effects.filter((e) => !e.hidden).length} 个效果启用</span></div><button type="button" className="btn btn-ghost btn-sm" onClick={onFullscreen}>全屏预览</button></div>
        <div className="canvas"><PreviewPlayer inputProps={previewProps} active={active} editing seekFrame={seek} onFrameChange={onFrame} onRequestFullscreen={onFullscreen} /></div>
        <div className="effect-timeline"><div className="label-row"><label htmlFor="effect-playhead">时间轴播放位置</label><output>{(Math.min(frame, total - 1) / 30).toFixed(2)} <span>/ {(total / 30).toFixed(2)} 秒</span></output></div><input id="effect-playhead" type="range" className="range" min={0} max={total - 1} value={Math.min(total - 1, frame)} onChange={(event) => { const n = Number(event.target.value); setSeek(n); setFrame(n); }} />
          <div className="effect-time-ruler" aria-hidden="true">{[0, 1, 2, 3, 4].map((n) => <span key={n}>{(n * total / 120).toFixed(n === 0 ? 0 : 1)}s</span>)}</div>
          {!effects.length ? <p className="field-hint">添加组件后，在这里查看各自的出场区间。</p> : <div className="effect-tracks" style={{ "--playhead": `${Math.min(frame, total - 1) / total * 100}%` } as CSSProperties}>{(previewProps.effects ?? []).toReversed().map((e) => <button type="button" key={e.id} className={`effect-track${selectedId === e.id ? " is-selected" : ""}${e.hidden ? " is-hidden" : ""}`} aria-label={`定位${e.name}时间段`} onClick={() => select(e.id)}><span>{e.name}</span><span className="effect-track-rail"><span style={{ left: `${e.startFrame / total * 100}%`, width: `${((e.endFrame ?? total) - e.startFrame) / total * 100}%` }} /><i className="effect-playhead-marker" /></span></button>)}</div>}
        </div>
      </section>
    </div>
    <div className="effects-mobile-switch" role="group" aria-label="效果编辑面板"><button type="button" aria-controls="effect-library-panel" aria-pressed={mobilePanel === "library"} onClick={() => setMobilePanel("library")}><Icon name="plus" />组件库<span>{effects.length}</span></button><button type="button" aria-controls="effect-properties-panel" aria-pressed={mobilePanel === "inspector"} onClick={() => setMobilePanel("inspector")}><Icon name="draw" />组件属性</button></div>
    <aside id="effect-properties-panel" className="card editor-card inspector-card effect-properties-panel"><div className="card-head"><div className="card-title"><h2>组件属性</h2><span className="card-note">{selected ? getEffectPreset(selected.preset).name : "选择一个组件"}</span></div></div>{selected && isManimEffect(selected) ? <div className={`manim-render-state${mathJob?.status === "failed" ? " is-error" : ""}`}><strong>Manim 数学动画</strong><p role={mathJob?.status === "failed" ? "alert" : "status"}>{mathJob?.message ?? (selected.hidden ? "组件已隐藏，显示后生成动画。" : "等待生成数学动画…")}</p>{mathJob?.status === "ready" && mathJob.asset ? <small>{mathJob.asset.frames} 帧 · {mathJob.asset.fps} fps · 透明背景</small> : null}{mathJob?.status === "failed" ? <button type="button" className="btn btn-ghost btn-sm" onClick={onRetryManim}>重新生成数学动画</button> : null}</div> : null}{selected ? <EffectInspector key={selected.id} effect={selected} total={total} update={update} /> : <div className="effect-empty"><strong>选中组件，开始调整</strong><p>从左侧添加一个效果，或点击时间轴里的组件查看属性。</p></div>}</aside>
    <div className="effects-export">{exportContent}</div>
  </div>;
}
