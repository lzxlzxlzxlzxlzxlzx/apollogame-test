# REQ-UPBACKUP F3 独立复查（2026-10-10）

结论：PASS，F3 覆盖式恢复夹具补齐后，本需求无剩余施工项。

## 独立实证

- 正常执行：`$env:PYTHONUTF8='1'; python scripts/art-backup-smoke.py`
  - 退出码 `0`；31 通过、0 失败。
- 撤修验红：仅移除 `main_entry/t2_replace.py::handle_art_restore` 的
  `shutil.copyfile(bak_abs, dst)`，保留原服务路径推导与其余逻辑。
  - 退出码 `1`；30 通过、1 失败。
  - 唯一失败锚点为 `F3 **restore 真把原图内容拷回原服务路径**`；实测残留内容为
    `REPLACEMENT-F3-OVERWRITE`。
- 复原该行后再次独立执行同一 smoke：退出码 `0`；31 通过、0 失败。

## 判定

新夹具先故意覆盖原服务路径、再执行 restore，因而直接钉住此前未被覆盖的内容恢复语义；最小突变精确触发该锚点，未发生旁路假红。测试输出无 WARN。REQ-UPBACKUP 可以出池。
