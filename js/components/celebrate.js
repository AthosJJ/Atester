/* Petite gerbe de confettis quand on marque une recommandation comme testée. */
import { reducedMotion } from '../utils.js';

export function celebrate(x, y, colors = ['#E8846A', '#F2A33A', '#2E8B57', '#3A7BD5']) {
  if (reducedMotion() || !Element.prototype.animate) return;
  const wrap = document.createElement('div');
  wrap.className = 'burst';
  wrap.setAttribute('aria-hidden', 'true');
  const n = 22;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    if (i % 3 === 0) p.className = 'sq';
    p.style.setProperty('--c', colors[i % colors.length]);
    wrap.appendChild(p);
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const dist = 70 + Math.random() * 80;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 40;
    p.animate([
      { transform: `translate(${x - 4}px, ${y - 4}px) scale(1) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${x + dx}px, ${y + dy + 60}px) scale(.35) rotate(${Math.round(Math.random() * 540)}deg)`, opacity: 0 }
    ], { duration: 750 + Math.random() * 450, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1400);
}
