import net from "node:net";

/**
 * 为 Remotion 的 OffthreadVideo 代理服务分配一个系统临时端口，
 * 避免它固定从 3000 起选端口、与 Next 的监听地址冲突。
 * 视频 bundle 本身由 `bundleServer.ts` 单独托管。
 */
export const getRenderPort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("无法分配视频渲染端口。")));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(address.port);
        }
      });
    });
  });
