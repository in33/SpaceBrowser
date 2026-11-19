# 空间浏览器 SpaceBrowser.cn

> Play in 3D, Create with Aholo —— 群核科技 Aholo 全球 3D AI 黑客松参赛作品

**一句话介绍**：用一句话或一组照片，把真实或想象的空间变成可在浏览器中自由漫游的沉浸式 3D 世界。

---

## 一、项目概述

**空间浏览器（SpaceBrowser.cn）** 是一款面向大众的 **3D 空间创作与漫游工具**。它让任何人——无需 3D 建模基础、无需安装任何软件——都能：

- **AI 生成空间**：输入一段文字描述（或附带一张参考图），由群核 Aholo 世界生成（Spatial Gen）能力产出可漫游的高保真 3D 空间；
- **照片重建空间**：上传 20+ 张全角度照片，由 Aholo 3D 高斯泼溅（3DGS）重建能力还原真实物理场景；
- **浏览器内漫游**：生成的 3DGS 模型（PLY/SPZ）直接在浏览器中实时渲染，支持轨道俯瞰与第一人称漫游双视角；
- **空间智能理解**：对重建的空间进行墙体/门/窗/物体识别，输出结构化语义结果。

项目定位是把 Aholo 的空间智能能力，封装成一个**「能用、敢玩、好看」**的浏览器原生产品，让物理世界与数字世界在浏览器中重叠。

---

## 二、为什么做这个项目（创意来源）

Aholo 的 3DGS 与 Lux3D 能力非常强大，但目前主要面向开发者（API/SDK）。普通用户难以体验"一句话生成 3D 空间"的震撼。我们思考：

> **如果任何人都能在浏览器里，用一句话或一组照片，瞬间走进一个 3D 空间，会怎样？**

这能覆盖数字孪生、文旅/文博数字化、房产看房、室内设计预演、影视虚拟制片、3D 创作素材库等场景。于是我们做了"空间浏览器"——一个把 Aholo 能力产品化的浏览器应用。

---

## 三、群核技术栈应用（评分维度 01，权重 30%）

本项目**深度、完整地**使用了 Aholo 开放平台的核心能力，技术栈在项目中承担**核心作用**：

| Aholo 能力 | 接口 | 在项目中的作用 |
| --- | --- | --- |
| **世界生成（Spatial Gen）** | `POST /world/v1/generations` | 文字/单图 → 3D 空间，核心创作入口 |
| **世界重建（3DGS）** | `POST /world/v1/reconstructions` | 多图（≥20）→ 高保真真实场景重建 |
| **世界详情查询** | `GET /world/v1/{worldId}` | 轮询异步任务进度与产物（SPZ/PLY/全景图） |
| **世界列表** | `POST /world/v1/list` | "我的空间"库，按状态分页查询 |
| **资产上传（Asset）** | `GET /asset/v1/token` + OUS 直传 | 上传参考图/重建照片，获取可访问 URL |
| **空间理解** | `POST /spatial-understanding/v1/tasks` | 对 PLY 点云识别墙/门/窗/物体 Bbox |

**调用链示例（AI 生成空间）**：
```
用户输入 prompt → (可选) Asset 上传参考图得到 URL
  → POST /world/v1/generations { prompt, resources } → 返回 worldId
  → 轮询 GET /world/v1/{worldId} 直至 SUCCEEDED
  → 取 assets.splats.urls.plyPath / spzPath / imagery.panoUrl
  → 浏览器内 Three.js + GaussianSplats3D 加载渲染
```

**调用链示例（照片重建）**：
```
用户上传 20+ 张照片 → 逐张 Asset 上传（OUS 单传/分块）得到 URL 列表
  → POST /world/v1/reconstructions { resources, scene, taskQuality } → 返回 worldId
  → 轮询 GET /world/v1/{worldId} 直至 SUCCEEDED
  → 取 assets.splats.urls.plyPath
  → 浏览器渲染 + 可选空间理解
```

> 实测：用 prompt "现代简约风格客厅…" 成功生成 3D 空间，返回 **249,642 个高斯点**的 PLY 模型 + 4096px 全景图，在浏览器中流畅漫游。

