import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { OUTPUT_DIR } from "./library";
import { TTS_DIR } from "./tts";
import { UPLOAD_DIR } from "./uploads";

/**
 * Remotion 渲染时需要一个可通过 HTTP 访问的 bundle 地址。
 * 直接把 bundle 目录交给 @remotion/renderer 时，它会自己起静态服务、从 3000 起挑端口、
 * 并用 `http://localhost:<port>` 作为地址——一旦 Next 占着 3000，Chrome 可能先命中
 * Next 的 404 页面，报 `window.getStaticCompositions is not defined`。
 *
 * 这里改为自己托管 bundle：
 * - 端口由系统随机分配，不会撞上 Next；
 * - 监听 `::`（IPv6 双栈），URL 使用 `localhost`，Chrome 解析到 ::1 / 127.0.0.1 都能命中。
 */

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".webm": "video/webm",
};

export type BundleServer = {
  serveUrl: string;
  close: () => Promise<void>;
};

type BundleCache = {
  bundleDir?: Promise<string>;
  server?: Promise<BundleServer>;
};

const globalCache = globalThis as typeof globalThis & {
  __codeVideoBundleCache?: BundleCache;
};

const cache: BundleCache = globalCache.__codeVideoBundleCache ?? {};
globalCache.__codeVideoBundleCache = cache;

const getBundleDir = (entryPoint: string): Promise<string> => {
  if (!cache.bundleDir) {
    cache.bundleDir = bundle({ entryPoint }).catch((error: unknown) => {
      cache.bundleDir = undefined;
      throw error;
    });
  }
  return cache.bundleDir;
};

const createStaticServer = (bundleDir: string): Promise<http.Server> =>
  new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      } catch {
        response.writeHead(400);
        response.end("Bad request");
        return;
      }

      // /media/<file> 指向 output 目录，供拼接合成读取已生成的视频；
      // /tts/<file> 指向 output/tts，供渲染时读取配音音频
      const mediaPrefix = "/media/";
      const ttsPrefix = "/tts/";
      const uploadPrefix = "/uploads/";
      const isMedia = pathname.startsWith(mediaPrefix);
      const isTts = pathname.startsWith(ttsPrefix);
      const isUpload = pathname.startsWith(uploadPrefix);
      if (isMedia) {
        pathname = pathname.slice(mediaPrefix.length - 1);
      } else if (isTts) {
        pathname = pathname.slice(ttsPrefix.length - 1);
      } else if (isUpload) {
        pathname = pathname.slice(uploadPrefix.length - 1);
      }

      if (pathname === "/" || pathname.endsWith("/")) {
        pathname = `${pathname}index.html`;
      }

      const rootDir = isUpload ? UPLOAD_DIR : isTts ? TTS_DIR : isMedia ? OUTPUT_DIR : bundleDir;
      const filePath = path.normalize(path.join(rootDir, pathname));
      if (!filePath.startsWith(path.normalize(rootDir))) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      fs.stat(filePath, (statError, stat) => {
        if (statError || !stat.isFile()) {
          response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Not found");
          return;
        }

        const headers: Record<string, string | number> = {
          "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
          "Cache-Control": "no-store",
          "Accept-Ranges": "bytes",
        };

        const range = request.headers.range ? /^bytes=(\d*)-(\d*)$/.exec(request.headers.range.trim()) : null;
        if (range && (isMedia || isTts)) {
          const start = range[1] === "" ? 0 : Number.parseInt(range[1], 10);
          const end = range[2] === "" ? stat.size - 1 : Math.min(Number.parseInt(range[2], 10), stat.size - 1);
          if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < stat.size) {
            headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
            headers["Content-Length"] = end - start + 1;
            response.writeHead(206, headers);
            fs.createReadStream(filePath, { start, end }).pipe(response);
            return;
          }
        }

        headers["Content-Length"] = stat.size;
        response.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(response);
      });
    });

    // 优先双栈（::），不支持 IPv6 的环境退回 0.0.0.0
    const listen = (host: string, fallback: boolean) => {
      const onError = () => {
        server.removeListener("error", onError);
        if (fallback) {
          listen("0.0.0.0", false);
        } else {
          reject(new Error("无法启动视频渲染静态服务。"));
        }
      };
      server.once("error", onError);
      server.listen(0, host, () => {
        server.removeListener("error", onError);
        resolve(server);
      });
    };

    listen("::", true);
  });

/** 启动（或复用）托管 Remotion bundle 的静态服务 */
export const getBundleServer = async (entryPoint: string): Promise<BundleServer> => {
  if (!cache.server) {
    cache.server = (async () => {
      const bundleDir = await getBundleDir(entryPoint);
      const server = await createStaticServer(bundleDir);
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      return {
        serveUrl: `http://localhost:${port}`,
        close: () =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      };
    })().catch((error: unknown) => {
      cache.server = undefined;
      throw error;
    });
  }
  return cache.server;
};