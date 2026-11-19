// ===== 空间浏览器 — 主应用逻辑 =====
import { loadConfig, saveConfig, EXPLORE_SCENES, GEN_PRESETS, SCENE_IDEAS, getDeletedIds, deleteWorldLocal } from './config.js';
import * as API from './api.js';
import { SpaceViewer } from './viewer.js';
import { initParticles } from './particles.js';

const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

let viewer = null;
let currentWorld = null;       // 当前在查看器中加载的世界详情
let reconFiles = [];           // 重建选中的文件
let genFile = null;            // 生成参考图
let poller = null;             // 当前轮询句柄

// ============ 启动 ============
async function boot() {
  // 粒子背景
  initParticles();

  // 预填设置
  const cfg = loadConfig();
  $('#settingsKey').value = cfg.apiKey;
  $('#settingsBase').value = cfg.base;

  // 渲染灵感预设
  const presets = $('#genPresets');
  GEN_PRESETS.forEach(p => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = p.length > 18 ? p.slice(0, 18) + '…' : p;
    b.title = p;
    b.onclick = () => { $('#genPrompt').value = p; };
    presets.appendChild(b);
  });

  // 渲染精选展厅
  renderExplore();

  bindEvents();

  // 启动动画
  const bar = $('#bootBar');
  let p = 0;
  const t = setInterval(() => {
    p = Math.min(100, p + Math.random() * 18 + 6);
    bar.style.width = p + '%';
    $('#bootMsg').textContent = p < 40 ? '正在初始化空间引擎…' : p < 80 ? '加载 3D 渲染管线…' : '准备就绪…';
    if (p >= 100) {
      clearInterval(t);
      setTimeout(() => {
        const bootEl = $('#boot');
        // 强制 reflow，确保 .hide 的 opacity/visibility 过渡被浏览器应用
        void bootEl.offsetWidth;
        bootEl.classList.add('hide');
        // 兜底：部分浏览器环境下 class 切换的 opacity 过渡可能不触发，
        // 过渡时长后强制 display:none，确保启动层彻底隐藏不遮挡交互
        setTimeout(() => { bootEl.style.display = 'none'; }, 650);
        // 自动加载我的空间
        refreshLibrary();
      }, 350);
    }
  }, 180);
}

// ============ 事件绑定 ============
function bindEvents() {
  // 顶部 Tab 切换
  $$('.tab').forEach(t => t.onclick = () => switchView(t.dataset.view));

  // 创建模式切换
  $$('.mode').forEach(m => m.onclick = () => {
    $$('.mode').forEach(x => x.classList.remove('active'));
    m.classList.add('active');
    const mode = m.dataset.mode;
    $('#panel-gen').classList.toggle('active', mode === 'gen');
    $('#panel-recon').classList.toggle('active', mode === 'recon');
  });

  // 生成：图片选择
  const genDrop = $('#genDrop'), genFileInput = $('#genFile');
  // input 是 drop 的子元素，程序触发 input.click() 的事件会冒泡回 drop，
  // 导致 onclick 再次执行而弹出两次对话框，故过滤掉源自 input 的点击。
  genDrop.onclick = (e) => { if (e.target !== genFileInput) genFileInput.click(); };
  bindDrop(genDrop, (files) => { if (files[0]) setGenFile(files[0]); });
  genFileInput.onchange = (e) => { if (e.target.files[0]) setGenFile(e.target.files[0]); };

  // 生成按钮
  $('#btnGen').onclick = onGenerate;

  // 免登录即时体验：进入精选展厅并自动打开首个示范场景
  $('#btnDemo').onclick = () => {
    switchView('explore');
    if (EXPLORE_SCENES[0]) openViewerFromScene(EXPLORE_SCENES[0]);
  };

  // 重建：多图选择
  const reconDrop = $('#reconDrop'), reconInput = $('#reconFiles');
  reconDrop.onclick = (e) => { if (e.target !== reconInput) reconInput.click(); };
  bindDrop(reconDrop, (files) => addReconFiles(files));
  reconInput.onchange = (e) => addReconFiles(Array.from(e.target.files));
  $('#reconScene').onchange = updateReconBtn;
  $('#btnRecon').onclick = onReconstruct;

  // 库
  $('#btnRefresh').onclick = refreshLibrary;
  $('#libFilter').onchange = refreshLibrary;

  // 查看器
  $('#btnCloseViewer').onclick = closeViewer;
  $('#btnOrbit').onclick = () => { viewer && viewer.setOrbit(); toggleVbtn('btnOrbit'); };
  $('#btnFps').onclick = () => { viewer && viewer.setFps(); toggleVbtn('btnFps'); };
  $('#btnReset').onclick = () => viewer && viewer.resetView();
  $('#btnUnderstand').onclick = onUnderstand;
  $('#btnPano').onclick = onShowPano;
  $('#btnFullscreen').onclick = toggleFullscreen;

  // 任务浮窗
  $('#toastClose').onclick = () => $('#taskToast').classList.add('hidden');
  $('#toastCancel').onclick = () => $('#taskToast').classList.add('hidden');
  $('#toastView').onclick = () => {
    if (currentWorld) openViewer(currentWorld);
  };

  // 设置
  $('#btnSettings').onclick = () => $('#settingsModal').classList.remove('hidden');
  $('#settingsClose').onclick = () => $('#settingsModal').classList.add('hidden');
  $('#settingsSave').onclick = () => {
    saveConfig({ apiKey: $('#settingsKey').value, base: $('#settingsBase').value });
    $('#settingsModal').classList.add('hidden');
    notify('设置已保存', 'ok');
    refreshLibrary();
  };
  $('#settingsTest').onclick = async () => {
    try {
      saveConfig({ apiKey: $('#settingsKey').value, base: $('#settingsBase').value });
      await API.testConnection();
      notify('连接成功 ✓', 'ok');
    } catch (e) { notify('连接失败：' + e.message, 'err'); }
  };

  // 弹窗关闭
  $('#panoClose').onclick = () => $('#panoModal').classList.add('hidden');
  $('#understandClose').onclick = () => $('#understandModal').classList.add('hidden');
  $$('.modal').forEach(m => m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); }));

  // 键盘
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#viewer').classList.contains('hidden')) closeViewer();
      else $$('.modal').forEach(m => m.classList.add('hidden'));
    }
  });
}

