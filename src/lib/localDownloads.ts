import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { toDownloadFileName } from "./videoName";

/** Only the browser on this machine may ask the local server to save a video. */
export const isLocalSaveRequest = (request: Request): boolean => {
  // Next may use localhost in request.url even when the browser opened 127.0.0.1.
  const internalUrl = new URL(request.url);
  let url: URL;
  try { url = new URL(`${internalUrl.protocol}//${request.headers.get("host") ?? internalUrl.host}`); }
  catch { return false; }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return false;
  if (request.headers.get("origin") !== url.origin) return false;
  const site = request.headers.get("sec-fetch-site");
  return !site || site === "same-origin";
};

let downloadsDirectory: string | undefined;
export const getDownloadsDirectory = (): string => {
  if (downloadsDirectory) return downloadsDirectory;
  if (process.platform === "win32") {
    try {
      // Read the actual Windows Downloads location, including a relocated folder.
      const configured = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); [Environment]::ExpandEnvironmentVariables((Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders').'{374DE290-123F-4565-9164-39C4925E467B}')",
      ], { encoding: "utf8", timeout: 5000, windowsHide: true }).trim();
      if (configured && path.isAbsolute(configured)) return downloadsDirectory = configured;
    } catch { /* Fall back to the conventional user Downloads directory. */ }
  }
  return downloadsDirectory = path.join(os.homedir(), "Downloads");
};

/** Exclusive creation keeps earlier downloads intact, including simultaneous clicks. */
export const saveVideoCopy = async (source: string, name: string, directory = getDownloadsDirectory()) => {
  const stat = await fs.promises.stat(source);
  if (!stat.isFile() || stat.size === 0) throw new Error("视频文件不存在或为空，请重新导出。");
  await fs.promises.mkdir(directory, { recursive: true });
  let baseName = toDownloadFileName(name).slice(0, -4);
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(baseName)) baseName = `_${baseName}`;
  for (let index = 0; index < 10000; index++) {
    const fileName = `${baseName}${index ? ` (${index + 1})` : ""}.mp4`;
    const destination = path.join(directory, fileName);
    try {
      await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
      return { fileName, path: destination, size: stat.size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
  }
  throw new Error("下载文件重名过多，请整理下载文件夹后重试。");
};
