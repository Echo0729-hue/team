import React, { useMemo } from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import { BoxGeometry, EdgesGeometry, Euler, OctahedronGeometry, PerspectiveCamera, Vector3 } from "three";
import { effectTiming, getEffectPreset, type VideoEffect } from "./effects";
import { manimFrame, manimFrameName, type ManimAsset } from "./manim";

type VisualProps = { effect: VideoEffect; seconds: number; progress: number; asset?: ManimAsset };
const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';
const ease = (n: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, n)), 3);

function WebVisual({ effect: e, seconds }: VisualProps) {
  const entered = ease(seconds * e.speed * 1.4);
  return <svg viewBox="0 0 600 300" width="100%" height="100%" style={{ overflow: "visible", fontFamily: FONT }}>
    <rect x="8" y="15" width="584" height="270" rx={e.variant === "sharp" ? 0 : 24} fill="#0B1120" fillOpacity="0.94" stroke={e.color} strokeWidth="2" />
    {e.preset === "web-card" ? <g transform={`translate(0 ${Math.sin(seconds * e.speed * 2) * 9 * e.intensity})`}>
      <rect x="38" y="55" width={12 + 12 * e.intensity} height="42" rx="4" fill={e.color} />
      <foreignObject x="76" y="52" width="468" height="186"><div style={{ color: e.secondaryColor, fontSize: 38, fontWeight: 700, lineHeight: 1.5, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{e.text}</div></foreignObject>
      <path d="M40 250H560" stroke={e.color} opacity="0.35" />
    </g> : <>
      <text x="40" y="58" fill={e.secondaryColor} fontSize="24">{e.text.slice(0, 24)}</text>
      {e.values.map((value, index) => {
        const step = 510 / e.values.length;
        const h = value * 1.5 * ease((seconds * e.speed - index * 0.12) * 1.6);
        return <g key={index}>
          <rect x={45 + index * step} y={245 - h} width={step * 0.65} height={h} fill={e.color} fillOpacity={0.45 + e.intensity * 0.55} rx={e.variant === "sharp" ? 0 : 6} />
          <text x={45 + index * step + step * 0.325} y={232 - h} textAnchor="middle" fill={e.secondaryColor} fontSize="22">{Math.round(value * entered)}</text>
        </g>;
      })}
      <path d="M35 246H565" stroke={e.secondaryColor} opacity="0.5" />
    </>}
  </svg>;
}

/** Fixed, layered paths: no wall clock, random source, canvas or async frame race. */
function DrawVisual({ effect: e, seconds }: VisualProps) {
  const progress = ease(seconds * e.speed * 1.3);
  const brush = e.variant === "brush";
  return <svg viewBox="0 0 600 300" width="100%" height="100%" style={{ overflow: "visible", fontFamily: FONT }}>
    {Array.from({ length: brush ? 9 : 5 }, (_, index) => {
      const offset = index * (brush ? 3 : 1.5);
      const path = e.preset === "draw-marker"
        ? `M45 ${183 + offset} Q220 ${165 + offset} 552 ${178 + offset}`
        : `M540 150 C547 ${40 + offset} 120 24 57 122 C-3 246 459 275 537 171 C561 144 536 117 515 111`;
      return <path key={index} d={path} pathLength="1" stroke={e.color}
        strokeWidth={brush ? 12 + e.intensity * 16 : 1 + e.intensity * 2} opacity={brush ? 0.13 : 0.55}
        strokeLinecap="round" fill="none" strokeDasharray="1" strokeDashoffset={1 - progress} />;
    })}
    <foreignObject x="65" y="90" width="470" height="130"><div style={{ textAlign: "center", color: e.secondaryColor, fontSize: 38, fontWeight: 700, lineHeight: 1.5, overflowWrap: "anywhere" }}>{e.text}</div></foreignObject>
  </svg>;
}

function ThreeVisual({ effect: e, seconds }: VisualProps) {
  const points = useMemo(() => {
    const source = e.variant === "octahedron" ? new OctahedronGeometry(1.35) : new BoxGeometry(1.7, 1.7, 1.7);
    const edges = new EdgesGeometry(source);
    const data = Array.from(edges.getAttribute("position").array);
    source.dispose(); edges.dispose();
    return data;
  }, [e.variant]);
  const camera = useMemo(() => {
    const c = new PerspectiveCamera(40, 2, 0.1, 100);
    c.position.z = 5; c.updateMatrixWorld();
    return c;
  }, []);
  const time = seconds * e.speed;
  const rotation = new Euler(0.4 + time * 0.3, time * 0.65, 0.15);
  const project = (x: number, y: number, z: number) => {
    const p = new Vector3(x, y, z).applyEuler(rotation).project(camera);
    return { x: (p.x + 1) * 300, y: (1 - p.y) * 150, z: p.z };
  };
  const orbit = e.preset === "three-orbit";
  const paths = orbit ? Array.from({ length: e.variant === "atom" ? 6 : 3 }, (_, index) => {
    const pts = Array.from({ length: 97 }, (_, i) => {
      const a = i / 96 * Math.PI * 2;
      const tilt = index * Math.PI / (e.variant === "atom" ? 6 : 3);
      return project(Math.cos(a) * 1.5, Math.sin(a) * Math.cos(tilt) * 1.5, Math.sin(a) * Math.sin(tilt) * 1.5);
    });
    const angle = time * (0.7 + e.intensity) + index * 2;
    const dot = project(Math.cos(angle) * 1.5, Math.sin(angle) * Math.cos(index * Math.PI / (e.variant === "atom" ? 6 : 3)) * 1.5, Math.sin(angle) * Math.sin(index * Math.PI / (e.variant === "atom" ? 6 : 3)) * 1.5);
    return <g key={index}><polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} stroke={e.color} strokeWidth="1.8" opacity="0.65" fill="none" /><circle cx={dot.x} cy={dot.y} r={5 + e.intensity * 5} fill={e.secondaryColor} /></g>;
  }) : Array.from({ length: points.length / 6 }, (_, index) => {
    const i = index * 6;
    const a = project(points[i], points[i + 1], points[i + 2]);
    const b = project(points[i + 3], points[i + 4], points[i + 5]);
    return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={index % 3 === 0 ? e.secondaryColor : e.color} strokeWidth={1.5 + e.intensity * 3} />;
  });
  return <svg viewBox="0 0 600 300" width="100%" height="100%" style={{ overflow: "visible" }}>{paths}{orbit ? <circle cx="300" cy="150" r="11" fill={e.color} /> : null}</svg>;
}

function ManimVisual({ effect, seconds, asset }: VisualProps) {
  if (!asset) return <div className="manim-frame-pending" data-manim-pending={effect.id} style={{ color: effect.secondaryColor, fontFamily: FONT, fontSize: 24, textAlign: "center", padding: 28 }}>数学动画尚未就绪</div>;
  const frame = manimFrame(Math.round(seconds * asset.fps), asset.frames);
  return <Img data-renderer="manim" data-manim-asset={asset.id} data-manim-frame={frame} src={`${asset.baseUrl}/${manimFrameName(frame)}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />;
}

export function EffectVisual(props: VisualProps) {
  const category = getEffectPreset(props.effect.preset).category;
  switch (category) {
    case "web": return <WebVisual {...props} />;
    case "draw": return <DrawVisual {...props} />;
    case "three": return <ThreeVisual {...props} />;
    case "math": return <ManimVisual {...props} />;
    default: return null;
  }
}

export function EffectTrack({ effects, placement, manimAssets }: { effects: VideoEffect[]; placement: "front" | "back"; manimAssets?: Record<string, ManimAsset> }) {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames, fps } = useVideoConfig();
  return <AbsoluteFill style={{ pointerEvents: "none" }}>{effects.map((e) => {
    const t = effectTiming(e, frame, durationInFrames, fps);
    if (!t.active || e.placement !== placement || getEffectPreset(e.preset).category === "motion") return null;
    const w = Math.min(width, height) * e.size;
    const rise = e.entrance === "rise" ? (1 - ease(t.entrance)) * 45 : 0;
    return <div key={e.id} data-effect-id={e.id} style={{ position: "absolute", left: `${e.x * 100}%`, top: `${e.y * 100}%`, width: w, height: w / 2, opacity: e.opacity * ease(t.entrance), transform: `translate(-50%, -50%) translateY(${rise}px) rotate(${e.rotation}deg)` }}>
      <EffectVisual effect={e} seconds={t.seconds} progress={t.progress} asset={manimAssets?.[e.id]} />
    </div>;
  })}</AbsoluteFill>;
}

/** Scene motions wrap the same visual tree in both Player and renderer. Audio timing is untouched. */
export function SceneEffects({ effects, children }: { effects: VideoEffect[]; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  let scale = 1;
  let pan = 0;
  const fades: { id: string; color: string; opacity: number }[] = [];
  for (const e of effects) {
    const t = effectTiming(e, frame, durationInFrames, fps);
    if (!t.active) continue;
    if (e.preset === "motion-fade") {
      const intro = ease(t.local / t.edgeFrames);
      const outro = ease((t.length - 1 - t.local) / t.edgeFrames);
      const fade = e.variant === "in" ? intro : e.variant === "out" ? outro : Math.min(intro, outro);
      fades.push({ id: e.id, color: e.color, opacity: (1 - fade) * e.opacity * e.intensity });
    }
    if (e.preset === "motion-zoom") {
      const envelope = Math.pow(Math.sin(t.progress * Math.PI), 2);
      const amount = envelope * e.intensity * e.opacity;
      if (e.variant === "pan") { scale *= 1 + amount * 0.15; pan += Math.sin(t.seconds * e.speed) * amount * 3; }
      else scale *= 1 + amount * 0.35 * (0.65 + 0.35 * Math.sin(t.seconds * e.speed));
    }
  }
  return <AbsoluteFill style={{ overflow: "hidden" }}><AbsoluteFill style={{ transform: `translateX(${pan}%) scale(${Math.min(2, scale)})` }}>{children}</AbsoluteFill>{fades.map((f) => <AbsoluteFill key={f.id} style={{ backgroundColor: f.color, opacity: f.opacity, pointerEvents: "none" }} />)}</AbsoluteFill>;
}
