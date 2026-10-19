#!/usr/bin/env python3
"""卡带库体检：逐盘看「它到底是不是那份固定样例」（owner 2026-08-26「所有游戏启动都是同一个」）。

**只读**——不改任何文件。回答三个问题：
  ① 这盘卡带的 manifest 是不是 mock/模板的内置样例（= 一个可控方块 + 地面 + 三个平台方块）？
  ② 它是谁造的（meta.provider）、什么时候造的/改的？
  ③ 全库有多少盘是同一份内容（按 manifest 指纹分组）——「点谁都一样」的直接证据。

用法：python3 scripts/library-mock-scan.py [库目录]
     缺省库目录 = library/（ZEROCRAFT_LIBRARY_DIR 覆盖）
退出码恒 0（体检不是门禁）。
"""
import hashlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def canon(manifest: dict) -> str:
    """只按「玩法内容」取指纹：capabilities + entities（忽略 name/描述等元信息）。"""
    return hashlib.sha1(json.dumps(
        {'c': sorted(manifest.get('capabilities') or []), 'e': manifest.get('entities') or {}},
        ensure_ascii=False, sort_keys=True,
    ).encode('utf-8')).hexdigest()[:12]


def known_stubs() -> dict:
    """内置样例的指纹表：mock 产物 + 各低模模板。命中即「这不是真生成的内容」。"""
    out = {}
    try:
        from main_entry.blueprints import PRESET_BLUEPRINTS
        for k, v in PRESET_BLUEPRINTS.items():
            out[canon({'capabilities': v.get('capabilities'), 'entities': v.get('entities')})] = f'内置预设 {k}'
    except Exception as e:
        print(f'  ⚠ 读不到 PRESET_BLUEPRINTS（{e}）——预设指纹缺失')
    try:
        from main_entry.templates import TEMPLATE_LIBRARY
        for k, v in TEMPLATE_LIBRARY.items():
            out.setdefault(canon({'capabilities': v.get('capabilities'), 'entities': v.get('entities')}),
                           f'低模模板 {k}（{v.get("name", "")}）')
    except Exception as e:
        print(f'  ⚠ 读不到 TEMPLATE_LIBRARY（{e}）——模板指纹缺失')
    return out


def shape_of(manifest: dict) -> str:
    """一句话画出这盘卡带长什么样（几个可控体 / 几个方块）——好跟眼睛看到的对上。"""
    ents = manifest.get('entities') or {}
    ctl = boxes = circles = 0
    for name, comps in ents.items():
        if name == 'camera' or not isinstance(comps, dict):
            continue
        if 'Controllable' in comps:
            ctl += 1
        kind = (comps.get('Shape') or {}).get('kind')
        if kind == 'box':
            boxes += 1
        elif kind == 'circle':
            circles += 1
    return f'{len(ents)} 个实体（可控 {ctl} · 方块 {boxes} · 圆 {circles}）'


def main() -> int:
    lib = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(os.environ.get('ZEROCRAFT_LIBRARY_DIR') or (ROOT / 'library'))
    if not lib.is_dir():
        print(f'库目录不存在：{lib}')
        return 0
    stubs = known_stubs()
    rows, groups = [], {}
    for d in sorted(p for p in lib.iterdir() if p.is_dir()):
        try:
            mf = json.loads((d / 'manifest.json').read_text(encoding='utf-8'))
        except Exception as e:
            rows.append((d.name, '—', '', '', f'✗ manifest 读不出：{e}'))
            continue
        try:
            meta = json.loads((d / 'meta.json').read_text(encoding='utf-8'))
        except Exception:
            meta = {}
        fp = canon(mf)
        groups.setdefault(fp, []).append(d.name)
        stub = stubs.get(fp)
        ents = mf.get('entities') or {}
        verdict = ('⚠ ' + stub + '（不是真生成的内容）') if stub else ('⚠ 空卡带（没有玩法内容）' if not ents else '✓ 自有内容')
        rows.append((d.name, fp, str(meta.get('provider') or '?'), str(meta.get('updatedAt') or '')[:19], verdict))

    if not rows:
        print(f'库里一盘卡带都没有：{lib}')
        return 0
    w = max(len(r[0]) for r in rows)
    print(f'\n卡带库：{lib}（{len(rows)} 盘）\n')
    print('  ' + '卡带'.ljust(w) + '  指纹        造它的供应商    最后改动             判定')
    print('  ' + '-' * (w + 66))
    for slug, fp, prov, ts, verdict in rows:
        print(f'  {slug.ljust(w)}  {fp:<10}  {prov:<14}  {ts:<19}  {verdict}')

    dup = {fp: names for fp, names in groups.items() if len(names) > 1}
    if dup:
        print('\n⚠ 内容**完全相同**的卡带（点谁都会看到同一个游戏）：')
        for fp, names in sorted(dup.items(), key=lambda kv: -len(kv[1])):
            mf = json.loads((lib / names[0] / 'manifest.json').read_text(encoding='utf-8'))
            tag = stubs.get(fp)
            print(f'  · {len(names)} 盘同为 {fp}{("＝" + tag) if tag else ""} —— {shape_of(mf)}')
            print(f'    {", ".join(names)}')
    else:
        print('\n✓ 没有两盘卡带内容相同（「点谁都一样」不是出在卡带内容上）')
    stub_rows = [r for r in rows if r[4].startswith('⚠') and '不是真生成' in r[4]]
    print(f'\n小结：{len(rows)} 盘中 **{len(stub_rows)} 盘是内置样例**（非真生成）· '
          f'{sum(1 for r in rows if r[4].startswith("✓"))} 盘有自有内容')
    return 0


if __name__ == '__main__':
    sys.exit(main())
