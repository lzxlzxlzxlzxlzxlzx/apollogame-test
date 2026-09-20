# 原版素材与接线盘点

范围为Assets内图像、音频、字体、预制体、材质、shader、模型、场景、动画与控制器；含第三方素材包。文件数不是游戏实际使用数。完整路径/GUID/PNG尺寸/部分导入信息见assets.json。

| 扩展名 | 数量 |
|---|---:|
| .ogg | 12 |
| .prefab | 697 |
| .mat | 138 |
| .png | 1242 |
| .unity | 4 |
| .fbx | 15 |
| .shader | 22 |
| .tga | 2 |
| .jpg | 4 |
| .ttf | 6 |

## 单位表现

84个idleSprite引用、78个attackSprite引用均解析到存在的文件，共162个直接关联素材；6个attackSprite为空，84个deadSprite为空。没有发现非空单位精灵GUID无法解析。此结论只证明文件与引用存在，未逐张验证透明边界、可读性与美术质量。

当前BattleBridge初始化使用idleSprite，UnitView同步位置/朝向/血条，死亡淡出下沉。攻击图和死亡图字段未被战斗显示读取，没有发现单位动画.clip/AnimatorController文件；不能当成已有挥砍动画序列直接迁移。

## Resources/VFX文件

| 文件 | PNG尺寸 | spriteMode | 序列化切片数 |
|---|---|---:|---:|
| [Assets/Resources/VFX/Area/CFX3_Vortex_Ground_Outward.prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Area/CFX3_Vortex_Ground_Outward.prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Area/CFX3_VortexTornado.prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Area/CFX3_VortexTornado.prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Area/CFXR ScreenDistortion Ring.prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Area/CFXR ScreenDistortion Ring.prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Area/CFXR ScreenDistortion Sphere.prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Area/CFXR ScreenDistortion Sphere.prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Area/CFXR3 LightGlow C (Loop).prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Area/CFXR3 LightGlow C (Loop).prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Area/CFXR3 Magic Aura A (Runic).prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Area/CFXR3 Magic Aura A (Runic).prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Area/CFXR3 Sky Rays (Loop).prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Area/CFXR3 Sky Rays (Loop).prefab>) | — | — | 0 |
| [Assets/Resources/VFX/beam_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/beam_spritesheet.png>) | 12000×500 | 2 | 24 |
| [Assets/Resources/VFX/bigexplosion_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/bigexplosion_spritesheet.png>) | 8000×267 | 2 | 20 |
| [Assets/Resources/VFX/closeaoe_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/closeaoe_spritesheet.png>) | 1864×215 | 2 | 8 |
| [Assets/Resources/VFX/crosshair_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/crosshair_spritesheet.png>) | 64×64 | 2 | 1 |
| [Assets/Resources/VFX/Death/CFXR3 Hit Misc F Smoke Only.prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Death/CFXR3 Hit Misc F Smoke Only.prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Death/CFXR3 Hit Misc F Smoke.prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Death/CFXR3 Hit Misc F Smoke.prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Explosion/CFXR3 Fire Explosion A.prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Explosion/CFXR3 Fire Explosion A.prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Explosion/CFXR3 Fire Explosion B.prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Explosion/CFXR3 Fire Explosion B.prefab>) | — | — | 0 |
| [Assets/Resources/VFX/fireball_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/fireball_spritesheet.png>) | 5600×350 | 2 | 16 |
| [Assets/Resources/VFX/firebreath_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/firebreath_spritesheet.png>) | 10240×512 | 2 | 20 |
| [Assets/Resources/VFX/firerain_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/firerain_spritesheet.png>) | 3520×50 | 2 | 55 |
| [Assets/Resources/VFX/Hit/CFXR3 Hit Fire B (Air).prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Hit/CFXR3 Hit Fire B (Air).prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Hit/CFXR3 Hit Ice B (Air).prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Hit/CFXR3 Hit Ice B (Air).prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Hit/CFXR3 Hit Light A (Air).prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Hit/CFXR3 Hit Light A (Air).prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Hit/CFXR3 Hit Light B (Air).prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Hit/CFXR3 Hit Light B (Air).prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Hit/CFXR3 Hit Light C (Air).prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Hit/CFXR3 Hit Light C (Air).prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Hit/CFXR3 Hit Misc A.prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Hit/CFXR3 Hit Misc A.prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Hit/CFXR3 Hit Misc B.prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Hit/CFXR3 Hit Misc B.prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Hit/CFXR3 Hit Misc C.prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Hit/CFXR3 Hit Misc C.prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Hit/CFXR3 Hit Misc D.prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Hit/CFXR3 Hit Misc D.prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Hit/CFXR3 Hit Misc E Skull.prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Hit/CFXR3 Hit Misc E Skull.prefab>) | — | — | 0 |
| [Assets/Resources/VFX/Hit/CFXR3 Hit Misc F Smoke Only.prefab](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/Hit/CFXR3 Hit Misc F Smoke Only.prefab>) | — | — | 0 |
| [Assets/Resources/VFX/hitmark_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/hitmark_spritesheet.png>) | 2196×220 | 2 | 9 |
| [Assets/Resources/VFX/holyaoe_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/holyaoe_spritesheet.png>) | 8800×600 | 2 | 11 |
| [Assets/Resources/VFX/icemist_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/icemist_spritesheet.png>) | 3280×240 | 2 | 20 |
| [Assets/Resources/VFX/lava_circle.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/lava_circle.png>) | 160×160 | 1 | 0 |
| [Assets/Resources/VFX/meteor_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/meteor_spritesheet.png>) | 16400×470 | 2 | 41 |
| [Assets/Resources/VFX/obelisk_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/obelisk_spritesheet.png>) | 15400×640 | 2 | 22 |
| [Assets/Resources/VFX/projectile_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/projectile_spritesheet.png>) | 6800×94 | 2 | 34 |
| [Assets/Resources/VFX/sandstorm_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/sandstorm_spritesheet.png>) | 16184×384 | 2 | 34 |
| [Assets/Resources/VFX/shockwave_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/shockwave_spritesheet.png>) | 1205×243 | 2 | 5 |
| [Assets/Resources/VFX/slash_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/slash_spritesheet.png>) | 936×196 | 2 | 4 |
| [Assets/Resources/VFX/smallexplosion_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/smallexplosion_spritesheet.png>) | 3000×169 | 2 | 10 |
| [Assets/Resources/VFX/soundwave_spritesheet.png](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Resources/VFX/soundwave_spritesheet.png>) | 6000×250 | 2 | 24 |

