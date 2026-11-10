import { CanvasTexture, SRGBColorSpace } from 'three';

/**
 * Holographic station displays drawn at runtime on a canvas (no image downloads).
 * The code shown is illustrative pseudo-code, not a real program.
 */
export function makePanelTexture(kind: 'code' | 'vault' | 'forge' | 'path', active: boolean): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 340;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(15,27,58,0.72)';
  g.fillRect(0, 0, 512, 340);
  g.strokeStyle = active ? '#BFDBFF' : '#7FB8FF';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 508, 336);
  g.fillStyle = 'rgba(46,139,255,0.25)';
  g.fillRect(2, 2, 508, 40);
  ['#7FB8FF', 'rgba(127,184,255,0.6)', 'rgba(127,184,255,0.35)'].forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(28 + i * 26, 22, 7, 0, Math.PI * 2);
    g.fill();
  });
  g.font = '500 28px "JetBrains Mono", ui-monospace, monospace';
  if (kind === 'code') {
    const lines: [string, string][] = [
      ['#7FB8FF', 'function learn(skill) {'],
      ['#5BE3B8', '  practice(skill);'],
      ['#5BE3B8', '  build(project);'],
      ['#F4D58D', '  share(withPeers);'],
      ['#F2F6FF', '}'],
    ];
    lines.forEach(([col, text], i) => {
      g.fillStyle = col;
      g.fillText(text, 28, 92 + i * 46);
    });
  } else if (kind === 'vault') {
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? 'rgba(127,184,255,0.55)' : 'rgba(91,227,184,0.55)';
      g.fillRect(40 + i * 74, 80 + (i % 3) * 8, 52, 210 - (i % 3) * 8);
    }
  } else if (kind === 'forge') {
    g.strokeStyle = '#7FB8FF';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(256, 70);
    g.lineTo(380, 150);
    g.lineTo(380, 270);
    g.lineTo(256, 320);
    g.lineTo(132, 270);
    g.lineTo(132, 150);
    g.closePath();
    g.moveTo(256, 70);
    g.lineTo(256, 190);
    g.lineTo(380, 150);
    g.moveTo(256, 190);
    g.lineTo(132, 150);
    g.moveTo(256, 190);
    g.lineTo(256, 320);
    g.stroke();
  } else {
    ['Bilow', 'Dhise', 'Hage'].forEach((label, i) => {
      g.fillStyle = `rgba(46,139,255,${0.35 + i * 0.25})`;
      g.fillRect(50 + i * 140, 260 - i * 70, 130, 40 + i * 70);
      g.fillStyle = '#F2F6FF';
      g.fillText(label, 60 + i * 140, 250 - i * 70);
    });
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
