# R3-B2+B3 批量程序证据

状态：程序验证完成，待独立复查；不代表 R3 全量通过。

本批 16 个单位已接入同一份数据驱动运行目录。B2 状态/投射物/区域模板复用现有公共链路；B3 使用统一的冲锋、俯冲、射线、飞行近战、变身和标准投射物形态。未增加单位 ID 专属战斗系统。

通过身份场景：`games/game-mcfight/r3-identity.test.ts` 共 42 项通过，覆盖双实例、三轮攻击、来源清理、死亡取消和实际命中回执。B1/B2 回归与兼容性测试合计 61 项通过。

批次单位：

`stray`、`iceandfire_if_cockatrice`、`cataclysm_the_watcher`、`wither_skeleton`、`blaze`、`twilightforest_fire_beetle`、`twilightforest_winter_wolf`、`iceandfire_stymphalianbird`、`elephant`、`twilightforest_minoshroom`、`vex`、`alexsmobs_farseer`、`alexsmobs_tarantula_hawk`、`mowziesmobs_naga`、`alexsmobs_warped_mosco`、`alexscaves_teleto`。

内容选择器已允许该批 R3 范围，统一通过 `r3-catalog.ts` 编译；磁流灵采用已裁定的飞行远程身份，旧 AOE 字段未消费。16 个单位的 `idle.png` 已由既有 PresentationProfile 路由到商店与战场主体；`vex` 缺少攻击图，表现配置仍标记缺失并保留几何俯冲占位。

验证结果：

- 定向 R3 回归：61/61 通过；
- TypeScript：`tsc --noEmit` 退出 0；
- 构建：`npm run build` 退出 0；
- 独立复查：待提交；S3 复查门仍需复核当前源码后再运行 S4 walkthrough。

限制：本批只证明代表性身份组合和公共机制接入；完整动作素材属于 S6，16 个单位的独立复查和 R3 全量完成仍待复查者确认。
