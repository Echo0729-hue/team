"use client";

import { useEffect } from "react";

type ToastProps = {
  message: string | null;
  tone?: "success" | "error";
  onDone: () => void;
};

/** 操作反馈：保存 / 重命名 / 删除成功后的简短提示 */
export default function Toast({ message, tone = "success", onDone }: ToastProps) {
  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = window.setTimeout(onDone, 2400);
    return () => window.clearTimeout(timer);
  }, [message, onDone]);

  if (!message) {
    return null;
  }

  return (
    <div className={`toast ${tone}`} role="status" aria-live="polite">
      <span className="toast-dot" aria-hidden="true" />
      {message}
    </div>
  );
}