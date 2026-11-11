/**
 * 文案 → 图案的规则化分析（不依赖 AI 接口）。
 * 通过中英文关键词判断每段文案更适合「流程 / 对比 / 增长 / 产品 / 通用」示意图，
 * 并抽取文案里真实出现的数字，供图表使用；没有数字时不会生成任何编造的数据。
 */

export type VisualKind = "flow" | "compare" | "growth" | "product" | "text";

export type ExtractedNumber = {
  value: number;
  unit: string;
};

export type VisualSpec = {
  kind: VisualKind;
  /** 从文案中拆出的短语，用作图形里的标签（只做截断，不改写） */
  labels: string[];
  /** 文案中真实出现的数字 */
  numbers: ExtractedNumber[];
};

const RULES: Array<{ kind: VisualKind; patterns: RegExp[] }> = [
  {
    kind: "flow",
    patterns: [/步骤|流程|首先|其次|然后|接着|最后|第[一二三四1-4]步|阶段|顺序|step|flow/i],
  },
  {
    kind: "compare",
    patterns: [/对比|相比|区别|差异|不同|传统|而不是|versus|\bvs\b|前者|后者|左右两边/i],
  },
  {
    kind: "growth",
    patterns: [/增长|提升|上升|提高|翻倍|增长到|提升至|上涨|提升到|percent|increase|grow/i, /%|％|倍/],
  },
  {
    kind: "product",
    patterns: [/产品|功能|特性|界面|面板|模块|系统|工具|平台|支持|提供|能力|服务|feature|api/i],
  },
];

const splitClauses = (text: string): string[] =>
  text
    .split(/[，。；、,;.！!？?\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

const truncate = (text: string, max: number): string =>
  Array.from(text).length > max ? `${Array.from(text).slice(0, max).join("")}…` : text;

export const extractNumbers = (text: string): ExtractedNumber[] => {
  const result: ExtractedNumber[] = [];
  const pattern = /(\d+(?:\.\d+)?)\s*(%|％|倍|万元|万|千|亿|个|秒|分钟|天|元|人|次)?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const value = Number.parseFloat(match[1]);
    if (!Number.isFinite(value)) {
      continue;
    }
    result.push({ value, unit: (match[2] ?? "").replace("％", "%") });
  }

  return result.slice(0, 4);
};

const score = (text: string, kind: VisualKind): number => {
  const rule = RULES.find((item) => item.kind === kind);
  if (!rule) {
    return 0;
  }
  return rule.patterns.reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0);
};

export const analyzeLine = (line: string, title: string): VisualSpec => {
  const order: VisualKind[] = ["flow", "compare", "growth", "product"];
  let best: VisualKind = "text";
  let bestScore = 0;

  for (const kind of order) {
    const lineScore = score(line, kind);
    if (lineScore > bestScore) {
      best = kind;
      bestScore = lineScore;
    }
  }

  // 本段没有明确线索时，参考标题（标题通常是整支视频的主题）
  if (bestScore === 0) {
    for (const kind of order) {
      const titleScore = score(title, kind);
      if (titleScore > bestScore) {
        best = kind;
        bestScore = titleScore;
      }
    }
  }

  const clauses = splitClauses(line);
  const labels = clauses.slice(0, 4).map((clause) => truncate(clause, 7));

  return {
    kind: best,
    labels,
    numbers: best === "growth" ? extractNumbers(line) : [],
  };
};

export const VISUAL_KIND_NAMES: Record<VisualKind, string> = {
  flow: "流程示意",
  compare: "左右对比",
  growth: "增长图表",
  product: "产品结构",
  text: "文段强调",
};

export const analyzeLines = (props: { title: string; lines: string[] }): VisualSpec[] =>
  [0, 1, 2].map((index) => analyzeLine(props.lines[index] ?? "", props.title));