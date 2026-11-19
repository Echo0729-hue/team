import path from "node:path";

/** Reject the root itself and paths outside it, including similarly prefixed siblings. */
export const resolveInside = (root: string, name: string): string => {
  const target = path.resolve(root, name);
  const relative = path.relative(path.resolve(root), target);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("非法的文件路径，已拒绝操作。");
  }
  return target;
};