切片数是.meta中序列化name项数量，不是Unity运行时加载验证。spriteMode=1是单张，=2为多精灵。

## 技能直接命名VFX

| 调用名 | 预期Resource | 文件匹配 | 直接技能使用者 |
|---|---|---|---|
| bigexplosion | VFX/bigexplosion_spritesheet | 存在 | NucleeperAbility, ExplosiveAbility |
| closeaoe | VFX/closeaoe_spritesheet | 存在 | CoralLeapAbility, DeepOneMageAbility, FrostmawAbility, ForsakenAbility |
| crosshair | VFX/crosshair_spritesheet | 存在 | WarlockAbility |
| fireball | VFX/fireball_spritesheet | 存在 | BlazeAbility |
| firebreath | VFX/firebreath_spritesheet | 存在 | ConeBreathAbility |
| firerain | VFX/firerain_spritesheet | 存在 | WarlockAbility |
| hitmark | VFX/hitmark_spritesheet | 存在 | 共用表现路径 |
| holyaoe | VFX/holyaoe_spritesheet | 存在 | PriestAbility |
| icemist | VFX/icemist_spritesheet | 存在 | ConeBreathAbility, FrostmawAbility |
| lava_circle | VFX/lava_circle_spritesheet | **未找到** | LuxtructosaurusAbility |
| meteor | VFX/meteor_spritesheet | 存在 | LuxtructosaurusAbility |
| obelisk | VFX/obelisk_spritesheet | 存在 | WadjetAbility, RemnantAbility |
| shockwave | VFX/shockwave_spritesheet | 存在 | KobolediatorAbility, RemnantAbility |
| smallexplosion | VFX/smallexplosion_spritesheet | 存在 | 共用表现路径 |
| soundwave | VFX/soundwave_spritesheet | 存在 | RevenantAbility, ForsakenAbility |

此表是直接VFXSpriteView调用，并非全部表现依赖。ProjectileView共享projectile/soundwave序列，BeamView共享beam序列，SlashView共享slash序列；AreaEffectView使用lava_circle单张、icemist/sandstorm序列，Pollution有颜色表现。BattleBridge按伤害类别使用hitmark/smallexplosion。几何光束、蛇身和头部等还通过程序视图绘制，不能简单等同于一张技能贴图。

## 音频、场景与其他资源

12个ogg文件包含Assets/Audio/UI与Kenney素材源目录中的UI音效；不代表12种独立战斗音效。UISoundPlayer有点击/切换/轻触/取消槽，没有逐单位技能音频绑定表。4个场景文件包括第三方演示场景。第三方包中的大量预制体仅登记候选库存，不宣称都已接入MC Fight。

## 新版素材配置待补

每个单位×技能表现绑定至少要确认：动作序列及锚点、朝向/镜像、前摇/生效/后摇事件、预警形状、判定原点、长度/宽度/角度换算、弹丸与命中特效、受击/死亡、音效、打断后的清理。以统一命中几何驱动范围预览与表现，不能按图片看起来多大倒推伤害范围。新数据结构仍以S1设计稿为准，不在本盘点创建正式运行时素材schema。
