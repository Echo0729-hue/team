"use client";

import { useState, type ReactNode } from "react";
import { toDownloadFileName } from "@/lib/videoName";

type SaveHandle = { name: string; createWritable: () => Promise<WritableStream<Uint8Array>> };
type SaveWindow = Window & { showSaveFilePicker?: (options: {
  suggestedName: string; types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SaveHandle> };

export default function DownloadVideo({ id, name, href, className, children }: {
  id: string; name: string; href: string; className: string; children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true); setMessage(null); setError(false);
    try {
      if (["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname)) {
        // Save locally first: an embedded browser may expose an unusable file picker.
        const response = await fetch(`/api/videos/${id}/save`, { method: "POST" });
        const data = await response.json();
        if (!response.ok || !data.saved?.path) throw new Error(data.message ?? "保存失败，请重试。");
        setMessage(`已保存到下载文件夹：${data.saved.path}`);
        return;
      }
      const picker = (window as SaveWindow).showSaveFilePicker;
      if (picker) {
        let file: SaveHandle | undefined;
        try {
          // Invoke directly from the click, before any network request consumes activation.
          file = await picker.call(window, { suggestedName: toDownloadFileName(name),
            types: [{ description: "MP4 视频", accept: { "video/mp4": [".mp4"] } }] });
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          if (!["SecurityError", "NotAllowedError"].includes((err as Error).name)) throw err;
        }
        if (file) {
          const response = await fetch(href, { cache: "no-store" });
          if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("video/mp4")) {
            throw new Error("无法读取视频文件，请确认视频仍在素材库中。");
          }
          await response.body.pipeTo(await file.createWritable());
          setMessage(`已保存：${file.name}`);
          return;
        }
      }

      const link = document.createElement("a");
      link.href = href; link.download = toDownloadFileName(name);
      document.body.appendChild(link); link.click(); link.remove();
      setMessage("已请求浏览器下载，请查看浏览器的下载列表。");
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : "下载失败，请重试。");
    } finally { setBusy(false); }
  };

  return (
    <span className="video-download">
      <button type="button" className={className} disabled={busy} onClick={() => void save()} aria-busy={busy}>
        {busy ? "正在保存…" : children}
      </button>
      {message ? <span className={`video-download-message${error ? " error" : ""}`} role={error ? "alert" : "status"}>{message}</span> : null}
    </span>
  );
}