function switchView(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + name).classList.add('active');
  if (name === 'library') refreshLibrary();
}

// ============ 拖放 ============
function bindDrop(el, onFiles) {
  ['dragenter', 'dragover'].forEach(ev => el.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation(); el.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach(ev => el.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation(); el.classList.remove('drag');
  }));
  el.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) onFiles(files);
  });
}

// ============ 生成：参考图 ============
function setGenFile(file) {
  if (!/\.(jpe?g|png|webp)$/i.test(file.name)) { notify('请选择 jpg/png/webp 图片', 'err'); return; }
  if (file.size > 50 * 1024 * 1024) { notify('图片不能超过 50MB', 'err'); return; }
  genFile = file;
  const inner = $('#genDrop .drop__inner');
  inner.innerHTML = `<span class="drop__icon">✅</span><span class="drop__text">${file.name}</span><small>已选择 · 点击重新选择</small>`;
}

// ============ 生成空间 ============
async function onGenerate() {
  const prompt = $('#genPrompt').value.trim();
  const name = $('#genName').value.trim() || 'AI 空间';
  if (!prompt && !genFile) { notify('请输入空间描述或上传一张图片', 'err'); return; }

  const btn = $('#btnGen');
  btn.disabled = true;
  btn.textContent = '⏳ 处理中…';

  try {
    let imageUrl = null;
    if (genFile) {
      notify('正在上传参考图…', 'info');
      imageUrl = await API.uploadFile(genFile, (p) => {
        btn.textContent = `⬆️ 上传 ${Math.round(p * 100)}%`;
      });
    }

    notify('正在创建生成任务…', 'info');
    btn.textContent = '🚀 提交任务…';
    const op = await API.createGeneration({ name, prompt, imageUrl });
    const worldId = op.worldId;

    notify('任务已创建，正在生成 3D 空间…', 'ok');
    startPoll(worldId, { type: 'gen', name, prompt });
  } catch (e) {
    notify(genFailMsg(e), 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 生成 3D 空间';
  }
}

// API 调用失败时的友好提示：额度/鉴权类错误引导至免登录精选展厅
function genFailMsg(e) {
  const raw = String(e?.raw ? JSON.stringify(e.raw) : '') + ' ' + (e?.message || '') + ' ' + (e?.code || '');
  const low = raw.toLowerCase();
  const isCredit = low.includes('credit') || low.includes('额度') || low.includes('配额') || low.includes('quota') || low.includes('余额');
  const isAuth = e?.status === 401 || e?.status === 403 || low.includes('auth') || low.includes('key') || low.includes('鉴权') || low.includes('unauthorized');
  const base = '生成失败：' + (e.message || e);
  if (isCredit) return base + '。演示额度可能已用尽，可点击上方「立即体验」直接漫游精选展厅';
  if (isAuth) return base + '。API Key 无效或已失效，可在「⚙️ 设置」中更换；或点击「立即体验」直接漫游';
  return base;
}

// ============ 重建：多图 ============
function addReconFiles(files) {
  const valid = files.filter(f => /\.(jpe?g|png|webp)$/i.test(f.name));
  if (valid.length < files.length) notify('已忽略非图片文件', 'info');
  reconFiles = reconFiles.concat(valid);
  renderReconThumbs();
  updateReconBtn();
}

function renderReconThumbs() {
  const box = $('#reconThumbs');
  box.innerHTML = '';
  reconFiles.forEach((f, i) => {
    const t = document.createElement('div');
    t.className = 'thumb';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f);
    const rm = document.createElement('button');
    rm.className = 'thumb__rm'; rm.textContent = '✕';
    rm.onclick = (e) => { e.stopPropagation(); reconFiles.splice(i, 1); renderReconThumbs(); updateReconBtn(); };
    t.appendChild(img); t.appendChild(rm);
    box.appendChild(t);
  });
  $('#reconCount').textContent = `已选 ${reconFiles.length} 张${reconFiles.length < 20 ? '（至少 20 张）' : '（可以开始重建）'}`;
}

