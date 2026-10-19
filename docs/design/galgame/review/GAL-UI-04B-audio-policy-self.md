# GAL-UI-04B-2C 主音量与失焦静音施工自证

- 施工主体：GAL 主程 `/root`，2026-10-12。工单在源码编辑前登记于 `docs/design/galgame/requests.md`。
- 范围：`GalProfile` V3 迁移及保存接口、GAL 音频增益与浏览器焦点输入、声音页已有主音量/失焦 Toggle 接线、定向测试与静态浏览器验收。没有改 PUI 基座、剧情 World 或正式资产。
- 判断：`PreferenceDefaults` 是作品包默认值，设备焦点是宿主表现事实；主音量/失焦政策归同包 Profile，焦点事实不写 World/存档。语音自动关闭后原型缺手动重播入口，本票保持禁用。

## 自证

1. V1→V2→V3 与 V2→V3 信封迁移均由 `openEnvelope` 逐步执行；V3 默认 `masterVolume:1`、`focusMute:false`，保留六项确认、已读和解锁，读旧档不原地写。恶意未来 schema、坏值/形状仍拒绝；主音量和失焦政策与其他 Profile 写同包串行。
2. 增益为 `masterVolume × channelVolume × BGM scene/defaultGain`；失焦且开启政策时三通道即时为 0，恢复焦点只热更新音量，BGM 不重播。声音页闭集动作仅在有音频端口时开放，写成功才更新可见数值；失败触发原控件重绘恢复。
3. 定向 Profile+协调器+宿主测试：5 文件 **42/42**；最终 GAL/UI/Profile/存档/音频/语音/装配相邻回归 **89 文件 722/722**，退出码 0。最初旧断言仍期待 V2 和新测试误算 BGM 默认增益导致红，按版本链及包内 `.8 × .5` 规格修正后复跑通过。
4. `node src/services/gal-ui/verify-gal-audio-live.mjs --transient-shots` 退出码 0：隔离静态 `file://` Edge、纯内存 KV；真实 WAV 主音量/三声道滑杆、失焦静音与焦点恢复、试听、失败恢复、滚轮/同 ref 读档/回想/重开及卸载停播通过。第一次脚本误点隐藏 checkbox input，改为可见 label 后复跑通过；浏览器及临时构建已关闭/清理。没有真实数据库或应用服务。
5. 深/亮 `ui-audit` 各退出码 0，重叠/硬对比/border-image 阻断均 0。亮主题标题 3.57:1 大字非阻断警告、暗主题华丽度 1 警告仍留 S5 视觉票。`npx tsc --noEmit --pretty false` 退出码 1，输出为其他游戏及 launcher 诊断；本轮未观察到 GAL/Profile/audio 文件诊断，不能宣称全库门禁通过。

## 未签

本自证不是独立复查。语音自动、文字逐字完成、画面设置、全项恢复默认、桌面退出、V2 视觉/演出 1:1 与全库门禁仍未通过；`ui-settings-confirmations` 继续 active。
