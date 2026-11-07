// Music intensity metrics: tempo, beat strength (how clearly the beat drives), loudness, brightness and
// bass share, so a bed can be matched to a reference by numbers before anyone listens.
//   node scripts/lib/music-metrics.mjs '[["name","file",startSeconds,lengthSeconds], ...]'
import {spawnSync} from 'node:child_process';

const pcm = (f, extra = []) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, ...extra, '-ac', '1', '-ar', '11025', '-f', 's16le', '-'], {maxBuffer: 1 << 30});
  return new Int16Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 2));
};
const rms = (a) => { let s = 0; for (const v of a) s += v * v; return Math.sqrt(s / Math.max(1, a.length)) / 32768; };

export function metrics(file, start = 0, length = 60) {
  const seg = ['-ss', String(start), '-t', String(length)];
  const x = pcm(file, seg), hi = pcm(file, [...seg, '-af', 'highpass=f=2500']), lo = pcm(file, [...seg, '-af', 'lowpass=f=150']);
  const hop = 256, env = [];
  for (let i = 0; i + hop < x.length; i += hop) { let s = 0; for (let j = i; j < i + hop; j++) s += x[j] * x[j]; env.push(Math.log(1e-9 + s / hop)); }
  const on = env.map((v, i) => Math.max(0, v - (env[i - 1] ?? v)));
  const mean = on.reduce((a, b) => a + b, 0) / Math.max(1, on.length);
  const o = on.map((v) => v - mean);
  const fps = 11025 / hop, ac0 = o.reduce((a, v) => a + v * v, 0) || 1;
  let best = 0, bpm = 0;
  for (let b = 70; b <= 180; b += 0.5) { const lag = Math.round((fps * 60) / b); let s = 0; for (let i = lag; i < o.length; i++) s += o[i] * o[i - lag]; if (s > best) { best = s; bpm = b; } }
  const r = rms(x);
  return {bpm, beatStrength: +(best / ac0).toFixed(2), rms: +r.toFixed(3), bright: +(rms(hi) / r).toFixed(2), bass: +(rms(lo) / r).toFixed(2)};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, f, ss, t] of JSON.parse(process.argv[2])) {
    const m = metrics(f, ss, t);
    console.log(name.padEnd(30), 'bpm', String(m.bpm).padEnd(5), 'beat strength', m.beatStrength, '| rms', m.rms, '| bright', m.bright, '| bass', m.bass);
  }
}
