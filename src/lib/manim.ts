import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { sanitizeEffects, type VideoEffect } from "../remotion/effects";
import { isManimEffect, manimSpec, validateManimFormula, type ManimAsset, type ManimJob, type ManimSpec } from "../remotion/manim";

export const MANIM_DIR = path.join(process.cwd(), "output", "manim");
const script = path.join(process.cwd(), "scripts", "manim", "render_scene.py");
const python = () => process.env.MANIM_PYTHON ?? path.join(process.cwd(), ".venv-manim", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
type Entry = { job: ManimJob; promise: Promise<ManimAsset> };
type State = { chain: Promise<unknown>; entries: Map<string, Entry> };
const globalManim = globalThis as typeof globalThis & { __codevideoManim?: State };
const state = globalManim.__codevideoManim ??= { chain: Promise.resolve(), entries: new Map() };

export class ManimInputError extends Error {}
export const normalizeManimInput = (raw: unknown): ManimSpec => {
  const e = sanitizeEffects([raw], 450)[0];
  if (!e || !isManimEffect(e)) throw new ManimInputError("请选择公式推演或函数描线组件。");
  if (e.preset === "math-formula") {
    const error = validateManimFormula(e.text) || (e.variant === "transform" ? validateManimFormula(e.targetText) : null);
    if (error) throw new ManimInputError(error);
  }
  return manimSpec(e);
};
export const manimId = (spec: ManimSpec) => createHash("sha256").update(JSON.stringify(spec)).digest("hex");
const isId = (id: string) => /^[a-f0-9]{64}$/.test(id);
const readAsset = (id: string): ManimAsset | undefined => {
  if (!isId(id)) return;
  try {
    const asset = JSON.parse(fs.readFileSync(path.join(MANIM_DIR, id, "manifest.json"), "utf8")) as ManimAsset;
    if (asset.renderer !== "manim" || asset.frames < 1 || !fs.existsSync(path.join(MANIM_DIR, id, "frames", "00000.png")) ||
      !fs.existsSync(path.join(MANIM_DIR, id, "frames", `${String(asset.frames - 1).padStart(5, "0")}.png`))) return;
    return { ...asset, id, baseUrl: `/api/manim/${id}/frames` };
  } catch { return; }
};
export const getManimJob = (id: string): ManimJob | undefined => {
  const asset = readAsset(id);
  if (asset) return { id, status: "ready", message: "Manim 动画已就绪", asset };
  return state.entries.get(id)?.job;
};
export const manimFramePath = (id: string, file: string): string | null => {
  if (!isId(id) || !/^\d{5}\.png$/.test(file)) return null;
  const asset = readAsset(id);
  if (!asset || Number(file.slice(0, 5)) >= asset.frames) return null;
  return path.join(MANIM_DIR, id, "frames", file);
};
const runPython = (specFile: string, directory: string): Promise<void> => new Promise((resolve, reject) => {
  const tools = path.join(process.cwd(), ".tools", "manim");
  const texlive = path.join(tools, "texlive");
  const env = { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", ...(fs.existsSync(path.join(texlive, "texmf.cnf")) ? { TEXMFCNF: texlive, TEXMF: texlive.replaceAll("\\", "/") } : {}), PATH: [path.join(tools, "tectonic"), path.join(texlive, "bin", "windows"), process.env.PATH].join(path.delimiter) };
  const child = execFile(/* turbopackIgnore: true */ python(), [script, specFile, directory], { env, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
    clearTimeout(timer);
    void fs.promises.writeFile(path.join(directory, "render.log"), `${stdout}\n${stderr}`);
    if (error) {
      const detail = `${stderr}\n${stdout}`;
      const match = detail.match(/MANIM_ERROR:([^\n]+)/);
      reject(new Error(match ? match[1].trim() : error.code === "ENOENT" ? "未找到 Manim 环境，请先运行 npm run setup:manim。" : "Manim 渲染失败。请检查公式语法，或在配置环境后重试。"));
    } else resolve();
  });
  const timer = setTimeout(() => {
    if (process.platform === "win32" && child.pid) execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
    else child.kill("SIGKILL");
  }, 240_000);
});
export const requestManim = (raw: unknown, retry = false): Entry => {
  const spec = normalizeManimInput(raw), id = manimId(spec);
  const cached = readAsset(id);
  if (cached) return { job: { id, status: "ready", message: "Manim 动画已就绪", asset: cached }, promise: Promise.resolve(cached) };
  const existing = state.entries.get(id);
  if (existing && !(retry && existing.job.status === "failed")) return existing;
  const job: ManimJob = { id, status: "queued", message: "正在排队生成数学动画…" };
  const promise = state.chain.then(async () => {
    job.status = "rendering"; job.message = "Manim 正在渲染透明动画…";
    const directory = path.join(MANIM_DIR, id);
    await fs.promises.mkdir(directory, { recursive: true });
    const specFile = path.join(directory, "input.json");
    await fs.promises.writeFile(specFile, JSON.stringify(spec));
    await runPython(specFile, directory);
    const asset = readAsset(id);
    if (!asset) throw new Error("Manim 没有输出完整动画，请重试。");
    job.status = "ready"; job.asset = asset; job.message = "Manim 动画已就绪";
    return asset;
  }).catch((error: unknown) => {
    job.status = "failed"; job.message = error instanceof Error ? error.message : "数学动画生成失败，请重试。";
    throw error;
  });
  state.chain = promise.catch(() => undefined);
  const entry = { job, promise };
  state.entries.set(id, entry);
  return entry;
};

export const prepareManimAssets = async (effects: VideoEffect[], serveUrl: string) => {
  const assets: Record<string, ManimAsset> = {};
  for (const e of effects.filter((e) => isManimEffect(e) && !e.hidden)) {
    const asset = await requestManim(e).promise;
    assets[e.id] = { ...asset, baseUrl: `${serveUrl}/manim/${asset.id}/frames` };
  }
  return assets;
};