---

## 四、创新性（评分维度 03，权重 20%）

1. **浏览器原生 3DGS 漫游，零安装**：不依赖任何 App/插件，纯 HTML+JS+CSS，打开网页即可生成并漫游 3D 空间；
2. **AI 生成 + 实景重建双模式统一体验**：把"想象（生成）"与"现实（重建）"两种 3DGS 来源统一在同一产品体验中；
3. **空间理解结果可视化**：不仅重建空间，还能用空间理解 API 识别墙/门/窗/物体，输出结构化语义；
4. **沉浸式第一人称 + 轨道双视角**：WASD 漫游（像游戏一样走进空间）+ 轨道俯瞰（上帝视角审视空间）自由切换；
5. **任务全流程可视化**：从上传、排队、预处理、重建到完成，全程进度条 + 状态提示 + 完成自动打开漫游；
6. **全景图联动**：AI 生成空间同时产出全景图，可在漫游 3D 模型与查看全景图间切换。

---

## 五、作品有趣程度（评分维度 02，权重 25%）

- **"一句话走进一个空间"** 的体验极具传播性，适合小红书/短视频展示；
- 第一人称漫游模式让用户像玩 FPS 游戏一样探索 AI 生成的空间；
- 灵感预设（客厅/卧室/茶室/画廊…）降低创作门槛，一键生成不同风格空间；
- 精选展厅内置示范 3DGS 场景，评委无需等待即可立即体验漫游效果。

---

## 六、完成度（评分维度 04，权重 20%）

- ✅ **核心体验完整**：生成、重建、列表、漫游、全景、空间理解全链路打通；
- ✅ **Demo 稳定可运行**：纯静态部署，本地 `python -m http.server` 或任意静态托管即可运行；
- ✅ **错误处理完善**：API 错误、网络错误、积分不足、格式不支持等均有友好提示；
- ✅ **响应式适配**：桌面/移动端自适应；
- ✅ **实测验证**：AI 生成空间成功产出 249K splats 的 PLY 并在浏览器渲染；示范场景 107K splats 流畅渲染。

---

## 七、技术架构

```
用户输入（文字 / 单图 / 多图照片）
        │
        ▼
Aholo Open API（https://api.aholo.cn，Header: Authorization）
  ├─ Asset   GET /asset/v1/token → OUS 单传/分块直传 → 可访问 URL
  ├─ World   POST /world/v1/generations     （AI 生成）
  │          POST /world/v1/reconstructions （照片重建）
  │          GET  /world/v1/{worldId}       （轮询进度与产物）
  │          POST /world/v1/list            （我的空间库）
  └─ SpatialUnderstanding
            POST /spatial-understanding/v1/tasks （墙/门/窗/Bbox）
        │
        ▼
浏览器渲染（Three.js 0.160 + @mkkellogg/gaussian-splats-3d 0.4.7）
  ├─ 加载 PLY / SPZ / KSplat 高斯泼溅模型
  ├─ 轨道视角（OrbitControls）+ 第一人称漫游（WASD）
  ├─ 全景图查看
  └─ 空间理解结果可视化
```

**技术栈**：
- 前端：纯 HTML5 + CSS3 + 原生 JavaScript（ES Modules），无构建工具
- 3D 渲染：Three.js + GaussianSplats3D（支持 PLY/SPZ/Splat/KSplat）
- 文件上传：浏览器端 MD5 计算 + OUS 单传/分块上传 + 状态轮询
- API：Aholo Open API（REST + 异步轮询）
- 部署：纯静态，可托管于任意静态服务器 / CDN / GitHub Pages

---

## 八、文件结构

