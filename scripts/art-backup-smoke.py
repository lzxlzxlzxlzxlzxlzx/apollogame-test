#!/usr/bin/env python3
"""原图备份「永不被覆盖」冒烟（REQ-UPBACKUP·Lead 巡检 2026-08-19 实证 game101 art-59 备份=替换图）。

被测不变量**只有一条**：`art/orig/<no>.<ext>` 里躺的永远是**第一次被替换之前**那张图。
它是「一键还原」的唯一底牌——一旦被替换图盖掉，那张真原图就永久没了，还原回来的是另一张替换图。

**病根**（实证复现，非推断）：备份步骤靠 `'orig' not in row` 防重入，可这个标记会被
`derive` 重建台账行、`handle_art_restore` 弹出、绕台账的直传批等路径抹掉。一旦抹掉，
「首次替换」在代码看来又成立一次 → 拿**当时线上那张（已经是替换图）**盖掉真原图。
再循环一次，备份就与线上新图逐字节相同——正是巡检报的那个形状。

**一道闸**（`t2_replace._backup_orig` 与其 JS 孪生 `art-replace.mjs::backupOrigFile` 同款）：
备份已在案 → 原样返回、**绝不重拷**（重入变幂等）。它顺带治掉「源就是备份自己」那种现场
（线上路径指进 orig/·旧版还原留下的）：那时 `orig/<no>.*` 必在案 → 先返回，走不到自拷。
此前 Python 侧在那儿直接 `SameFileError` 抛穿 handle_art_upload 成 500·JS 侧静默 no-op。
（曾另写过第二道「源在 orig/ 下就不拷」的闸——**撤修验红实测它永远够不着**，已删：
测不出红的守卫不是守卫。）
外加还原侧：**把备份内容拷回原服务路径**，不再把线上别名指进 orig/——否则备份区自己
变成线上文件，上面那种现场就是这么造出来的。

  ① 首次替换 → 备份 = 真原图（且 ≠ 新图）
  ② 台账 orig 丢失后再替换 → **备份纹丝不动**（本单病根·撤闸即红）
  ③ 反复替换 N 次 → 备份恒 = 真原图
  ④ 还原 → 线上路径回到替换前那条·内容 = 真原图·**备份区仍在**（不是把线上指进 orig/）
  ⑤ 还原后再替换 → 不炸（旧版 SameFileError 500）·备份仍是真原图
  ⑥ 程序化槽（本无图片文件）→ 备份 = None（不凭空造）
  ⑦ JS 孪生 backupOrigFile 同闸（卡带线走它·两边不许分叉）

全程在临时目录上跑（monkeypatch `t2_replace.art_root`）——绝不碰引擎仓工作树。
用法：python3 scripts/art-backup-smoke.py
"""
import base64
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from main_entry import t2_replace as T  # noqa: E402

PASS, FAIL = 0, 0


