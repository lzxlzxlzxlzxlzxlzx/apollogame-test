import React, { useEffect, useState } from 'react';
import { SHELL, sBtn } from '../ui/shell-theme.js';
import type { CatalogIssue, CharacterPage, CostumePage, PageBlock } from '../services/character-library/catalog.js';

export interface CharacterListItem {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  coverUrl: string | null;
  summary: string;
}

export interface CharacterIndex {
  groups: Array<{ id: string; name: string }>;
  characters: CharacterListItem[];
  rejected: Array<{ id: string; issues: CatalogIssue[] }>;
}

export function CharacterLibrary({ onBack, initialId }: { onBack: () => void; initialId?: string | null }) {
  const [index, setIndex] = useState<CharacterIndex | null>(null);
  const [page, setPage] = useState<CharacterPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/characters/index.json')
      .then((response) => response.json())
      .then((data: CharacterIndex) => { if (!cancelled) setIndex(data); })
      .catch((reason) => { if (!cancelled) setError(`角色仓库加载失败：${String(reason)}`); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!initialId) return;
    let cancelled = false;
    fetch(`/characters/${encodeURIComponent(initialId)}/page.json`)
      .then((response) => response.json())
      .then((data: { ok: boolean; page?: CharacterPage; issues?: CatalogIssue[] }) => {
        if (cancelled) return;
        if (data.ok && data.page) setPage(data.page);
        else setError((data.issues ?? []).map((issue) => issue.message).join('；') || '这个角色打不开');
      })
      .catch((reason) => { if (!cancelled) setError(`角色页加载失败：${String(reason)}`); });
    return () => { cancelled = true; };
  }, [initialId]);

  const open = (id: string) => {
    setError(null);
    fetch(`/characters/${encodeURIComponent(id)}/page.json`)
      .then((response) => response.json())
      .then((data: { ok: boolean; page?: CharacterPage; issues?: CatalogIssue[] }) => {
        if (data.ok && data.page) setPage(data.page);
        else setError((data.issues ?? []).map((issue) => issue.message).join('；') || '这个角色打不开');
      })
      .catch((reason) => setError(`角色页加载失败：${String(reason)}`));
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: SHELL.appBg, color: SHELL.text, display: 'flex', flexDirection: 'column', fontFamily: SHELL.fontUi }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${SHELL.line}`, background: 'rgba(10,14,23,0.95)' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: SHELL.violet }}>角色仓库</span>
        {page && <span style={{ fontSize: 13, color: SHELL.sub }}>{page.name}</span>}
        <button onClick={() => page ? setPage(null) : onBack()} style={{ ...sBtn('ghost'), marginLeft: 'auto' }}>{page ? '← 全部角色' : '← 返回'}</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {error && <p style={{ color: SHELL.warn }}>{error}</p>}
        {!index && !error && <p style={{ color: SHELL.sub }}>正在读取角色目录…</p>}
        {index && !page && <CharacterList index={index} onOpen={open} />}
        {page && <CharacterArticle key={page.id} page={page} onOpen={open} />}
      </div>
    </div>
  );
}

export function CharacterList({ index, onOpen }: { index: CharacterIndex; onOpen: (id: string) => void }) {
  const groups = index.groups ?? [];
  const sections = groups.map((group) => ({
    ...group,
    characters: index.characters.filter((character) => character.groupId === group.id),
  }));
  return (
    <div>
      {index.characters.length === 0 && index.rejected.length === 0 && (
        <p style={{ color: SHELL.sub }}>还没有角色。按角色仓库手册在 characters/ 下新增一份目录后，这里会列出卡片。</p>
      )}
      {sections.map((group) => (
        <section key={group.id} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 12px', color: SHELL.violet }}>{group.name}</h2>
          {group.characters.length === 0 && <p style={{ color: SHELL.sub }}>这个分组里还没有角色。</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {group.characters.map((character) => (
              <button key={character.id} onClick={() => onOpen(character.id)} style={{ textAlign: 'left', cursor: 'pointer', background: SHELL.bg2, color: SHELL.text, border: `1px solid ${SHELL.line}`, borderRadius: 12, padding: 12, fontFamily: SHELL.fontUi }}>
                <div style={{ height: 180, borderRadius: 8, overflow: 'hidden', background: SHELL.bg1, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {character.coverUrl
                    ? <img src={character.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <span style={{ color: SHELL.dim, fontSize: 12 }}>无立绘</span>}
                </div>
                <div style={{ fontWeight: 700 }}>{character.name}</div>
                <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: SHELL.sub }}>{character.summary}</div>
              </button>
            ))}
          </div>
        </section>
      ))}
      {index.rejected.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 14, color: SHELL.warn }}>打不开</h2>
          {index.rejected.map((character) => (
            <p key={character.id} style={{ fontSize: 13, color: SHELL.sub }}>
              <b style={{ color: SHELL.text }}>{character.id}</b>
              {' '}{character.issues.map((issue) => `${issue.path}：${issue.message}`).join('；')}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

export function CharacterArticle({ page, onOpen }: { page: CharacterPage; onOpen?: (id: string) => void }) {
  const costumes = page.costumes ?? [];
  const relations = page.relations ?? [];
  const [costumeId, setCostumeId] = useState(costumes[0]?.id ?? '');
  const costume = costumes.find((item) => item.id === costumeId) ?? costumes[0];
  return (
    <article style={{ maxWidth: 760, margin: '0 auto' }}>
      <p style={{ marginTop: 0, color: SHELL.sub }}>{page.groupName ?? page.groupId}</p>
      {page.blocks.map((block, index) => <ArticleBlock key={`${block.title}-${index}`} block={block} id={page.id} />)}
      <section style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>关系网</h2>
        {relations.length === 0 && <p style={{ color: SHELL.sub }}>还没有登记关系。</p>}
        {relations.map((relation, index) => (
          <p key={`${relation.fromId}-${relation.relation}-${relation.toId}-${index}`} style={{ fontSize: 16, lineHeight: 1.8 }}>
            <RelationName id={relation.fromId} name={relation.fromName} current={page.id} onOpen={onOpen} />
            <span style={{ color: SHELL.sub }}>{` — ${relation.relation} — `}</span>
            <RelationName id={relation.toId} name={relation.toName} current={page.id} onOpen={onOpen} />
          </p>
        ))}
      </section>
      {costumes.length > 0 && (
        <section style={{ marginTop: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>时装</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {costumes.map((item) => (
              <button key={item.id} onClick={() => setCostumeId(item.id)} style={{ ...sBtn(item.id === costume?.id ? 'primary' : 'ghost') }}>{item.name}</button>
            ))}
          </div>
          {costume && <CostumeBody costume={costume} characterId={page.id} />}
        </section>
      )}
    </article>
  );
}

function RelationName({ id, name, current, onOpen }: { id: string; name: string; current: string; onOpen?: (id: string) => void }) {
  if (id === current || !onOpen) return <b>{name}</b>;
  return <button onClick={() => onOpen(id)} style={{ ...sBtn('ghost'), padding: '2px 8px' }}>{name}</button>;
}

function CostumeBody({ costume, characterId }: { costume: CostumePage; characterId: string }) {
  return (
    <div>
      {costume.blocks.map((block, index) => <ArticleBlock key={`${costume.id}-${block.title}-${index}`} block={block} id={characterId} />)}
    </div>
  );
}

function ArticleBlock({ block, id }: { block: PageBlock; id: string }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>{block.title}</h2>
      {block.kind === 'image' && block.file && (
        <img src={fileUrl(id, block.file)} alt={block.description} style={{ display: 'block', maxWidth: '100%', borderRadius: 12 }} />
      )}
      {block.kind === 'text' && (
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{block.text}</p>
      )}
      <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: SHELL.sub }}>{block.description}</p>
    </section>
  );
}

function fileUrl(id: string, file: string): string {
  return `/characters/${encodeURIComponent(id)}/${file.split('/').map(encodeURIComponent).join('/')}`;
}
