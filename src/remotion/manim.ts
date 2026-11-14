import type { VideoEffect } from "./effects";

export const MANIM_RENDER_VERSION = 3;
export type ManimSpec = {
  version: number; preset: string; text: string; targetText: string; variant: string;
  color: string; secondaryColor: string; intensity: number; speed: number;
  amplitude: number; frequency: number; offset: number;
};
export type ManimAsset = { id: string; frames: number; fps: number; width: number; height: number; baseUrl: string; renderer: "manim"; version: string };
export type ManimJob = { id: string; status: "queued" | "rendering" | "ready" | "failed"; message: string; asset?: ManimAsset };
export const isManimEffect = (e: VideoEffect) => e.preset === "math-formula" || e.preset === "math-sine";
/** Placement/timing/opacity are composited later, so moving a rendered effect reuses its frames. */
export const manimSpec = (e: VideoEffect): ManimSpec => ({
  version: MANIM_RENDER_VERSION, preset: e.preset, text: e.preset === "math-formula" ? e.text : "",
  targetText: e.preset === "math-formula" && e.variant === "transform" ? e.targetText : "",
  variant: e.variant, color: e.color, secondaryColor: e.secondaryColor,
  intensity: e.intensity, speed: e.speed, amplitude: e.amplitude, frequency: e.frequency, offset: e.offset,
});
export const manimKey = (e: VideoEffect) => JSON.stringify(manimSpec(e));
export const manimFrame = (frame: number, frames: number) => Math.max(0, Math.min(frames - 1, Math.floor(frame)));
export const manimFrameName = (frame: number) => `${String(frame).padStart(5, "0")}.png`;

const safeCommands = new Set(("frac dfrac tfrac sqrt sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln exp lim sum prod int iint iiint oint infty pi theta alpha beta gamma delta epsilon varepsilon zeta eta iota kappa lambda mu nu xi rho sigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega cdot times div pm mp le leq ge geq ne neq approx equiv sim simeq to rightarrow leftarrow Rightarrow Leftarrow leftrightarrow Leftrightarrow mapsto in notin subset supset subseteq supseteq cup cap emptyset forall exists nabla partial mathrm mathbf mathit mathsf mathtt mathcal mathbb boldsymbol vec hat bar overline underline dot ddot tilde widetilde overbrace underbrace left right big Big bigg Bigg quad qquad thinspace text operatorname limits nolimits displaystyle textstyle binom dbinom tbinom lvert rvert vert lVert rVert Vert langle rangle lbrace rbrace ldots cdots vdots ddots color textcolor begin end hspace phantom vphantom overset underset min max det gcd bmod mod mid parallel perp angle degree circ prime ell Re Im real imaginary Pr smallmatrix substack cases aligned matrix pmatrix bmatrix vmatrix Vmatrix" ).split(" "));
/** TeX is data, never source code. Disallow file, macro and process primitives before invoking TeX. */
export const validateManimFormula = (value: string): string | null => {
  if (!value.trim()) return "请输入公式。";
  if (Array.from(value).length > 180) return "公式最多 180 个字符。";
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f%#]|\^\^/.test(value)) return "公式包含不支持的控制字符。";
  for (const command of value.matchAll(/\\([a-zA-Z]+|.)/g)) {
    if (/^[a-zA-Z]+$/.test(command[1]) && !safeCommands.has(command[1])) return `不支持公式命令 \\${command[1]}，请使用常用数学表达式。`;
  }
  for (const env of value.matchAll(/\\(?:begin|end)\s*\{([^}]+)\}/g)) {
    if (!["aligned", "gathered", "matrix", "pmatrix", "bmatrix", "vmatrix", "Vmatrix", "smallmatrix", "cases"].includes(env[1])) return "不支持这个公式环境。";
  }
  return null;
};
