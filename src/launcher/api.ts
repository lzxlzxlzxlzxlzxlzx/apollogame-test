// launcher.tsx 拆分而来（2026-07-16 纯搬运·行为不变）：创作服务 API 基址 + fetch 助手。

// API 始终走同源路径。开发服务器代理给本机 :4000，生产构建则由 server.py 直接提供 API；
// 因此局域网访问者不会把 localhost 错误解析为自己的电脑。
export const API = '';

// ══════════════════════════════════════
//  API helpers
// ══════════════════════════════════════

export async function apiCall(endpoint: string): Promise<any> {
  const res = await fetch(`${API}${endpoint}`);
  return res.json();
}
