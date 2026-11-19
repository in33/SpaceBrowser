// ===== 空间浏览器 — 配置（本地存储） =====
// 演示用预置体验 Key（来自赛事方提供），仅用于跑通体验；正式部署请替换为自己的 Key。
const DEMO_KEY = 'XeYyHAKkhYtMINu';
const DEMO_BASE = 'https://api.aholo.cn';

const KEY_APIKEY = 'sb_apikey';
const KEY_BASE = 'sb_base';

export function loadConfig() {
  let apiKey = localStorage.getItem(KEY_APIKEY);
  if (!apiKey) {
    apiKey = DEMO_KEY;
    localStorage.setItem(KEY_APIKEY, DEMO_KEY);
  }
  let base = localStorage.getItem(KEY_BASE) || DEMO_BASE;
  return { apiKey, base };
}

export function saveConfig({ apiKey, base }) {
  if (apiKey) localStorage.setItem(KEY_APIKEY, apiKey.trim());
  if (base) localStorage.setItem(KEY_BASE, base.trim());
}

export function isDemoKey() {
  return loadConfig().apiKey === DEMO_KEY;
}

// 本地已删除的世界 ID 列表（API 无删除接口，前端隐藏）
const KEY_DELETED = 'sb_deleted';
export function getDeletedIds() {
  try { return JSON.parse(localStorage.getItem(KEY_DELETED) || '[]'); } catch { return []; }
}
export function isDeleted(worldId) {
  return getDeletedIds().includes(worldId);
}
export function deleteWorldLocal(worldId) {
  const ids = getDeletedIds();
  if (!ids.includes(worldId)) {
    ids.push(worldId);
    localStorage.setItem(KEY_DELETED, JSON.stringify(ids));
  }
}
export function restoreWorldLocal(worldId) {
  const ids = getDeletedIds().filter(id => id !== worldId);
  localStorage.setItem(KEY_DELETED, JSON.stringify(ids));
}

// 精选展厅：使用本地内置的示范 splat 资源（避免 CORS，确保评委可离线体验）
// bonsai.ksplat / truck.ksplat 为 3DGS 示范数据，已内置在 assets/ 目录
export const EXPLORE_SCENES = [
  {
    id: 'explore-bonsai',
    name: '示范·室内盆景',
    desc: 'Bonsai 室内场景 · 3DGS',
    cover: '',
    gradient: 'linear-gradient(135deg,#1e3a5f,#0a1628)',
    icon: '🪴',
    type: 'ksplat',
    url: 'assets/bonsai.ksplat',
    format: 'KSplat',
    upAxis: 'Y',
    cameraPosition: [1.54163, 2.68515, -6.37228],
    cameraLookAt: [0.45622, 1.95338, 1.51278]
  },
  {
    id: 'explore-truck',
    name: '示范·卡车场景',
    desc: 'Truck 室外场景 · 3DGS',
    cover: '',
    gradient: 'linear-gradient(135deg,#5c2a1a,#2a1410)',
    icon: '🚛',
    type: 'ksplat',
    url: 'assets/truck.ksplat',
    format: 'KSplat',
    upAxis: 'Y',
    cameraPosition: [-5, -1, -1],
    cameraLookAt: [-1.72477, 0.05395, -0.00147]
  }
];

// 精选场景灵感：点击后自动填入 prompt 并切换到生成面板
// cover 使用 Unsplash 免费图（室内场景，贴合生成效果）
export const SCENE_IDEAS = [
  { icon: '🛋️', name: '现代简约客厅', prompt: '现代简约风格客厅，大面积落地窗，木质地板，米色沙发，绿植点缀，自然光充足', cover: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&h=450&fit=crop', gradient: 'linear-gradient(135deg,#3a6ae6,#1a2f5c)' },
  { icon: '🛏️', name: '北欧卧室', prompt: '北欧风格卧室，白色床品，原木家具，柔和暖光，窗边阅读角', cover: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=600&h=450&fit=crop', gradient: 'linear-gradient(135deg,#22d3ee,#0e3a4a)' },
  { icon: '🍵', name: '日式茶室', prompt: '日式禅意茶室，榻榻米，木质矮桌，纸糊推拉门，盆景装饰', cover: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=600&h=450&fit=crop', gradient: 'linear-gradient(135deg,#a78bfa,#3a2a5c)' },
  { icon: '🏭', name: '工业风Loft', prompt: '工业风loft工作室，裸露砖墙，金属管道，皮质沙发，复古灯具', cover: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&h=450&fit=crop', gradient: 'linear-gradient(135deg,#fb923c,#5c2a1a)' },
  { icon: '🍳', name: '现代厨房', prompt: '豪华现代厨房，大理石台面，不锈钢电器，中岛吧台，暖色照明', cover: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=450&fit=crop', gradient: 'linear-gradient(135deg,#34d399,#1a4a3a)' },
  { icon: '🖼️', name: '艺术画廊', prompt: '艺术画廊展厅，白色墙面，射灯照明，木地板，画作陈列', cover: 'https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=600&h=450&fit=crop', gradient: 'linear-gradient(135deg,#f87171,#5c1a2a)' },
  { icon: '📚', name: '古典图书馆', prompt: '古典图书馆，高耸书架，木质旋转楼梯，皮革座椅，暖色台灯', cover: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=600&h=450&fit=crop', gradient: 'linear-gradient(135deg,#fbbf24,#5c3a1a)' },
  { icon: '🌸', name: '日式庭院', prompt: '日式枯山水庭院，白砂波纹，石灯笼，樱花树，木质回廊', cover: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=600&h=450&fit=crop', gradient: 'linear-gradient(135deg,#f472b6,#4a1a3a)' }
];

// AI 生成灵感预设
export const GEN_PRESETS = [
  '现代简约风格客厅，大面积落地窗，木质地板，米色沙发，绿植点缀，自然光充足',
  '北欧风格卧室，白色床品，原木家具，柔和暖光，窗边阅读角',
  '工业风loft工作室，裸露砖墙，金属管道，皮质沙发，复古灯具',
  '日式禅意茶室，榻榻米，木质矮桌，纸糊推拉门，盆景装饰',
  '豪华现代厨房，大理石台面，不锈钢电器，中岛吧台，暖色照明',
  '艺术画廊展厅，白色墙面，射灯照明，木地板，画作陈列'
];
