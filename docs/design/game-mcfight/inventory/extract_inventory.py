"""Read-only Unity content extraction. Outputs evidence here, never game runtime data."""
from pathlib import Path
import re, json, hashlib, collections, struct

OUT = Path(__file__).resolve().parent
SRC = OUT.parents[4] / 'mcfight-unity-main'
def read(p): return p.read_text(encoding='utf-8-sig')
def rel(p): return p.relative_to(SRC).as_posix()
def write(name, value): (OUT/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def link(p, line=None): return f'[{rel(p)}](<{p.as_posix()}' + (f':{line}' if line else '') + '>)'
def scalar(s):
    s=s.strip()
    if s.startswith('"'): return json.loads(s)
    try: return float(s) if '.' in s else int(s)
    except ValueError: return s

assert (SRC/'Assets').is_dir(), SRC
configs=json.loads(read(SRC/'Assets/Resources/monster_config.json'))['monsters']
assert len({c['monsterId'] for c in configs})==len(configs)
cfg={c['monsterId']: c for c in configs}
factory=dict(re.findall(r'case "([^"]+)": return new (\w+)\(',read(SRC/'Assets/Scripts/Simulation/Abilities/AbilityFactory.cs')))
classes={}
for p in sorted((SRC/'Assets/Scripts/Simulation/Abilities').glob('*.cs')):
    s=read(p); starts=list(re.finditer(r'public class (\w+)\s*:\s*IAbilityComponent',s))
    for i,m in enumerate(starts):
        end=starts[i+1].start() if i+1<len(starts) else len(s)
        chunk=s[m.start():end]
        classes[m[1]]={'source':rel(p),'line':s[:m.start()].count('\n')+1,
          'requestedParams':sorted(set(re.findall(r'GetAbilityParam(?:Int)?\([^,]+,\s*"([^"]+)"',chunk))),
          'antiAirExpression':re.findall(r'bool AllowAntiAir[^\n]*=>\s*([^;]+)',chunk),
          'engageRangeExpression':re.findall(r'float GetEngageRange[^\n]*=>\s*([^;]+)',chunk),
          'busyExpression':re.findall(r'bool IsBusy[^\n]*=>\s*([^;]+)',chunk),
          'literalVfx':sorted(set(re.findall(r'VFXSpriteView.Play\("([^"]+)"',chunk))),
          'sourceText':chunk}

guidmap={}
for p in (SRC/'Assets').rglob('*.meta'):
    s=read(p); m=re.search(r'^guid: (\w+)',s,re.M)
    if m: guidmap[m[1]]=p.with_suffix('')
designpath=SRC/'Assets/Docs/MonsterDesign.md'; design=read(designpath)
heads=list(re.finditer(r'^#{2,3} .*$',design,re.M))
sections={}
for i,h in enumerate(heads):
    text=design[h.start():heads[i+1].start() if i+1<len(heads) else len(design)]
    for mid in cfg:
        if re.search(r'\('+re.escape(mid)+r'\)',h[0]):
            sections[mid]={'source':rel(designpath),'line':design[:h.start()].count('\n')+1,'text':text}
sections['twilightforest_skeleton_druid']=sections.get('twilightforest_king_spider')

units=[]; numbers=['price','hp','attack','armor','armorToughness','moveSpeed','attackRange','attackInterval','radius']
for p in sorted((SRC/'Assets/Resources/Monsters').glob('*.asset')):
    s=read(p); fields={m[1]:scalar(m[2]) for m in re.finditer(r'^  (\w+):([^\n]*)',s,re.M)}
    mid=fields['monsterId']; config=cfg[mid]
    tagblock=re.search(r'^  tags:\s*\n((?:  -[^\n]*\n)*)',s,re.M)
    tags=re.findall(r'^  - (.*)',tagblock[1],re.M) if tagblock else []
    so={k:fields[k] for k in numbers}; effective={k:config[k] for k in numbers}
    typ=fields['abilityComponentType']; resolved=factory.get(typ)
    route='factory' if resolved else 'fallback'
    if not resolved: resolved='ExplosiveAbility' if 'explosive' in tags else 'RangedAbility' if fields['attackType']==1 else 'AoeMeleeAbility' if 'aoe_melee' in tags else 'MeleeAbility'
    assert resolved in classes, resolved
    required=classes[resolved]['requestedParams'][:]
    if resolved=='ExplosiveAbility': required=['explodeRadius','fuseDuration','centerDamage']+(['edgeDamage'] if mid=='alexscaves_nucleeper' else [])
    params=config.get('abilityParams',[]); values={}
    for par in params: values.setdefault(par['key'],par['value'])
    duplicates=[k for k,n in collections.Counter(a['key'] for a in params).items() if n>1]
    sprites={}
    for slot in ['idleSprite','attackSprite','deadSprite']:
        raw=str(fields[slot]); g=re.search(r'guid: (\w+)',raw); fid=re.search(r'fileID: (-?\d+)',raw)
        path=guidmap.get(g[1]) if g else None
        sprites[slot]={'guid':g[1] if g else None,'fileID':int(fid[1]) if fid else None,'path':rel(path) if path else None,'exists':path.exists() if path else False}
    hit=re.search(r'^  onHitEffects:([^\n]*)',s,re.M)[1].strip(); effects=[]
    if hit:
        # Unity serializes enum arrays as little-endian int32 hex.
        effects=[['Poison','Burn','Wither','Slow','Fear','Freeze','Stun'][v[0]] for v in struct.iter_unpack('<i',bytes.fromhex(hit.zfill(8) if len(hit)<8 else hit))]
    hits=[{'line':i+1,'text':line} for i,line in enumerate(design.splitlines()) if re.search(r'(?<![\w])'+re.escape(mid)+r'(?![\w])',line)]
    units.append({'monsterId':mid,'displayName':fields['displayName'],'description':fields.get('description',''),
      'sourceAsset':rel(p),'sourceConfig': 'Assets/Resources/monster_config.json','sourceConfigEntry':config,'sourceSO':so,'effectiveAttributes':effective,
      'attributeOverrides':{k:{'SO':so[k],'JSON':effective[k]} for k in numbers if so[k]!=effective[k]},
      'moveType':'Fly' if fields['moveType']==1 else 'Ground','attackType':'Ranged' if fields['attackType']==1 else 'Melee',
      'tags':tags,'declaredOnHitEffects':effects,'declaredAbilityType':typ,'resolvedAbility':resolved,'bindingRoute':route,
      'shopVisibleByPrice':effective['price']>0,'abilityParams':params,'firstWinsParams':values,
      'requestedParams':required,'missingParams':sorted(set(required)-set(values)),
      'paramsNotReadByBoundAbility':sorted(set(values)-set(required)),'duplicateParams':duplicates,
      'sprites':sprites,'oldDesignSection':sections.get(mid),'oldDesignMentions':hits,
      'newGameDisposition':'待逐单位裁定；不是新版已批准配置','evidenceLevel':'静态源代码与资源引用盘点；未运行Unity验证'})
assert len(units)==84 and {u['monsterId'] for u in units}==set(cfg)
write('units.json',units)
write('ability-code-evidence.json',classes)

assets=[]
sprite_users=collections.defaultdict(list)
for u in units:
    for slot,ref in u['sprites'].items():
        if ref['path']: sprite_users[ref['path']].append(u['monsterId']+':'+slot)
extensions={'.png','.jpg','.jpeg','.tga','.psd','.gif','.bmp','.wav','.mp3','.ogg','.ttf','.otf','.prefab','.mat','.shader','.anim','.controller','.fbx','.unity'}
for p in sorted((SRC/'Assets').rglob('*')):
    if p.is_file() and p.suffix.lower() in extensions:
        meta=p.with_name(p.name+'.meta'); ms=read(meta) if meta.exists() else ''; g=re.search(r'^guid: (\w+)',ms,re.M)
        a={'path':rel(p),'bytes':p.stat().st_size,'guid':g[1] if g else None,'extension':p.suffix.lower(),
           'unitReferences':sprite_users.get(rel(p),[])}
        if p.suffix.lower()=='.png':
            b=p.read_bytes()[:24]
            if b[:8]==b'\x89PNG\r\n\x1a\n': a['width'],a['height']=struct.unpack('>II',b[16:24])
        if ms:
            for key in ['spriteMode','spritePixelsToUnits','spritePivot']:
                m=re.search(r'^  '+key+r': (.*)$',ms,re.M)
                if m: a[key]=scalar(m[1])
            a['serializedSpriteNames']=re.findall(r'^      name: (.*)',ms,re.M)
        assets.append(a)
write('assets.json',assets)
csfiles=list((SRC/'Assets/Scripts').rglob('*.cs')); sources={p:read(p) for p in csfiles}
vfxnames=set()
for s in sources.values(): vfxnames.update(re.findall(r'VFXSpriteView.Play\("([^"]+)"',s))
vfxnames.update(['firebreath','icemist']) # conditional ConeBreath call
vfx=[]
for n in sorted(vfxnames):
    paths=[a['path'] for a in assets if a['path'].startswith('Assets/Resources/VFX/') and Path(a['path']).stem==n+'_spritesheet']
    vfx.append({'name':n,'expectedResource':'VFX/'+n+'_spritesheet','matchingFiles':paths,
      'abilityUsers':[k for k,v in classes.items() if n in v['literalVfx'] or k=='ConeBreathAbility' and n in ['firebreath','icemist']],
      'verification':'文件匹配，不代表Unity切片加载或视觉对齐通过'})
write('vfx-bindings.json',vfx)
tags=[]
for t in sorted({t for u in units for t in u['tags']}):
    refs=[{'source':rel(p),'line':i+1,'text':l.strip()} for p,s in sources.items() for i,l in enumerate(s.splitlines()) if '"'+t+'"' in l]
    tags.append({'tag':t,'units':[u['monsterId'] for u in units if t in u['tags']],'literalSourceMentions':refs})
write('tags.json',tags)
manifest=[]
for p in sorted(set(csfiles+list((SRC/'Assets/Resources').rglob('*.json'))+list((SRC/'Assets/Resources/Monsters').glob('*.asset'))+list((SRC/'Assets/Docs').glob('*.md')))):
    manifest.append({'path':rel(p),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
write('source-manifest.json',{'sourceRoot':str(SRC),'scope':'脚本、Resources JSON、单位asset、旧设计文档；素材列表另见assets.json','files':manifest})
summary={'units':len(units),'shopUnits':sum(u['shopVisibleByPrice'] for u in units),'hiddenUnits':sum(not u['shopVisibleByPrice'] for u in units),
 'flyUnits':sum(u['moveType']=='Fly' for u in units),'rangedAttributeUnits':sum(u['attackType']=='Ranged' for u in units),
 'customBoundUnits':sum(u['bindingRoute']=='factory' for u in units),'abilityClasses':len(classes),'usedAbilityClasses':len(set(u['resolvedAbility'] for u in units)),
 'assetFiles':len(assets),'assetExtensions':dict(collections.Counter(a['extension'] for a in assets)),
 'unitsWithMissingParams':{u['monsterId']:u['missingParams'] for u in units if u['missingParams']},
 'unitsWithDuplicateParams':{u['monsterId']:u['duplicateParams'] for u in units if u['duplicateParams']},
 'unitsWithUnconsumedParamCandidates':sum(bool(u['paramsNotReadByBoundAbility']) for u in units),
 'unconsumedParamCandidateCount':sum(len(u['paramsNotReadByBoundAbility']) for u in units),
 'unresolvedNonemptySprites':[u['monsterId']+':'+k for u in units for k,v in u['sprites'].items() if v['fileID'] and not v['exists']],
 'emptySpriteSlots':dict(collections.Counter(k for u in units for k,v in u['sprites'].items() if not v['fileID'])),
 'missingVfxFiles':[v['name'] for v in vfx if not v['matchingFiles']],
 'unitsWithDetailedOldDesign':sum(bool(u['oldDesignSection']) for u in units),'unitsWithoutOldDesignMention':[u['monsterId'] for u in units if not u['oldDesignMentions']]}
write('coverage.json',summary)

profiles=json.loads((OUT/'mechanism-profiles.json').read_text(encoding='utf-8')) if (OUT/'mechanism-profiles.json').exists() else {}
md=['# 原版单位全量档案（84种）','', '证据口径：静态盘点。基础属性为 JSON 覆盖 SO 后的值；技能实际命中数值可能由代码另行决定。距离单位沿用原版世界坐标，时间为秒。未采纳为新版配置。', '',
 '技能参数“未读取”只表示绑定技能没有 GetAbilityParam 读取该键，不能推定其他工具完全不用它；读取过也不保证参与最终结算。源码表达式及原文在 ability-code-evidence.json。', '', '| 单位 | ID | 价格 | HP | 攻击属性 | 技能实现 |', '|---|---|---:|---:|---:|---|']
for u in units:
    a=u['effectiveAttributes']; md.append(f"| [{u['displayName']}](#{u['monsterId']}) | {u['monsterId']} | {a['price']} | {a['hp']} | {a['attack']} | {u['resolvedAbility']} |")
for u in units:
    a=u['effectiveAttributes']; c=classes[u['resolvedAbility']]
    md += ['',f"<a id=\"{u['monsterId']}\"></a>",f"## {u['displayName']} · {u['monsterId']}",'',
     f"来源：{link(SRC/u['sourceAsset'])}；实现：{link(SRC/c['source'],c['line'])}。",'',
     '| 价格 | HP | 攻击属性 | 护甲 | 韧性 | 移速 | 射程属性 | 攻击间隔属性 | 碰撞半径 |','|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
     '| '+' | '.join(str(a[k]) for k in numbers)+' |','',
     f"移动/攻击类型：{u['moveType']} / {u['attackType']}；商店：{'按价格可见' if u['shopVisibleByPrice'] else '价格≤0隐藏，非正常购买'}。",
     f"标签：{', '.join(u['tags']) or '无'}。声明附带状态：{', '.join(u['declaredOnHitEffects']) or '无'}（是否施加取决于实现）。",
     f"技能绑定：{u['declaredAbilityType'] or '空'} → {u['resolvedAbility']}（{u['bindingRoute']}）。",'',
     '**实际代码行为摘要**：'+profiles.get(u['resolvedAbility'],'参见技能源码证据。'),'',
     '交战距离表达式：`'+ '; '.join(c['engageRangeExpression'])+'`；对空许可表达式：`'+'; '.join(c['antiAirExpression'])+'`。这不代表每个子技能都能对空。',
     '忙碌表达式：`'+'; '.join(c['busyExpression'])+'`。全局调度/控制状态的影响见 shared-rules.md。','',
     '**技能参数（JSON原顺序，重复项保留）**','', '| 参数 | 值 | 注释 | 绑定技能读取 |','|---|---:|---|---|']
    for par in u['abilityParams']: md.append(f"| {par['key']} | {par['value']} | {par.get('_comment','')} | {'是' if par['key'] in u['requestedParams'] else '未发现'} |")
    if not u['abilityParams']: md.append('| 无 | — | — | — |')
    md += ['',f"缺少读取参数：{', '.join(u['missingParams']) or '无'}；重复键：{', '.join(u['duplicateParams']) or '无'}。",'',
     '**SO → JSON 数值差异**：'+('；'.join(f"{k}: {v['SO']} → {v['JSON']}" for k,v in u['attributeOverrides'].items()) or '无')+'。','', '**素材绑定**','']
    for k,v in u['sprites'].items(): md.append('- '+k+'：'+(link(SRC/v['path']) if v['path'] else '未绑定/未解析')+f"；fileID={v['fileID']}。")
    md+=['','战斗显示路径读取idleSprite；attackSprite/deadSprite不应视为已接线的动画。精灵切片、锚点与范围尚未进行画面验收。','', '**旧设计意图（单独保留，不等于代码实现）**','']
    if u['oldDesignSection']:
        sec=u['oldDesignSection']; md += [f"详见 {link(designpath,sec['line'])}；完整原文已保存于 units.json 的 oldDesignSection。"]
    else:
        md += [link(designpath,m['line'])+'：'+m['text'] for m in u['oldDesignMentions']]
        if not u['oldDesignMentions']: md+=['没有按完整ID找到旧设计条目，需按别名核对。']
    md+=['','**新版处理**：待裁定保留/调整/延后/删除；此档案不冻结新数值。']
(OUT/'units.md').write_text('\n'.join(md)+'\n',encoding='utf-8')
mechanisms=['# 原版技能实现与机制目录','','这是代码行为目录。一个旧类可能包含多个技能；提议的新机制类别不是Apollo现有能力名。详细公式、条件、时间和调用原文保存在ability-code-evidence.json。','']
for name,c in classes.items():
    users=[u for u in units if u['resolvedAbility']==name]
    mechanisms += [f'## {name}','', '使用单位：'+('、'.join(u['displayName']+'('+u['monsterId']+')' for u in users) or '84种当前绑定中未使用')+'。','',
      profiles.get(name,'空实现占位；不执行技能。'),'', '来源：'+link(SRC/c['source'],c['line'])+'。','',
      '读取参数：'+(', '.join(c['requestedParams']) or '无直接GetAbilityParam读取；通用爆炸由注册器传参')+'。','',
      '直接命名VFX：'+(', '.join(c['literalVfx']) or '无；仍可能走弹丸/光束/伤害事件共用表现')+'。','']
(OUT/'mechanisms.md').write_text('\n'.join(mechanisms),encoding='utf-8')
art=['# 原版素材与接线盘点','','范围为Assets内图像、音频、字体、预制体、材质、shader、模型、场景、动画与控制器；含第三方素材包。文件数不是游戏实际使用数。完整路径/GUID/PNG尺寸/部分导入信息见assets.json。','','| 扩展名 | 数量 |','|---|---:|']
art += [f'| {k} | {v} |' for k,v in summary['assetExtensions'].items()]
art += ['', '## 单位表现','','84个idleSprite引用、78个attackSprite引用均解析到存在的文件，共162个直接关联素材；6个attackSprite为空，84个deadSprite为空。没有发现非空单位精灵GUID无法解析。此结论只证明文件与引用存在，未逐张验证透明边界、可读性与美术质量。','',
 '当前BattleBridge初始化使用idleSprite，UnitView同步位置/朝向/血条，死亡淡出下沉。攻击图和死亡图字段未被战斗显示读取，没有发现单位动画.clip/AnimatorController文件；不能当成已有挥砍动画序列直接迁移。', '',
 '## Resources/VFX文件','','| 文件 | PNG尺寸 | spriteMode | 序列化切片数 |','|---|---|---:|---:|']
for a in assets:
    if a['path'].startswith('Assets/Resources/VFX/'):
        art.append('| '+link(SRC/a['path'])+' | '+(str(a['width'])+'×'+str(a['height']) if 'width' in a else '—')+' | '+str(a.get('spriteMode','—'))+' | '+str(len(a.get('serializedSpriteNames',[])))+' |')
art += ['', '切片数是.meta中序列化name项数量，不是Unity运行时加载验证。spriteMode=1是单张，=2为多精灵。','',
 '## 技能直接命名VFX','','| 调用名 | 预期Resource | 文件匹配 | 直接技能使用者 |','|---|---|---|---|']
for v in vfx: art.append('| '+v['name']+' | '+v['expectedResource']+' | '+('存在' if v['matchingFiles'] else '**未找到**')+' | '+(', '.join(v['abilityUsers']) or '共用表现路径')+' |')
art += ['', '此表是直接VFXSpriteView调用，并非全部表现依赖。ProjectileView共享projectile/soundwave序列，BeamView共享beam序列，SlashView共享slash序列；AreaEffectView使用lava_circle单张、icemist/sandstorm序列，Pollution有颜色表现。BattleBridge按伤害类别使用hitmark/smallexplosion。几何光束、蛇身和头部等还通过程序视图绘制，不能简单等同于一张技能贴图。','',
 '## 音频、场景与其他资源','','12个ogg文件包含Assets/Audio/UI与Kenney素材源目录中的UI音效；不代表12种独立战斗音效。UISoundPlayer有点击/切换/轻触/取消槽，没有逐单位技能音频绑定表。4个场景文件包括第三方演示场景。第三方包中的大量预制体仅登记候选库存，不宣称都已接入MC Fight。','',
 '## 新版素材配置待补','','每个单位×技能表现绑定至少要确认：动作序列及锚点、朝向/镜像、前摇/生效/后摇事件、预警形状、判定原点、长度/宽度/角度换算、弹丸与命中特效、受击/死亡、音效、打断后的清理。以统一命中几何驱动范围预览与表现，不能按图片看起来多大倒推伤害范围。新数据结构仍以S1设计稿为准，不在本盘点创建正式运行时素材schema。']
(OUT/'assets.md').write_text('\n'.join(art)+'\n',encoding='utf-8')
tagdoc=['# 原版标签目录','','完整源代码字面值引用见tags.json。没有字面值命中只表示未找到直接命名使用，不证明动态逻辑永不使用。标签不自动等于新版状态或能力。','','| 标签 | 单位 | 代码引用处数 |','|---|---|---:|']
for t in tags: tagdoc.append('| '+t['tag']+' | '+', '.join(t['units'])+' | '+str(len(t['literalSourceMentions']))+' |')
(OUT/'tags.md').write_text('\n'.join(tagdoc)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
