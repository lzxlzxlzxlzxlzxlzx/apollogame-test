---
name: module-audio
description: ZeroCraft 音频模块线。做音效、打击感声反馈、BGM、静音开关之前调它。声音 = 数据（SfxSpec），走 SynthAudioPort，不手写 AudioContext 调用散在游戏里。
when_to_use: 给游戏加声音、做打击感音反馈、接静音开关之前。
---

# 音频（module-audio）

**权威手册**：`docs/playbooks/audio.md`（最薄的一本之一）。正样例：game-g。

## 基座件（实名）
`SynthAudioPort`（音频端口）· **`SfxSpec`（音效 = 数据）**。

## 要义
**声音是数据不是代码**——你描述「这是一个什么样的音」（`SfxSpec`），端口负责发声。
游戏层不散落 `new AudioContext()` / `osc.start()` 这类调用。

## 本线红线
- **无 `AudioContext` 必须静默降级**，不炸测试 / 不炸 SSR（CI 里没有声卡）。
- 音效触发走**具名信号**（`/module-events` 的信号铁律），不在 handler 里直接发声。
- 静音位属局外小态 → `/module-save` 的 `localStore` + `flagCodec`（与既有静音键字节兼容），别自己存。

## 查不到怎么办
`SfxSpec` 表达不了你要的音 → 走 **`/ask-owner`** 申请扩字段，**绝不手写自由音频代码**。

## 交付前
无音频环境下跑测试必须绿；`node scripts/game-skill-audit.mjs <slug>` 零红旗；宣称做完前跑 **`/align-check`**。