def check(cond, label, detail=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  \033[32m✓\033[0m {label}")
    else:
        FAIL += 1
        print(f"  \033[31m✗\033[0m {label}  {detail}")


def png(tag: bytes) -> bytes:
    return b'\x89PNG\r\n\x1a\n' + tag


TMP = Path(tempfile.mkdtemp(prefix='art-backup-smoke-'))
_orig = (T.art_root, T.LIBRARY_DIR)
ART = TMP / 'art'
TRUE_ORIG = png(b'TRUE-ORIGINAL')
NO = 'art-59'
PREFIX = '/games/g/art/'


def body(served):
    """served 路径 → 文件内容标签（不存在=None）。"""
    if not isinstance(served, str) or not served.startswith(PREFIX):
        return None
    f = ART / served[len(PREFIX):]
    return f.read_bytes()[8:].decode() if f.is_file() else None


def backup_body():
    f = ART / 'orig' / f'{NO}.png'
    return f.read_bytes()[8:].decode() if f.is_file() else None


def reset_world(gen_served=f'{PREFIX}gen/{NO}.png', skin_path=None, with_orig=False):
    """重搭一个「槽已 filled·线上是 gen/art-59.png」的世界。"""
    shutil.rmtree(ART, ignore_errors=True)
    (ART / 'gen').mkdir(parents=True)
    if gen_served:
        f = ART / gen_served[len(PREFIX):]
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(TRUE_ORIG)
    entry_path = skin_path or gen_served
    (ART / 'index.json').write_text(json.dumps({'version': 1, 'assets': (
        [{'id': 'skin.card', 'path': entry_path, 'status': 'filled', 'type': 'texture'}] if entry_path else [])}))
    row = {'no': NO, 'query': '卡面', 'kind': 'texture', 'status': 'filled', 'skinKey': 'skin.card',
           'gen': {'servedPath': gen_served} if gen_served else None}
    if with_orig:
        row['orig'] = with_orig
    (ART / 'art-ledger.json').write_text(json.dumps({'rows': [row]}))


def row_now():
    return json.loads((ART / 'art-ledger.json').read_text('utf-8'))['rows'][0]


def upload(tag: bytes):
    return T.handle_art_upload({'slug': 'g', 'no': NO, 'ext': 'png',
                                'dataBase64': base64.b64encode(png(tag)).decode('ascii')})


def drop_orig_marker(live_served):
    """模拟 derive 重建行 / restore 弹出 / 直传批绕台账——`orig` 标记没了，线上已是替换图。"""
    led = json.loads((ART / 'art-ledger.json').read_text('utf-8'))
    led['rows'][0].pop('orig', None)
    led['rows'][0]['gen'] = {'servedPath': live_served}
    (ART / 'art-ledger.json').write_text(json.dumps(led))
    idx = json.loads((ART / 'index.json').read_text('utf-8'))
    for a in idx['assets']:
        if a.get('id') == 'skin.card':
            a['path'] = live_served
    (ART / 'index.json').write_text(json.dumps(idx))


try:
    T.art_root = lambda slug: ART
    T.LIBRARY_DIR = TMP / 'nolib'          # 非卡带 → 走编译期游戏台账线
    UP = f'{PREFIX}gen/{NO}-up.png'

    # ① 首次替换 → 备份 = 真原图
    reset_world()
    r = upload(b'REPLACEMENT-1')
    check(r.get('success'), '① 上传成功', r.get('error'))
    check(row_now().get('orig', {}).get('backupPath') == f'{PREFIX}orig/{NO}.png', '① 台账记下备份路径', row_now().get('orig'))
    check(backup_body() == 'TRUE-ORIGINAL', '① 备份 = 替换前的真原图', backup_body())
    check(backup_body() != body(UP), '① 备份 ≠ 换上去的新图（本单标题那一条）')

    # ② 台账 orig 标记丢失后再替换 → 备份纹丝不动（病根腿·撤闸① 即红）
    drop_orig_marker(UP)
    r = upload(b'REPLACEMENT-2')
    check(r.get('success'), '② orig 标记丢失后仍能上传', r.get('error'))
    check(backup_body() == 'TRUE-ORIGINAL', '② **备份纹丝不动**——真原图没被替换图盖掉（本单病根）', backup_body())
    check(body(UP) == 'REPLACEMENT-2', '② 线上确实换成了新图（不是靠"没换成"蒙混过关）', body(UP))
    check(row_now().get('orig', {}).get('backupPath') == f'{PREFIX}orig/{NO}.png', '② 备份路径原样回填台账')

    # ③ 反复替换 → 备份恒等真原图
    for i in range(3, 6):
        drop_orig_marker(UP)
        upload(f'REPLACEMENT-{i}'.encode())
    check(backup_body() == 'TRUE-ORIGINAL', '③ 连替 5 次·备份恒 = 真原图', backup_body())
    check(len(list((ART / 'orig').iterdir())) == 1, '③ 备份区只有一份（不堆垃圾）',
          [p.name for p in (ART / 'orig').iterdir()])

    # ④ 还原 → 回到替换前那条服务路径·内容=真原图·备份区仍在
    # 另起干净夹具：③ 的世界里台账已被反复抹标记，「替换前那条路径」在账上就是上一张替换图
    # （还原按账走·内容仍从备份精确复原）——那不是本腿要钉的语义，本腿钉正常一次替换的还原。
    reset_world()
    upload(b'REPLACEMENT-1')
    rs = T.handle_art_restore({'slug': 'g', 'no': NO})
    check(rs.get('success'), '④ 还原成功', rs.get('error'))
    served = (row_now().get('gen') or {}).get('servedPath')
    check(served == f'{PREFIX}gen/{NO}.png', '④ 线上回到替换前那条路径（**不指进 orig/**）', served)
    check(body(served) == 'TRUE-ORIGINAL', '④ 还原出来的就是真原图', body(served))
    idx = json.loads((ART / 'index.json').read_text('utf-8'))
    skin = next((a for a in idx['assets'] if a.get('id') == 'skin.card'), None)
    check(skin and skin.get('path') == served, '④ 皮肤别名同步指回（工作台预览也回来）', skin)
    check(backup_body() == 'TRUE-ORIGINAL', '④ 备份区仍在·内容没被动（orig/ 只进不出）')

    # ⑤ 还原后再替换 → 不炸（旧版此处 SameFileError 抛成 500）·备份仍是真原图
    r = upload(b'REPLACEMENT-AFTER-RESTORE')
    check(r.get('success'), '⑤ 还原后再上传不炸（旧版 SameFileError 500）', r.get('error'))
    check(backup_body() == 'TRUE-ORIGINAL', '⑤ 备份仍是真原图', backup_body())
    check(body(UP) == 'REPLACEMENT-AFTER-RESTORE', '⑤ 新图真落盘', body(UP))

    # ⑤b 旧版还原留下的现场（线上别名指进 orig/）→ 闸① 先返回·不自拷不炸
    reset_world(gen_served=f'{PREFIX}orig/{NO}.png', skin_path=f'{PREFIX}orig/{NO}.png')
    (ART / 'orig').mkdir(parents=True, exist_ok=True)
    (ART / 'orig' / f'{NO}.png').write_bytes(TRUE_ORIG)
    r = upload(b'OVER-LEGACY-RESTORE')
    check(r.get('success'), '⑤b 线上指进 orig/ 的旧现场：上传不炸', r.get('error'))
    check(backup_body() == 'TRUE-ORIGINAL', '⑤b 备份没被自己盖掉', backup_body())

    # ⑥ 程序化槽（本无图片文件）→ 不凭空造备份
    reset_world(gen_served=None)
    r = upload(b'FIRST-EVER')
    check(r.get('success'), '⑥ 空槽首次上传成功', r.get('error'))
    check(row_now().get('orig', {}).get('backupPath') is None, '⑥ 本无原图 → backupPath=None（不凭空造）',
          row_now().get('orig'))
    check(not (ART / 'orig').exists(), '⑥ 连 orig/ 目录都不建')

    # ⑦ JS 孪生同闸（卡带线走 art-replace.mjs·两边不许分叉）
    js_root = TMP / 'jsroot'
    (js_root / 'library' / 'g' / 'art' / 'gen').mkdir(parents=True)
    (js_root / 'library' / 'g' / 'manifest.json').write_text('{}')
    (js_root / 'library' / 'g' / 'art' / 'gen' / f'{NO}.png').write_bytes(TRUE_ORIG)
    js = subprocess.run(['node', '--input-type=module', '-e', f'''
      import {{ backupOrigFile }} from {json.dumps((ROOT / 'scripts' / 'art-replace.mjs').as_uri())};
      import {{ writeFileSync, readFileSync }} from 'node:fs';
      const root = {json.dumps(str(js_root))}, pre = '/games/g/art/';
      const a = backupOrigFile(root, 'g', '{NO}', pre + 'gen/{NO}.png');       // 首次 → 拷真原图
      writeFileSync(root + '/library/g/art/gen/{NO}-up.png', Buffer.from('REPL'));
      const b = backupOrigFile(root, 'g', '{NO}', pre + 'gen/{NO}-up.png');    // 闸①：已有备份 → 不重拷
      const c = backupOrigFile(root, 'g', '{NO}', pre + 'orig/{NO}.png');      // 源=备份自己 → 闸① 先返回
      const bak = readFileSync(root + '/library/g/art/orig/{NO}.png').toString('latin1').slice(8);
      console.log(JSON.stringify({{ a, b, c, bak }}));
    '''], capture_output=True, text=True, timeout=60)
    out = json.loads((js.stdout or '{}').strip().splitlines()[-1]) if js.returncode == 0 else {}
    check(js.returncode == 0, '⑦ JS 孪生可调用', (js.stderr or '')[:300])
    check(out.get('a') == f'{PREFIX}orig/{NO}.png', '⑦ JS 首次 → 返回备份路径', out.get('a'))
    check(out.get('b') == f'{PREFIX}orig/{NO}.png' and out.get('bak') == 'TRUE-ORIGINAL',
          '⑦ JS 闸：已有备份 → 原样返回·内容不被替换图盖掉', out)
    check(out.get('c') == f'{PREFIX}orig/{NO}.png', '⑦ JS 源=备份自己 → 仍返回在案备份·不自拷', out.get('c'))
finally:
    T.art_root, T.LIBRARY_DIR = _orig
    shutil.rmtree(TMP, ignore_errors=True)

print(f"\n原图备份冒烟：\033[32m{PASS} 通过\033[0m，" + (f"\033[31m{FAIL} 失败\033[0m" if FAIL else "0 失败"))
sys.exit(1 if FAIL else 0)
