# Design — RailDrone Mission Studio

RailDrone Mission Studio 使用一套统一的应用级设计系统。入口页与三个工作区共享同一套导航、配色、字体、间距和交互反馈；页面之间的差异来自业务布局，而不是主题切换。

## Genre

modern-minimal，技术型、调度台式、克制清晰。

## Macrostructure family

- 统一入口：Index-First，以工作区目录本身作为主内容。
- 应用页面：Workbench，业务画布、媒体台和协同状态是页面主体。
- 全局导航：Application command bar。桌面为醒目的横向工作区轨道，窄屏为三等分切换条；当前工作区必须同时使用填充、文字和 `aria-current` 表达。

## Theme

- `--color-paper`: `oklch(98.2% 0.006 255)`
- `--color-paper-2`: `oklch(96.2% 0.009 255)`
- `--color-ink`: `oklch(22% 0.028 258)`
- `--color-ink-2`: `oklch(34% 0.025 258)`
- `--color-rule`: `oklch(88% 0.014 255)`
- `--color-accent`: `oklch(50% 0.19 256)`
- `--color-focus`: `oklch(29% 0.09 256)`

## Typography

- Display: Bahnschrift，700，roman。
- Body: Segoe UI Variable / Segoe UI，400。
- Utility: Cascadia Code / Cascadia Mono，仅用于状态、标识和数据。
- Display tracking: `-0.035em`。
- Type scale anchor: `--text-2xl: 2.441rem`。

## Spacing

沿用 `tokens.css` 中的 4pt 命名尺度。所有新增布局只使用 `--space-*`，不引入临时颜色或字体。

## Motion

- 仅在工作区链接上使用短促的位移或颜色反馈。
- Easings 使用 `--ease-out`、`--ease-in`、`--ease-in-out`。
- Reduced motion 下取消空间位移，状态变化保持即时可见。

## Microinteractions stance

- 键盘焦点立即显示，不动画焦点环。
- 成功切换不弹提示；路由、标题和当前项高亮就是反馈。
- 有人工复核成果时，离开识别工作区前明确提示，避免静默丢失。
- 所有触控入口至少 44 px，链接文字不换行。

## CTA voice

- Primary CTA：钴蓝实心或高对比当前项，文案使用“进入任务编排”等具体动作。
- Secondary CTA：纸面底色与完整边框，不使用渐变、发光或胶囊堆叠。

## Per-page allowances

- 入口页不使用照片或营销型 Hero；目录就是界面。
- 三个工作区不使用装饰性插画，业务画布和数据承担视觉重心。
- 接触网双线基准可作为少量结构性分隔符使用。

## What pages MUST share

- RailDrone 品牌锁定与“DEMO · 未连接实机”状态。
- 三个工作区名称、顺序、路由与当前项高亮。
- Cobalt 配色、字体和控件半径。
- Logo 返回统一入口；工作区之间可直接切换。

## What pages MAY differ on

- 各工作区的业务操作栏、状态文案和主体布局。
- 任务、识别、协同各自的输入输出说明。

## Exports

### tokens.css

```css
:root {
  --color-paper: oklch(98.2% 0.006 255);
  --color-paper-2: oklch(96.2% 0.009 255);
  --color-ink: oklch(22% 0.028 258);
  --color-ink-2: oklch(34% 0.025 258);
  --color-rule: oklch(88% 0.014 255);
  --color-accent: oklch(50% 0.19 256);
  --color-accent-ink: oklch(98.5% 0.006 255);
  --color-focus: oklch(29% 0.09 256);
  --font-display: "Bahnschrift", "Arial Narrow", sans-serif;
  --font-body: "Segoe UI Variable", "Segoe UI", sans-serif;
  --font-mono: "Cascadia Code", "Cascadia Mono", monospace;
}
```

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(98.2% 0.006 255);
  --color-ink: oklch(22% 0.028 258);
  --color-accent: oklch(50% 0.19 256);
  --font-display: "Bahnschrift", sans-serif;
  --font-body: "Segoe UI Variable", sans-serif;
  --spacing-md: 1rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`

```json
{
  "color": {
    "paper": { "$value": "oklch(98.2% 0.006 255)", "$type": "color" },
    "ink": { "$value": "oklch(22% 0.028 258)", "$type": "color" },
    "accent": { "$value": "oklch(50% 0.19 256)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Bahnschrift", "$type": "fontFamily" },
    "body": { "$value": "Segoe UI Variable", "$type": "fontFamily" }
  },
  "space": {
    "md": { "$value": "1rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: 98.2% 0.006 255;
  --foreground: 22% 0.028 258;
  --primary: 50% 0.19 256;
  --primary-foreground: 98.5% 0.006 255;
  --muted: 88% 0.014 255;
  --muted-foreground: 50% 0.018 258;
  --border: 88% 0.014 255;
  --input: 76% 0.022 255;
  --ring: 29% 0.09 256;
  --radius: 0.375rem;
}
```
