// ===== 空间浏览器 — 3DGS 漫游查看器 =====
// 基于 Three.js + @mkkellogg/gaussian-splats-3d，在浏览器内渲染 SPZ/PLY/Splat
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

export class SpaceViewer {
  constructor(container) {
    this.container = container;
    this.viewer = null;
    this.currentScene = null;
    this.mode = 'orbit';        // 'orbit' | 'fps'
    this.fpsController = null;
    this._raf = null;
    this._keydown = this._onKey.bind(this);
    this._keyup = this._onKeyUp.bind(this);
    this._keys = {};
    this._onReady = null;
  }

  /**
   * 加载并显示一个 splat 场景
   * @param {Object} scene { url, format, upAxis, cameraPosition, cameraLookAt, panoUrl }
   */
  async load(scene) {
    this._clear();
    const upAxis = scene.upAxis || 'Z';
    // 优先使用场景自带 cameraUp（示范 ksplat 的官方参数带负分量，简单 Y/Z-up 会上下颠倒）
    const cameraUp = scene.cameraUp || (upAxis === 'Z' ? [0, 0, 1] : [0, 1, 0]);

    const viewerOpts = {
      cameraUp,
      initialCameraPosition: scene.cameraPosition || [0, 1, 6],
      initialCameraLookAt: scene.cameraLookAt || [0, 1, 0],
      selfDrivenMode: false,        // 我们自己驱动渲染循环
      useBuiltInControls: true,
      halfPrecisionCovariancesOnGPU: true,
      splatRenderMode: GaussianSplats3D.SplatRenderMode.Always,
      sharedMemoryForWorkers: false
    };

    this.viewer = new GaussianSplats3D.Viewer(viewerOpts);
    // 把 viewer 的 canvas 放进容器
    const renderer = this.viewer.renderer;
    if (renderer && renderer.domElement) {
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      this.container.appendChild(renderer.domElement);
    }

    // 加载 splat
    const loadOpts = {
      showLoadingUI: false,
      splatAlphaRemovalThreshold: 1,
      progressiveLoad: true,
      format: this._format(scene.format, scene.url)
    };
    await this.viewer.addSplatScene(scene.url, loadOpts);

    this.currentScene = scene;
    this._startLoop();
    this._setMode('orbit');
    if (this._onReady) this._onReady();
  }

  _format(fmt, url) {
    if (fmt) {
      const map = { PLY: GaussianSplats3D.SceneFormat.Ply, Splat: GaussianSplats3D.SceneFormat.Splat,
        KSplat: GaussianSplats3D.SceneFormat.KSplat, Spz: GaussianSplats3D.SceneFormat.Spz };
      if (map[fmt] !== undefined) return map[fmt];
    }
    if (url) {
      const u = url.toLowerCase().split('?')[0];
      if (u.endsWith('.ply')) return GaussianSplats3D.SceneFormat.Ply;
      if (u.endsWith('.splat')) return GaussianSplats3D.SceneFormat.Splat;
      if (u.endsWith('.ksplat')) return GaussianSplats3D.SceneFormat.KSplat;
      if (u.endsWith('.spz')) return GaussianSplats3D.SceneFormat.Spz;
    }
    return undefined;
  }

  _startLoop() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      if (this.mode === 'fps') this._fpsUpdate();
      this.viewer.update();
      this.viewer.render();
    };
    tick();
    this._onResize = () => this.viewer && this.viewer.updateSplatMeshResolution();
    window.addEventListener('resize', this._onResize);
  }

  _setMode(mode) {
    this.mode = mode;
    const orb = this.viewer && this.viewer.controls;
    if (mode === 'orbit') {
      if (orb) orb.enabled = true;
      document.removeEventListener('keydown', this._keydown);
      document.removeEventListener('keyup', this._keyup);
    } else {
      if (orb) orb.enabled = false;
      document.addEventListener('keydown', this._keydown);
      document.addEventListener('keyup', this._keyup);
    }
  }

  // ---- 第一人称漫游（WASD + 鼠标拖动转向） ----
  _onKey(e) { this._keys[e.code] = true; }
  _onKeyUp(e) { this._keys[e.code] = false; }

  _fpsUpdate() {
    const camera = this.viewer.camera;
    if (!camera) return;
    const speed = (this._keys['ShiftLeft'] || this._keys['ShiftRight']) ? 0.25 : 0.1;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
    const move = new THREE.Vector3();
    if (this._keys['KeyW'] || this._keys['ArrowUp']) move.add(dir);
    if (this._keys['KeyS'] || this._keys['ArrowDown']) move.sub(dir);
    if (this._keys['KeyA'] || this._keys['ArrowLeft']) move.sub(right);
    if (this._keys['KeyD'] || this._keys['ArrowRight']) move.add(right);
    if (this._keys['Space']) move.add(camera.up);
    if (this._keys['KeyQ']) move.sub(camera.up);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      camera.position.add(move);
      if (this.viewer.controls && this.viewer.controls.target) {
        this.viewer.controls.target.add(move);
      }
    }
  }

  setOrbit() { this._setMode('orbit'); }
  setFps() { this._setMode('fps'); }

  resetView() {
    if (!this.viewer || !this.currentScene) return;
    const s = this.currentScene;
    this._setMode('orbit');
    const cam = this.viewer.camera;
    if (cam && s.cameraPosition) cam.position.set(...s.cameraPosition);
    if (this.viewer.controls) {
      if (s.cameraLookAt) this.viewer.controls.target.set(...s.cameraLookAt);
      this.viewer.controls.update();
    }
  }

  togglePointMode() {
    if (!this.viewer || !this.viewer.splatMesh) return;
    const m = this.viewer.splatMesh;
    m.pointCloudMode = !m.pointCloudMode;
  }

  onReady(fn) { this._onReady = fn; }

  _clear() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    document.removeEventListener('keydown', this._keydown);
    document.removeEventListener('keyup', this._keyup);
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    if (this.viewer) {
      // 先停止渲染循环，再 dispose，避免库内部 removeChild 冲突
      try { if (this.viewer.renderer) this.viewer.renderer.setAnimationLoop(null); } catch {}
      try { this.viewer.dispose(); } catch {}
      this.viewer = null;
    }
    // 安全清空容器
    this.container.innerHTML = '';
  }

  dispose() { this._clear(); }
}
