// ===== 空间浏览器 — Aholo Open API 客户端 =====
// 文档：https://labs.aholo.cn/api-docs/intro
// 鉴权：Header Authorization: <API key>（无需 Bearer 前缀）

import { loadConfig } from './config.js';
import { fileMD5 } from './md5.js';

const STATUS = {
  PENDING: '排队中', PREPROCESSING: '预处理', RUNNING: '重建中',
  SUCCEEDED: '已完成', FAILED: '失败', CANCELED: '已取消', TIMEOUT: '超时', REJECTED: '已拒绝'
};

function base() { return (loadConfig().base || 'https://api.aholo.cn').replace(/\/+$/, ''); }
function apiKey() { return loadConfig().apiKey || ''; }

async function req(path, opts = {}) {
  const url = path.startsWith('http') ? path : base() + path;
  const headers = { 'Authorization': apiKey(), ...(opts.headers || {}) };
  let body = opts.body;
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, { ...opts, headers, body });
  } catch (e) {
    throw new ApiError('网络请求失败：' + (e.message || e), 0, 'NETWORK_ERROR');
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.message || data.details?.message)) || `HTTP ${res.status}`;
    const biz = data?.details?.metaData?.bizCode || data?.details?.reason;
    throw new ApiError(msg, res.status, biz, data);
  }
  return data;
}

export class ApiError extends Error {
  constructor(message, status, code, raw) {
    super(message);
    this.status = status; this.code = code; this.raw = raw;
  }
}

// ---- 资产上传 ----
// 完整流程（文档：asset/openapi.yaml）：
// 1) GET /asset/v1/token → ousToken / globalDomain / blockSize
// 2) 计算 MD5（十六进制小写）
// 3) ≤ blockSize：POST /ous/api/v2/single/upload（form: file + md5，Header ous-token-v2）→ d.obsTaskId
//    > blockSize：POST /ous/api/v2/block/upload/init?md5&blocks&size&name（query）→ d.taskId
//                 再 POST /ous/api/v2/block/upload/part（form: block + file）逐片
// 4) 轮询 GET /ous/api/v2/upload/status?obsTaskId=...（同一 token）→ d.status===5 时取 d.url
// 注意：token 与上传任务绑定，必须用同一个 token 完成上传 + 轮询。
export async function getUploadToken() {
  return req('/asset/v1/token', { method: 'GET' });
}

export async function uploadFile(file, onProgress) {
  const token = await getUploadToken();
  const domain = (token.globalDomain || 'https://ous-cos.kujiale.com').replace(/\/+$/, '');
  const ousToken = token.ousToken;
  const blockSize = token.blockSize || 5 * 1024 * 1024;

  // 计算 MD5
  const md5 = await fileMD5(file, (p) => onProgress && onProgress(p * 0.3));

  let obsTaskId;
  if (file.size <= blockSize) {
    obsTaskId = await singleUpload(domain, ousToken, file, md5, onProgress);
  } else {
    obsTaskId = await blockUpload(domain, ousToken, file, md5, blockSize, onProgress);
  }

  // 轮询状态，取 url
  const url = await pollUploadStatus(domain, ousToken, obsTaskId);
  return url;
}

async function singleUpload(domain, ousToken, file, md5, onProgress) {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('md5', md5);
  const url = domain + '/ous/api/v2/single/upload';
  const res = await fetchWithProgress(url, {
    method: 'POST', headers: { 'ous-token-v2': ousToken }, body: form
  }, (loaded) => onProgress && onProgress(0.3 + 0.6 * (loaded / file.size)));
  const data = await res.json();
  if (String(data.c) !== '0') {
    throw new ApiError('上传失败：' + (data.m || JSON.stringify(data)), 500, 'UPLOAD_FAIL');
  }
  const taskId = data.d?.obsTaskId || data.d?.taskId;
  if (!taskId) throw new ApiError('上传未返回任务 ID：' + JSON.stringify(data), 500, 'UPLOAD_NO_TASK');
  return taskId;
}

async function blockUpload(domain, ousToken, file, md5, blockSize, onProgress) {
  const totalBlocks = Math.ceil(file.size / blockSize);
  // init（参数在 query）
  const initUrl = domain + '/ous/api/v2/block/upload/init?md5=' + encodeURIComponent(md5) +
    '&blocks=' + totalBlocks + '&size=' + file.size + '&name=' + encodeURIComponent(file.name);
  const initRes = await fetch(initUrl, { method: 'POST', headers: { 'ous-token-v2': ousToken } });
  const init = await initRes.json();
  if (String(init.c) !== '0') {
    throw new ApiError('分块初始化失败：' + (init.m || JSON.stringify(init)), 500, 'BLOCK_INIT_FAIL');
  }
  const taskId = init.d?.taskId || init.d?.obsTaskId;
  if (!taskId) throw new ApiError('分块初始化未返回任务 ID：' + JSON.stringify(init), 500, 'BLOCK_NO_TASK');

  // 命中去重则无需传分片
  if (!init.d?.deduplicated) {
    for (let i = 0; i < totalBlocks; i++) {
      const start = i * blockSize;
      const chunk = file.slice(start, start + blockSize);
      const form = new FormData();
      form.append('block', String(i + 1));
      form.append('file', chunk, file.name);
      await fetchWithProgress(domain + '/ous/api/v2/block/upload/part', {
        method: 'POST', headers: { 'ous-token-v2': ousToken }, body: form
      }, (loaded) => onProgress && onProgress(0.3 + 0.6 * ((start + loaded) / file.size)));
    }
  }
  return taskId;
}

