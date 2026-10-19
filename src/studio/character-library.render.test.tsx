import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { CharacterArticle, CharacterList } from './CharacterLibrary.js';

describe('角色仓库展示', () => {
  it('列表用目录投影的名字、摘要，打不开的角色单独列出', () => {
    const html = renderToString(
      <CharacterList
        index={{
          groups: [{ id: 'original', name: '原创' }],
          characters: [{ id: 'lin-qingyue', name: '林清越', groupId: 'original', groupName: '原创', coverUrl: '/characters/lin-qingyue/portrait.png', summary: '住在旧公寓里。' }],
          rejected: [{ id: 'broken', issues: [{ path: 'extra.png', message: '文件没有在 entries 里登记' }] }],
        }}
        onOpen={() => {}}
      />,
    );
    expect(html).toContain('原创');
    expect(html).toContain('住在旧公寓里。');
    expect(html).toContain('打不开');
    expect(html).toContain('文件没有在 entries 里登记');
  });

  it('百科页按条目顺序渲染标题、图片和说明', () => {
    const html = renderToString(
      <CharacterArticle page={{
        id: 'lin-qingyue',
        name: '林清越',
        groupId: 'original',
        groupName: '原创',
        blocks: [
          { title: '角色立绘', description: '默认立绘', kind: 'image', file: 'portrait.png' },
          { title: '简介', description: '百科开篇', kind: 'text', text: '住在旧公寓里。' },
        ],
        costumes: [{
          id: 'suo-xin',
          name: '锁芯',
          blocks: [{ title: '海报', description: '日常生活海报', kind: 'image', file: 'suo-xin/poster.jpg' }],
        }],
        relations: [{ fromId: 'lin-qingyue', fromName: '林清越', relation: '同伴', toId: 'mechanic', toName: '机械师' }],
      }} />,
    );
    const portrait = html.indexOf('角色立绘');
    const intro = html.indexOf('简介');
    expect(portrait).toBeGreaterThanOrEqual(0);
    expect(intro).toBeGreaterThan(portrait);
    expect(html).toContain('/characters/lin-qingyue/portrait.png');
    expect(html).toContain('默认立绘');
    expect(html).toContain('住在旧公寓里。');
    expect(html).toContain('百科开篇');
    expect(html).toContain('锁芯');
    expect(html.indexOf('海报')).toBeGreaterThan(intro);
    expect(html).toContain('/characters/lin-qingyue/suo-xin/poster.jpg');
    expect(html).toContain('关系网');
    expect(html).toContain('同伴');
    expect(html).toContain('机械师');
  });
});
