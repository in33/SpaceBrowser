// ===== 空间浏览器 — 粒子背景动画 =====
// 轻量级星空粒子背景，增强视觉沉浸感
export function initParticles() {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, particles = [], raf;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function createParticles() {
    const count = Math.min(80, Math.floor(w * h / 18000));
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.8 + 0.4,
        a: Math.random() * 0.5 + 0.2,
        hue: Math.random() > 0.5 ? '91,140,255' : (Math.random() > 0.5 ? '167,139,250' : '34,211,238')
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    // 连线
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
      // 点
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.hue},${p.a})`;
      ctx.fill();
      // 连线（仅近距离）
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x, dy = p.y - q.y;
        const dist = dx * dx + dy * dy;
        if (dist < 12000) {
          const op = (1 - dist / 12000) * 0.15;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(${p.hue},${op})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    raf = requestAnimationFrame(draw);
  }

  resize();
  createParticles();
  draw();
  window.addEventListener('resize', () => { resize(); createParticles(); });
}
