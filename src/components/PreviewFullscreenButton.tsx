"use client";

export default function PreviewFullscreenButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="preview-fullscreen" aria-label="预览全屏播放" title="全屏播放" onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}
