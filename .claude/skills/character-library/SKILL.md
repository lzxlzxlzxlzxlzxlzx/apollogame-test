---
name: character-library
description: 编辑 ZeroCraft 角色仓库时使用。凡新建角色、修改 characters/ 档案、登记立绘或文本、调整百科页排版，先完整阅读 docs/playbooks/character-library.md 再改文件。
when_to_use: 用户要添加角色、改角色目录、登记图片或文字、确认百科页按目录顺序展示。
---

# 角色仓库

权威规则是 `docs/playbooks/character-library.md`。动手前完整阅读，不要凭本摘要猜字段。机读校验是 `src/services/character-library/catalog.ts` 的 `inspectCharacter`。展示页只渲染它的结果。

## 步骤

1. 读手册。一个角色一个文件夹：`characters/<id>/catalog.json` 加同级资源。
2. 角色 `entries` 的数组顺序就是百科页角色区从上到下的顺序。`group` 必填，并且必须存在于 `characters/groups.json`。关系写成 `relations` 里的 `{ to, relation }`，指向另一个角色。多套时装写进 `costumes`，留在同一个角色页里。
3. 每条有非空 `description`，并且 `file` 与 `text` 只能有一个。图片和文本文件靠扩展名区分。
4. 文件夹里除 `catalog.json` 外的每个文件都要被登记一次。改路径时删掉不再使用的旧文件。
5. 改完跑 `inspectCharacter` 的测试。不要把这些文件写入 `assets/index.json`、游戏 manifest 或平台角色卡。

## 不做

不在游戏层另写角色解释器，不在工坊 manifest 对话里顺手改 `characters/`。
