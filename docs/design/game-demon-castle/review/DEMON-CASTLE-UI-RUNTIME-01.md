# DEMON-CASTLE-UI-RUNTIME-01｜后续独立复查导航

施工：BDM程序。**本次丝带/入口返修均已独立局部PASS；专属属性图未就绪，整单尚未完成，不得填写整单PASS。**

当前局部结论见[透明丝带](DEMON-CASTLE-UI-RUNTIME-01-ribbon-independent.md)及[最终入口消费集成](DEMON-CASTLE-UI-RUNTIME-01-entry-integration-independent.md)；后者独立257项/27图、六审计、两个锚点撤修与假时钟问题闭环，非施工者签核。本导航不代替这些真实证据，下面保留复查导航与历史范围。

先读[领工边界](../work-orders/DEMON-CASTLE-UI-RUNTIME-01.md)及[当前差异/自证](../self-check/DEMON-CASTLE-UI-RUNTIME-01-alignment.md)。复查≠复述自检：独立复跑其中命令；真实Host四视口及空态/长内容探针；六次深浅审计；锚点transform撤修后确认红、还原复绿；读取全部告警。

特别检查：不改src/ui或用自由DOM；资源来源不造假；icon-only必须原生Tab/Enter且有可访问名称；严格key/AssetManager加载及缺图回退；三类Panel侧栏透底/滚动/互斥/关闭；原型同画布对照、未决差异不能偷删；旧存档、World snapshot/hash与持续输入不变。

当前正式索引38项、slot31项。测试现逐key列出38项，并验证6个active UI key、3张reserved资源图不消费、两属性图missing_asset诊断不变、批准来源/PNG哈希；不能用第三资源图或批准冒充缺失属性图。输入A前真键盘24红的历史须保留；修后扩大84files/722tests通过，真浏览器181项通过（首Tab从body及真实播种菜单优先）。六深浅审计通过。输入唯一锚点撤修6红、恢复37绿，需非施工者独立复跑，不能只抄输出。全库scoped-gate仍在既有33条depcruise退出1；不是本单全库绿。

本文件是导航，不是独立复查结论；待非施工者填写真实实证。

2026-10-16 实机返修新增检查：`status-ink`及calendar必须bare，computed background透明、无独立深色卡，文字不遮月亮且不出ribbon；真浏览器现193项并补两张长状态图。`ribbon-backing`撤修须唯一命中后2红/9绿，恢复11绿。已独立PASS的输入/严格图标合同不覆盖本次视觉返修，透明丝带须另行复查。原型版本不变，PUI未交付前仍保留入口差异。

最新返修集成：透明丝带已有[ribbon局部独立PASS](DEMON-CASTLE-UI-RUNTIME-01-ribbon-independent.md)，PUI交付后Host已用iconOnly外径60/42、准确resolver URL/可访问名称/全入口Tooltip/键徽/浅色焦点环。最终真Host257项、27图，根回归733项及六深浅审计绿；专属属性图仍缺。最终复查须独立跑入口两模式撤修：`entry-icon-only`2红/12绿、`partial-art-ready`1红/27绿（快失败加载不能使好框皮永久停旧树，卸载不得复活），恢复后42项绿。probe含主动abort一个PNG，不应放宽断图断言；世界菜单等待真实rAF后DOM变化并确认HUD未开，不能立即读旧DOM或只验证preventDefault。详见自检末节；这些导航不是复查证据。
