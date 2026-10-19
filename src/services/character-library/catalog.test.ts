import { describe, expect, it } from 'vitest';
import { checkCharacterLinks, inspectCharacter, projectRelations } from './catalog.js';

const readText = (file: string) => (file === 'bio.txt' ? '文件里的正文。\n第二行' : '');

function run(catalog: unknown, files: string[] = ['portrait.png'], text = readText) {
  return inspectCharacter({ id: 'lin-qingyue', catalog, files, readText: text });
}

describe('inspectCharacter', () => {
  it('按 entries 从上到下投影，标题原文保留', () => {
    const result = run({
      name: ' 林清越 ',
      group: 'original',
      entries: [
        { title: ' 角色立绘 ', file: 'portrait.png', description: ' 默认立绘 ' },
        { title: '简介', text: '住在旧公寓里。', description: '百科开篇' },
        { title: '背景', file: 'bio.txt', description: '长文' },
      ],
    }, ['portrait.png', 'bio.txt']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card).toMatchObject({ name: '林清越', coverFile: 'portrait.png', summary: '住在旧公寓里。' });
    expect(result.page.blocks.map((block) => block.title)).toEqual(['角色立绘', '简介', '背景']);
    expect(result.page.blocks[0]).toMatchObject({ kind: 'image', file: 'portrait.png', description: '默认立绘' });
    expect(result.page.blocks[2]).toMatchObject({ kind: 'text', text: '文件里的正文。\n第二行' });
  });

  it('没有行内正文时，摘要用第一条说明', () => {
    const result = run({
      name: '林清越',
      group: 'original',
      entries: [{ title: '角色立绘', file: 'portrait.png', description: '默认立绘' }],
    });
    expect(result.ok && result.card.summary).toBe('默认立绘');
  });

  it('未登记文件、悬空路径、空说明和未知字段都拒绝', () => {
    const result = run({
      name: '林清越',
      note: '多余',
      entries: [
        { title: '角色立绘', file: 'missing.png', description: '   ' },
        { title: '简介', file: 'portrait.png', text: '两边都有', description: '开篇' },
      ],
    }, ['portrait.png', 'extra.png']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      '根上只许 name、group、entries、costumes 和 relations',
      'description 必须是非空字符串',
      '文件不存在',
      'file 和 text 必须恰好有一个',
      '文件没有在 entries 里登记',
    ]));
  });

  it('同一个 file 登记两次就拒绝', () => {
    const result = run({
      name: '林清越',
      entries: [
        { title: '角色立绘', file: 'portrait.png', description: '正面' },
        { title: '插图', file: 'portrait.png', description: '再用一次' },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.message.includes('只能登记一次'))).toBe(true);
  });

  it('封面取第一套时装的第一张图，角色摘要仍取角色正文', () => {
    const result = run({
      name: '机械师',
      group: 'identity-v',
      entries: [{ title: '简介', text: '特蕾西是机械师。', description: '开篇' }],
      costumes: [{
        id: 'suo-xin',
        name: '锁芯',
        entries: [{ title: '海报', file: 'suo-xin/poster.jpg', description: '日常生活海报' }],
      }],
    }, ['suo-xin/poster.jpg']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card).toMatchObject({ coverFile: 'suo-xin/poster.jpg', summary: '特蕾西是机械师。' });
    expect(result.page.costumes.map((costume) => costume.name)).toEqual(['锁芯']);
  });

  it('非法 id 和越出文件夹的路径拒绝', () => {
    const badId = inspectCharacter({
      id: 'Lin_Qing',
      catalog: { name: '林', entries: [{ title: '立绘', file: 'portrait.png', description: '图' }] },
      files: ['portrait.png'],
      readText,
    });
    const escape = run({
      name: '林清越',
      entries: [{ title: '立绘', file: '../portrait.png', description: '图' }],
    }, []);
    expect(badId.ok).toBe(false);
    expect(escape.ok).toBe(false);
  });

  it('关系指向自己会被拒绝，指向别人的三元组能在双方页面看到', () => {
    const self = run({
      name: '林清越',
      group: 'original',
      entries: [{ title: '简介', text: '一个人。', description: '开篇' }],
      relations: [{ to: 'lin-qingyue', relation: '同伴' }],
    }, []);
    expect(self.ok).toBe(false);
    const groups = [{ id: 'original', name: '原创' }];
    const characters = [
      { id: 'lin', groupId: 'original', name: '林', relations: [{ fromId: 'lin', fromName: '林', relation: '同伴', toId: 'mei', toName: 'mei' }] },
      { id: 'mei', groupId: 'original', name: '梅', relations: [] },
    ];
    expect(checkCharacterLinks({ groups, characters }).size).toBe(0);
    expect(projectRelations(characters, 'mei').map((item) => `${item.fromName}${item.relation}${item.toId}`)).toEqual(['林同伴mei']);
    expect(checkCharacterLinks({ groups, characters: [{ id: 'lin', groupId: 'missing', relations: [] }] }).get('lin')?.[0].message).toBe('group 必须是分组表里的 id');
  });
});