async function pollUploadStatus(domain, ousToken, taskId) {
  const url = domain + '/ous/api/v2/upload/status?obsTaskId=' + encodeURIComponent(taskId);
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const res = await fetch(url, { method: 'GET', headers: { 'ous-token-v2': ousToken } });
    const data = await res.json();
    if (String(data.c) !== '0') {
      throw new ApiError('查询上传状态失败：' + (data.m || JSON.stringify(data)), 500, 'STATUS_FAIL');
    }
    const d = data.d || {};
    const status = d.status;
    // 5=成功，6/8=失败/中止
    if (status === 5) {
      if (d.url) return d.url;
      throw new ApiError('上传成功但未返回 URL', 500, 'NO_URL');
    }
    if (status === 6 || status === 8) {
      throw new ApiError('上传失败（status=' + status + '）：' + (d.errorMsg || d.errorInfo || ''), 500, 'UPLOAD_FAIL');
    }
  }
  throw new ApiError('上传状态轮询超时', 0, 'POLL_TIMEOUT');
}

function fetchWithProgress(url, opts, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(opts.method || 'GET', url);
    if (opts.headers) for (const k in opts.headers) xhr.setRequestHeader(k, opts.headers[k]);
    if (onProgress) {
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ json: async () => JSON.parse(xhr.responseText) });
      else reject(new ApiError('上传失败 HTTP ' + xhr.status + ': ' + xhr.responseText.slice(0, 200), xhr.status, 'UPLOAD_FAIL'));
    };
    xhr.onerror = () => reject(new ApiError('上传网络错误', 0, 'UPLOAD_NET'));
    xhr.send(opts.body);
  });
}

// ---- 世界：生成 ----
// POST /world/v1/generations  纯文案 / 单图 / 图文
export async function createGeneration({ name, prompt, imageUrl }) {
  const body = { name: name || 'AI 空间' };
  if (prompt) body.prompt = prompt;
  if (imageUrl) body.resources = [{ url: imageUrl, type: 'image' }];
  if (!prompt && !imageUrl) throw new ApiError('请输入描述或上传一张图片', 400, 'NO_INPUT');
  return req('/world/v1/generations', { method: 'POST', body });
}

// ---- 世界：重建 ----
// POST /world/v1/reconstructions  多图(≥20)/视频/insv
export async function createReconstruction({ name, resources, scene, taskQuality, useMask }) {
  const body = {
    name: name || '重建空间',
    resources,
    scene: scene || 'space',
    taskQuality: taskQuality || 'normal'
  };
  if (useMask) body.useMask = true;
  return req('/world/v1/reconstructions', { method: 'POST', body });
}

// ---- 世界：详情 ----
// GET /world/v1/{worldId}
export async function getWorldDetail(worldId) {
  return req('/world/v1/' + worldId, { method: 'GET' });
}

// ---- 世界：列表 ----
// POST /world/v1/list
export async function listWorlds({ pageNum = 0, pageSize = 50, statusList } = {}) {
  const body = { pageNum, pageSize };
  if (statusList && statusList.length) body.statusList = statusList;
  return req('/world/v1/list', { method: 'POST', body });
}

// ---- 空间理解 ----
// POST /spatial-understanding/v1/tasks  inputFileUrl 须为 Asset 上传得到的 .ply
export async function createSpatialUnderstanding(inputFileUrl, transformationMatrix) {
  const body = { inputFileUrl };
  if (transformationMatrix) body.transformationMatrix = transformationMatrix;
  return req('/spatial-understanding/v1/tasks', { method: 'POST', body });
}

// GET /spatial-understanding/v1/tasks/{taskId}
export async function getSpatialUnderstandingDetail(taskId) {
  return req('/spatial-understanding/v1/tasks/' + taskId, { method: 'GET' });
}

// 下载 DSL 文本结果（result.resultSslUrl）
export async function fetchSpatialResultText(url) {
  const res = await fetch(url);
  return await res.text();
}

// ---- 轮询工具 ----
// 轮询世界详情直到终态，回调每次状态
export function pollWorld(worldId, onUpdate, opts = {}) {
  const interval = opts.interval || 5000;
  const timeout = opts.timeout || 10 * 60 * 1000;
  const start = Date.now();
  let stopped = false;
  const stop = () => { stopped = true; };
  const promise = (async () => {
    while (!stopped) {
      const detail = await getWorldDetail(worldId);
      onUpdate && onUpdate(detail);
      const s = detail.status;
      if (s === 'SUCCEEDED' || s === 'FAILED' || s === 'CANCELED' || s === 'TIMEOUT' || s === 'REJECTED') {
        return detail;
      }
      if (Date.now() - start > timeout) throw new ApiError('轮询超时', 0, 'POLL_TIMEOUT');
      await sleep(interval);
    }
    throw new ApiError('已取消', 0, 'POLL_CANCELED');
  })();
  return { promise, stop };
}

export function pollSpatial(taskId, onUpdate, opts = {}) {
  const interval = opts.interval || 5000;
  const timeout = opts.timeout || 10 * 60 * 1000;
  const start = Date.now();
  let stopped = false;
  const stop = () => { stopped = true; };
  const promise = (async () => {
    while (!stopped) {
      const detail = await getSpatialUnderstandingDetail(taskId);
      onUpdate && onUpdate(detail);
      const s = detail.status;
      if (s === 'SUCCEEDED' || s === 'FAILED' || s === 'TIMEOUT') return detail;
      if (Date.now() - start > timeout) throw new ApiError('轮询超时', 0, 'POLL_TIMEOUT');
      await sleep(interval);
    }
    throw new ApiError('已取消', 0, 'POLL_CANCELED');
  })();
  return { promise, stop };
}

// ---- 测试连接 ----
export async function testConnection() {
  const r = await listWorlds({ pageNum: 0, pageSize: 1 });
  return true;
}

// ---- 工具 ----
export function statusLabel(s) { return STATUS[s] || s; }
export function fmtTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
