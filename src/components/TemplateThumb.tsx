import React from "react";
import type { TemplateId } from "@/remotion/params";

type TemplateThumbProps = {
  template: TemplateId;
};

/** 模板缩略示意图：纯 SVG 线框，用来快速区分版面结构 */
export default function TemplateThumb({ template }: TemplateThumbProps) {
  const common = {
    width: "100%",
    height: "100%",
    viewBox: "0 0 64 44",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.2,
    "aria-hidden": true as const,
  };

  switch (template) {
    case "editorial":
      return (
        <svg {...common}>
          <path d="M8 12h30" strokeWidth="2.6" />
          <path d="M8 18h18" strokeWidth="2.6" />
          <path d="M8 26h26" opacity="0.5" />
          <path d="M8 31h34" opacity="0.5" />
          <path d="M8 37h44" opacity="0.25" />
          <path d="M44 10v20" opacity="0.4" />
        </svg>
      );
    case "cards":
      return (
        <svg {...common}>
          <rect x="7" y="14" width="14" height="20" rx="2.5" />
          <rect x="25" y="14" width="14" height="20" rx="2.5" />
          <rect x="43" y="14" width="14" height="20" rx="2.5" />
          <path d="M10 10h12" strokeWidth="2" />
        </svg>
      );
    case "split":
      return (
        <svg {...common}>
          <rect x="6" y="8" width="22" height="28" rx="2" fill="currentColor" opacity="0.18" />
          <path d="M10 15h13" strokeWidth="2" />
          <path d="M10 21h9" opacity="0.6" />
          <path d="M34 14h24" opacity="0.6" />
          <path d="M34 21h24" opacity="0.6" />
          <path d="M34 28h18" opacity="0.35" />
        </svg>
      );
    case "quote":
      return (
        <svg {...common}>
          <path d="M18 10c-4 1-6 3.5-6 7h5v6h-7v-6c0-5.5 3-8.5 8-9v2Z" fill="currentColor" opacity="0.5" stroke="none" />
          <path d="M8 33h48" opacity="0.45" />
          <path d="M14 38h36" opacity="0.28" />
          <path d="M32 6v6" opacity="0.5" />
        </svg>
      );
    case "kinetic":
      return (
        <svg {...common}>
          <path d="M4 9h44" strokeWidth="3" />
          <path d="M4 17h30" strokeWidth="3" />
          <path d="M4 25h22" opacity="0.55" />
          <path d="M4 32h26" opacity="0.55" />
          <path d="M46 22l10 6-10 6Z" fill="currentColor" opacity="0.35" stroke="none" />
        </svg>
      );
    case "tech":
    default:
      return (
        <svg {...common}>
          <circle cx="48" cy="12" r="12" opacity="0.35" />
          <circle cx="16" cy="34" r="9" opacity="0.2" />
          <path d="M10 13h26" strokeWidth="2.6" />
          <path d="M10 21h20" opacity="0.55" />
          <path d="M10 28h32" opacity="0.55" />
          <path d="M10 35h24" opacity="0.55" />
          <rect x="6" y="10" width="1.6" height="22" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}