```
SpaceBrowser/
├── index.html              # 主页面（创建/库/展厅/关于 + 查看器 + 弹窗）
├── css/
│   └── style.css           # 全局样式（深色沉浸式主题 + 粒子背景 + 流程图）
├── js/
│   ├── config.js           # 配置（API Key/网关）+ 精选展厅 + 灵感预设 + 场景灵感
│   ├── api.js              # Aholo API 客户端（Asset/World/SpatialUnderstanding + 轮询）
│   ├── md5.js              # 浏览器端 MD5 计算（OUS 上传所需）
│   ├── particles.js        # 粒星粒子背景动画
│   ├── viewer.js           # 3DGS 漫游查看器（Three.js + GaussianSplats3D）
│   └── app.js              # 主应用逻辑（UI 交互、任务流、状态管理）
├── assets/
│   ├── bonsai.ksplat       # 内置示范 3DGS 场景（室内盆景，20MB）
│   └── truck.ksplat        # 内置示范 3DGS 场景（室外卡车，28MB）
├── README.md               # 本文件（项目报告书）
└── 提交说明.md             # 提交材料说明
```

---

## 九、本地运行

```bash
# 方式一：Python 内置服务器
cd SpaceBrowser
python -m http.server 8123
# 浏览器打开 http://localhost:8123

# 方式二：任意静态服务器（如 npx serve / VS Code Live Server）
```

> 已预置赛事方提供的体验 API Key（`XeYyHAKkhYtMINu`），开箱即用。
> 也可在右上角 ⚙️ 设置中替换为自己的 Aholo API Key（[labs.aholo.cn/api-keys](https://labs.aholo.cn/api-keys) 申请）。

---

## 十、使用流程

### AI 生成空间
1. 进入「创建空间」→ 选择「AI 生成空间」
2. 输入空间描述（或点击灵感预设），可选上传一张参考图
3. 点击「生成 3D 空间」→ 任务进度浮窗实时显示进度
4. 完成后自动打开 3D 漫游查看器，可轨道/漫游/查看全景

### 照片重建空间
1. 选择「照片重建空间」
2. 上传至少 20 张全角度照片（拖拽或点击）
3. 选择场景类型（空间/物体）与重建质量
4. 点击「开始重建」→ 上传 + 重建进度全程可视化
5. 完成后进入漫游

### 我的空间
- 查看所有任务（进行中/已完成/失败），点击已完成的空间进入漫游，点击进行中的查看进度
- 每张卡片悬停显示 🗑️ 删除按钮（二次点击确认，仅本地隐藏，可恢复）

### 精选展厅
- 即时漫游：2 个内置示范 3DGS 场景（室内盆景 + 室外卡车），无需等待生成
- 灵感场景：8 个带真实室内图的场景卡（客厅/卧室/茶室/Loft/厨房/画廊/图书馆/庭院），点击一键填入 prompt 生成

---

## 十一、应用价值与场景

| 场景 | 价值 |
| --- | --- |
| 数字孪生 | 文物/建筑/场馆高精度数字化存档与沉浸式活化 |
| 文旅/文博 | 景区/博物馆线上漫游，打破空间界限 |
| 房产看房 | 拍照重建房源，线上沉浸式看房 |
| 室内设计 | AI 生成设计概念空间，设计预演与沟通 |
| 影视制片 | 虚拟场景快速生成，虚拟制片预览 |
| 3D 创作素材 | 生成/重建的 3DGS 空间作为创作素材库 |

---

## 十二、已知限制与未来规划

**当前限制**：
- Aholo SPZ 格式为 v3，当前浏览器渲染库（GaussianSplats3D 0.4.7）仅支持 SPZ v1-2，故优先使用 PLY 格式渲染（功能完整，仅文件略大）；
- 空间理解 API 需消耗额外积分，演示 Key 额度有限；
- 3DGS 渲染性能取决于设备 GPU，移动端体验受限。

**未来规划**：
- 接入 Lux3D 图生/文生 3D 物体，在空间中摆放 AI 生成的家具/物件；
- 接入 RenderCloud 实时渲染流，实现 Mesh+3DGS 混合渲染编辑；
- 支持空间标注、测量、分享链接；
- 支持 Insta360 全景视频（.insv）重建；
- PWA 离线化 + 移动端优化。

---

## 十三、团队

空间浏览器 SpaceBrowser.cn —— 群核科技 Aholo 全球 3D AI 黑客松参赛作品。

**Play in 3D, Create with Aholo.**
