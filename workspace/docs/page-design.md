---
name: <项目名>
description: 业务页面视觉规范（空壳模板，由 PM 填充）
version: alpha
colors: {}
typography: {}
rounded: {}
spacing: {}
components: {}
---

> **⚠️ 这是 page-design.md 的空壳模板，尚未填充实际规范。**
>
> PM 复制 PM-Framework 模板启动新项目后，根据具体业务的视觉要求填充下方 YAML token 与 Markdown 理念。
>
> **填充后**，AI 在生成/修改 `workspace/pages/*.html` 且 PM Prompt 未显式指定视觉细节时，会读取此文件作为业务视觉基线。
>
> **使用规则详见** `framework/rules/AI_INSTRUCTIONS.md` 中的"业务页面视觉规范（page-design.md）使用规则"。
>
> **格式参考** `framework/rules/DESIGN.md`（框架层规范），但两者约束对象不同，互不参考。
>
> **YAML 字段说明**（上方 front matter）：
> - `colors`：业务页面配色 token（primary/secondary/accent/neutral 等）
> - `typography`：字号 token（h1/h2/body-md/body-sm 等，含 fontFamily/FontSize/fontWeight）
> - `rounded`：圆角体系（sm/md/lg 等，值为 px）
> - `spacing`：间距体系（sm/md/lg 等，值为 px）
> - `components`：业务页面复用组件 token（button-primary/card/input 等）
>
> 填充时把 `{}` 替换为实际 token 对象，结构参考根目录 `DESIGN.md`。

## Overview

<!-- 说明本项目的视觉风格定位、设计理念、目标用户等。
     示例："医疗 SaaS 系统，风格专业克制、信息密度高，参考 Linear/Notion 的工具类产品质感。" -->

## Colors

<!-- 定义业务页面的配色 token。示例：
primary: "#0F172A"
secondary: "#475569"
accent: "#2563EB"
neutral: "#F8FAFC"
-->

## Typography

<!-- 定义字号 token。示例：
h1:
  fontFamily: ui-sans-serif, system-ui, -apple-system
  fontSize: 2rem
  fontWeight: 600
body-md:
  fontFamily: ui-sans-serif, system-ui, -apple-system
  fontSize: 1rem
  fontWeight: 400
-->

## Layout

<!-- 定义布局规则：栅格、栏宽、间距体系等。 -->

## Elevation & Depth

<!-- 定义阴影、层次规则。 -->

## Shapes

<!-- 定义圆角体系。示例：
rounded:
  sm: 4px
  md: 8px
  lg: 12px
-->

## Components

<!-- 定义业务页面中复用的组件 token。示例：
button-primary:
  backgroundColor: "{colors.accent}"
  textColor: "#FFFFFF"
  rounded: "{rounded.md}"
-->

## Do's and Don'ts

<!-- 业务页面的视觉红线。示例：
✅ 优先使用 token 中定义的数值
🚫 不要在业务页面使用框架层的 indigo 色（避免与工作台外壳混淆）
-->