function updateReconBtn() {
  $('#btnRecon').disabled = reconFiles.length < 20;
}

async function onReconstruct() {
  const scene = $('#reconScene').value;
  const taskQuality = $('#reconQuality').value;
  const name = $('#reconName').value.trim() || '重建空间';
  if (reconFiles.length < 20) { notify('至少需要 20 张照片', 'err'); return; }

  const btn = $('#btnRecon');
  btn.disabled = true;

  try {
    // 上传所有图片
    const urls = [];
    for (let i = 0; i < reconFiles.length; i++) {
      btn.textContent = `⬆️ 上传 ${i + 1}/${reconFiles.length}`;
      const url = await API.uploadFile(reconFiles[i]);
      urls.push(url);
    }
    notify('上传完成，正在创建重建任务…', 'info');
    btn.textContent = '🏗️ 提交任务…';
    const resources = urls.map(u => ({ url: u, type: 'image' }));
    const op = await API.createReconstruction({ name, resources, scene, taskQuality });
    notify('重建任务已创建，正在生成高保真 3DGS…', 'ok');
    startPoll(op.worldId, { type: 'recon', name, scene });
  } catch (e) {
    notify(genFailMsg(e), 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '🏗️ 开始重建';
  }
}

// ============ 任务轮询 ============
function startPoll(worldId, meta) {
  $('#taskToast').classList.remove('hidden');
  $('#toastView').disabled = true;
  $('#toastTitle').textContent = meta.name || '任务进行中';
  $('#toastDetail').textContent = `ID: ${worldId}`;
  $('#toastBar').style.width = '0%';

  if (poller) poller.stop();
  poller = API.pollWorld(worldId, (detail) => {
    updateToast(detail);
  });
  poller.promise.then((detail) => {
    if (detail.status === 'SUCCEEDED') {
      updateToast(detail);
      $('#toastView').disabled = false;
      notify('🎉 空间生成完成！点击「进入漫游」体验', 'ok');
      currentWorld = detail;
      // 自动打开查看器
      setTimeout(() => openViewer(detail), 600);
      refreshLibrary();
    } else {
      notify('任务未成功：' + API.statusLabel(detail.status), 'err');
      refreshLibrary();
    }
  }).catch((e) => {
    $('#toastStatus').textContent = '出错：' + e.message;
  });
}

function updateToast(detail) {
  const pct = Math.round((detail.progress || 0) * 100);
  $('#toastBar').style.width = pct + '%';
  $('#toastStatus').textContent = `${API.statusLabel(detail.status)} · ${pct}%`;
}

// ============ 空间库 ============
async function refreshLibrary() {
  const grid = $('#libGrid');
  const empty = $('#libEmpty');
  grid.innerHTML = '';
  const filter = $('#libFilter').value;
  try {
    const statusList = filter ? [filter] : ['RUNNING', 'PREPROCESSING', 'PENDING', 'SUCCEEDED', 'FAILED'];
    const data = await API.listWorlds({ pageNum: 0, pageSize: 60, statusList });
    const deleted = getDeletedIds();
    const items = (data.result || []).filter(w => !deleted.includes(w.worldId));
    if (!items.length) {
      empty.style.display = 'block';
      empty.querySelector('p').textContent = deleted.length ? '所有空间已隐藏，可点击卡片「恢复」找回' : '还没有空间，去「创建空间」生成你的第一个 3D 世界吧！';
      return;
    }
    empty.style.display = 'none';
    items.forEach(w => grid.appendChild(renderWorldCard(w)));
  } catch (e) {
    empty.style.display = 'block';
    empty.querySelector('p').textContent = '加载失败：' + e.message;
  }
}

function renderWorldCard(w) {
  const el = document.createElement('div');
  el.className = 'card-item';
  const st = w.status || 'PENDING';
  const pct = Math.round((w.progress || 0) * 100);
  const cover = w.cover
    ? `<img src="${w.cover}" alt="" />`
    : `<div class="ph">${w.scene === 'ai_gen' ? '🤖' : '📷'}</div>`;
  const sceneLabel = ({
    ai_gen: 'AI 生成', indoor: 'AI 生成', outdoor: 'AI 生成',
    space: '空间重建', model: '物体重建'
  })[w.scene] || w.scene || '空间';
  const rawName = w.name || '未命名';
  // 修复乱码名称（含 ?? 或大量替换字符时回退为场景名）
  const name = /[\?？]{2,}/.test(rawName) || /[\ufffd]/.test(rawName)
    ? (sceneLabel + '空间') : rawName;
  const done = st === 'SUCCEEDED';
  const hasPano = !!(w.cover); // 有封面通常也有全景
  el.innerHTML = `
    <div class="card-item__cover">
      ${cover}
      <span class="card-item__status st-${st}">${API.statusLabel(st)}</span>
      <button class="card-item__del" title="删除/隐藏">🗑️</button>
    </div>
    <div class="card-item__body">
      <div class="card-item__title" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
      <div class="card-item__meta">
        <span>${sceneLabel}</span>
        <span>${API.fmtTime(w.createTime)}</span>
      </div>
      ${done ? '<div class="card-item__enter">🚀 点击进入漫游 →</div>' : `<div class="card-item__progress"><span style="width:${pct}%"></span></div>`}
    </div>`;
  // 删除按钮
  el.querySelector('.card-item__del').onclick = (e) => {
    e.stopPropagation();
    confirmDelete(w.worldId, name);
  };
  el.onclick = () => {
    if (done) {
      loadWorldDetailAndOpen(w.worldId);
    } else if (st === 'RUNNING' || st === 'PREPROCESSING' || st === 'PENDING') {
      startPoll(w.worldId, { name });
    } else {
      notify('该任务状态为 ' + API.statusLabel(st) + '，无法漫游', 'info');
    }
  };
  return el;
}

function confirmDelete(worldId, name) {
  // 简易确认（无 confirm 弹窗，用 notify 二次点击）
  const el = $('#notify');
  if (el.dataset.confirm === worldId) {
    deleteWorldLocal(worldId);
    el.classList.add('hidden');
    delete el.dataset.confirm;
    notify('已删除「' + name + '」', 'ok');
    refreshLibrary();
    return;
  }
  el.dataset.confirm = worldId;
  notify('再次点击 🗑️ 确认删除「' + name + '」（仅本地隐藏，可恢复）', 'info');
  clearTimeout(el._t);
  el._t = setTimeout(() => { delete el.dataset.confirm; }, 4000);
}

async function loadWorldDetailAndOpen(worldId) {
  try {
    notify('正在加载空间详情…', 'info');
    const detail = await API.getWorldDetail(worldId);
    currentWorld = detail;
    openViewer(detail);
  } catch (e) {
    notify('加载失败：' + e.message, 'err');
  }
}

// ============ 精选展厅 ============
function renderExplore() {
  const grid = $('#exploreGrid');
  EXPLORE_SCENES.forEach(s => {
    const el = document.createElement('div');
    el.className = 'card-item';
    const bg = s.gradient || 'linear-gradient(135deg,#1a2238,#0e1424)';
    el.innerHTML = `
      <div class="card-item__cover" style="background:${bg}">
        <div class="ph">${s.icon || '🌐'}</div>
        <span class="card-item__status st-SUCCEEDED">可体验</span></div>
      <div class="card-item__body">
        <div class="card-item__title">${escapeHtml(s.name)}</div>
        <div class="card-item__meta"><span>${s.desc}</span><span>${s.format}</span></div>
      </div>`;
    el.onclick = () => openViewerFromScene(s);
    grid.appendChild(el);
  });

  // 灵感场景
  const ideas = $('#sceneIdeas');
  SCENE_IDEAS.forEach(s => {
    const el = document.createElement('div');
    el.className = 'idea';
    const bgStyle = s.cover
      ? `background-image:linear-gradient(180deg,rgba(0,0,0,.1) 0%,rgba(0,0,0,.5) 100%),url('${s.cover}');background-size:cover;background-position:center`
      : `background:${s.gradient}`;
    el.innerHTML = `
      <div class="idea__bg" style="${bgStyle}"></div>
      <div class="idea__content">
        <div class="idea__icon">${s.icon}</div>
        <div class="idea__name">${escapeHtml(s.name)}</div>
        <div class="idea__hint">点击生成 →</div>
      </div>`;
    el.onclick = () => {
      // 切换到创建页并填入 prompt
      switchView('create');
      $('#genPrompt').value = s.prompt;
      $('#genName').value = s.name;
      $('#panel-gen').classList.add('active');
      $('#panel-recon').classList.remove('active');
      $$('.mode').forEach(m => m.classList.toggle('active', m.dataset.mode === 'gen'));
      notify('已填入「' + s.name + '」灵感，点击生成即可', 'info');
      $('#genPrompt').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    ideas.appendChild(el);
  });
}

// ============ 查看器 ============
async function openViewer(world) {
  const assets = world.assets || {};
  const splats = assets.splats || {};
  const urls = splats.urls || {};
  const spz = urls.spzPath, ply = urls.plyPath;
  if (!spz && !ply) {
    notify('该空间暂无可漫游的模型数据', 'err');
    return;
  }
  // 优先 PLY（GaussianSplats3D 对 PLY 支持最完整；AHOLO 的 SPZ 为 v3，当前库仅支持 v1-2）
  const url = ply || spz;
  const format = ply ? 'Ply' : 'Spz';
  const upAxis = (assets.semanticsMetadata && assets.semanticsMetadata.upAxis) || 'Z';

  $('#viewer').classList.remove('hidden');
  $('#viewerLoading').classList.remove('hide');
  $('#viewerLoadMsg').textContent = '正在加载 3D 空间…';
  $('#viewerName').textContent = world.name || '空间';
  $('#viewerMeta').textContent = `${format} · ${upAxis}-up`;
  $('#btnPano').style.display = (assets.imagery && assets.imagery.panoUrl) ? '' : 'none';
  $('#btnUnderstand').style.display = ply ? '' : 'none';

  if (!viewer) viewer = new SpaceViewer($('#viewerCanvas'));
  try {
    await viewer.load({
      url, format, upAxis,
      cameraPosition: [0, 1, 6],
      cameraLookAt: [0, 1, 0]
    });
    $('#viewerLoading').classList.add('hide');
  } catch (e) {
    $('#viewerLoadMsg').textContent = '加载失败：' + e.message;
    notify('空间加载失败：' + e.message, 'err');
  }
}

async function openViewerFromScene(scene) {
  $('#viewer').classList.remove('hidden');
  $('#viewerLoading').classList.remove('hide');
  $('#viewerLoadMsg').textContent = '正在加载示范空间…';
  $('#viewerName').textContent = scene.name;
  $('#viewerMeta').textContent = `${scene.format} · ${scene.upAxis}-up`;
  $('#btnPano').style.display = 'none';
  $('#btnUnderstand').style.display = 'none';
  if (!viewer) viewer = new SpaceViewer($('#viewerCanvas'));
  try {
    await viewer.load(scene);
    $('#viewerLoading').classList.add('hide');
  } catch (e) {
    $('#viewerLoadMsg').textContent = '加载失败：' + e.message;
    notify('加载失败：' + e.message, 'err');
  }
}

function closeViewer() {
  $('#viewer').classList.add('hidden');
  if (viewer) { viewer.dispose(); viewer = null; }
}

function toggleVbtn(id) {
  ['btnOrbit', 'btnFps'].forEach(b => $('#' + b).classList.remove('active'));
  $('#' + id).classList.add('active');
}

function toggleFullscreen() {
  const el = $('#viewer');
  if (!document.fullscreenElement) el.requestFullscreen && el.requestFullscreen();
  else document.exitFullscreen && document.exitFullscreen();
}

// ============ 全景图 ============
function onShowPano() {
  if (!currentWorld || !currentWorld.assets || !currentWorld.assets.imagery || !currentWorld.assets.imagery.panoUrl) {
    notify('该空间没有全景图', 'info'); return;
  }
  $('#panoImg').src = currentWorld.assets.imagery.panoUrl;
  $('#panoModal').classList.remove('hidden');
}

// ============ 空间理解 ============
async function onUnderstand() {
  if (!currentWorld) return;
  const ply = currentWorld.assets?.splats?.urls?.plyPath;
  if (!ply) { notify('需要 PLY 模型才能进行空间理解', 'info'); return; }
  notify('正在提交空间理解任务…', 'info');
  try {
    const op = await API.createSpatialUnderstanding(ply);
    const taskId = op.taskId;
    $('#understandModal').classList.remove('hidden');
    $('#understandContent').innerHTML = '<div style="text-align:center;padding:30px"><div class="spin" style="margin:0 auto"></div><p style="margin-top:14px;color:var(--text2)">空间理解任务进行中…</p></div>';
    const p = API.pollSpatial(taskId, () => {});
    const detail = await p.promise;
    if (detail.status === 'SUCCEEDED') {
      const text = await API.fetchSpatialResultText(detail.result.resultSslUrl);
      renderUnderstand(text, detail);
    } else {
      $('#understandContent').innerHTML = `<p>任务未成功：${detail.errorMessage || detail.status}</p>`;
    }
  } catch (e) {
    $('#understandContent').innerHTML = `<p style="color:var(--red)">失败：${e.message}</p>`;
  }
}

function renderUnderstand(text, detail) {
  const parsed = parseSpatialDSL(text);
  const box = $('#understandContent');
  const stats = parsed;
  box.innerHTML = `
    <div class="understand__stats">
      <div class="understand__stat"><b>${stats.walls.length}</b><span>墙体 Wall</span></div>
      <div class="understand__stat"><b>${stats.doors.length}</b><span>门 Door</span></div>
      <div class="understand__stat"><b>${stats.windows.length}</b><span>窗 Window</span></div>
      <div class="understand__stat"><b>${stats.bboxes.length}</b><span>物体 Bbox</span></div>
    </div>
    ${stats.walls.length ? `<h4>🧱 墙体</h4><div class="understand__list">${stats.walls.map(w => `<div class="understand__item">${w}</div>`).join('')}</div>` : ''}
    ${stats.doors.length ? `<h4>🚪 门</h4><div class="understand__list">${stats.doors.map(w => `<div class="understand__item">${w}</div>`).join('')}</div>` : ''}
    ${stats.windows.length ? `<h4>🪟 窗</h4><div class="understand__list">${stats.windows.map(w => `<div class="understand__item">${w}</div>`).join('')}</div>` : ''}
    ${stats.bboxes.length ? `<h4>📦 物体</h4><div class="understand__list">${stats.bboxes.map(w => `<div class="understand__item">${w}</div>`).join('')}</div>` : ''}
    <details><summary style="cursor:pointer;color:var(--text2);font-size:12px;margin-top:12px">查看原始 DSL 文本</summary><div class="understand__raw">${escapeHtml(text)}</div></details>
  `;
}

// 解析空间理解 DSL 文本（含 Wall/Door/Window/Bbox）
function parseSpatialDSL(text) {
  const out = { walls: [], doors: [], windows: [], bboxes: [] };
  const lines = text.split(/\r?\n/);
  let current = null;
  const map = { wall: 'walls', door: 'doors', window: 'windows', bbox: 'bboxes' };
  for (const line of lines) {
    const m = line.match(/^\s*(wall|door|window|bbox)\b/i);
    if (m) {
      const key = map[m[1].toLowerCase()];
      out[key].push(line.trim());
    }
  }
  // 如果没匹配到行式，尝试整体计数
  if (!out.walls.length && !out.doors.length) {
    const wc = (text.match(/wall/gi) || []).length;
    const dc = (text.match(/door/gi) || []).length;
    const wic = (text.match(/window/gi) || []).length;
    const bc = (text.match(/bbox/gi) || []).length;
    if (wc) out.walls = [`检测到 ${wc} 处墙体相关描述`];
    if (dc) out.doors = [`检测到 ${dc} 处门相关描述`];
    if (wic) out.windows = [`检测到 ${wic} 处窗相关描述`];
    if (bc) out.bboxes = [`检测到 ${bc} 处物体相关描述`];
  }
  return out;
}

// ============ 工具 ============
function notify(msg, type = 'info') {
  const el = $('#notify');
  el.textContent = msg;
  el.className = 'notify ' + type;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3200);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 启动
boot();
