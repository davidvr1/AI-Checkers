import { useEffect, useRef } from 'react';
import { playWinSound } from '../sound';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

/** How long new bursts keep launching, and the total animation window (ms). */
const BURST_WINDOW_MS = 3200;
const TOTAL_MS = 5000;

/**
 * A full-screen fireworks celebration, drawn on a canvas overlay, plus the win
 * sound. Rendered only while `active`; it never intercepts clicks, so the board
 * stays usable underneath. Colours come from the board's own palette.
 */
export function Fireworks({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    playWinSound();

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Bright, saturated firework colours -- they need to read on the light cream
    // background AND on the dark theme, so the muted board palette is too faint.
    const colors = ['#ffd24a', '#ff8a3d', '#e8544f', '#6fd08c', '#5fb8ff'];
    const particles: Particle[] = [];

    const burst = (x: number, y: number) => {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const count = 54;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.25;
        const speed = 1.8 + Math.random() * 3.6;
        particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color });
      }
    };

    let raf = 0;
    let elapsed = 0;
    let nextBurstAt = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      elapsed += dt;
      const step = dt / 16.7; // normalise to ~60fps units

      if (elapsed < BURST_WINDOW_MS && elapsed >= nextBurstAt) {
        burst(
          window.innerWidth * (0.15 + Math.random() * 0.7),
          window.innerHeight * (0.15 + Math.random() * 0.4),
        );
        nextBurstAt = elapsed + 320 + Math.random() * 320;
      }

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy += 0.045 * step; // gravity
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.life -= 0.011 * step;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color; // glow, so sparks stay visible on a pale background
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      if (elapsed < TOTAL_MS) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [active]);

  if (!active) return null;
  return <canvas ref={canvasRef} className="fireworks" aria-hidden="true" />;
}
