// 착수 소리
//
// 나무 장기알이 나무판에 부딪는 "딱" 소리를 그 자리에서 만들어 낸다.
// 음원 파일을 두지 않는 이유는 셋이다.
//
//   1. 이 도구는 인터넷 없이도 돌아가야 한다. COEP require-corp 아래에서는
//      바깥에서 파일을 끌어오는 것도 막힌다.
//   2. 녹음 파일은 출처와 라이선스를 따라다녀야 한다.
//   3. 합성이면 둘 때마다 소리를 조금씩 흔들 수 있다. 같은 파일을 반복 재생하면
//      기계가 찍어내는 소리처럼 들린다.
//
// 소리의 구성은 실제 타격음을 흉내 낸 것이다.
//
//   · 부딪는 순간  — 아주 짧은 잡음 한 방 (20ms). 이게 "딱" 의 앞부분이다.
//   · 울림        — 감쇠하는 사인파 넷. 낮은 쪽은 판이, 높은 쪽은 알이 낸다.
//
// 브라우저는 사람이 무언가를 누르기 전에는 소리를 내주지 않는다(자동재생 차단).
// 그래서 첫 수를 둘 때 깨우고, 그래도 막히면 소리 없이 넘어간다.

/** 울림 한 가닥: [주파수(Hz), 세기, 감쇠시간(초)] */
type Partial = [number, number, number];

interface Hit {
  /** 잡음의 중심 주파수 */
  noiseHz: number;
  noiseGain: number;
  noiseDecay: number;
  partials: Partial[];
  gain: number;
}

/** 그냥 두는 소리 — 짧고 단단하다. */
const MOVE: Hit = {
  noiseHz: 2800,
  noiseGain: 0.5,
  noiseDecay: 0.02,
  partials: [
    [210, 0.16, 0.15],
    [640, 0.26, 0.1],
    [1520, 0.18, 0.055],
    [3100, 0.1, 0.028],
  ],
  gain: 0.6,
};

/** 잡는 소리 — 상대 알을 걷어내고 그 자리에 놓느라 두 번 닿는다. */
const CAPTURE: Hit = {
  noiseHz: 2100,
  noiseGain: 0.62,
  noiseDecay: 0.028,
  partials: [
    [165, 0.24, 0.2],
    [520, 0.3, 0.13],
    [1280, 0.2, 0.07],
    [2700, 0.1, 0.03],
  ],
  gain: 0.75,
};

export type MoveSound = "move" | "capture";

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/** 소리를 낼 수 있으면 AudioContext 를, 못 내면 null 을 준다. */
function open(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  // 사람이 누르기 전에 만들어진 context 는 멈춰 있다. 누른 김에 깨운다.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** 잡음은 한 번만 만들어 두고 계속 쓴다. */
function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noise) {
    const frames = Math.floor(ac.sampleRate * 0.12);
    noise = ac.createBuffer(1, frames, ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

/** 0 으로는 지수 감쇠를 걸 수 없어서 들리지 않을 만큼 작은 값으로 내린다. */
const SILENT = 0.0001;

function strike(ac: AudioContext, hit: Hit, at: number, level: number) {
  // 둘 때마다 높이를 조금씩 흔든다. 실제로도 같은 소리가 두 번 나지는 않는다.
  const detune = 0.96 + Math.random() * 0.08;

  const out = ac.createGain();
  out.gain.value = hit.gain * level;
  out.connect(ac.destination);

  // 부딪는 순간
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = hit.noiseHz * detune;
  band.Q.value = 1.1;
  const noiseEnv = ac.createGain();
  noiseEnv.gain.setValueAtTime(hit.noiseGain, at);
  noiseEnv.gain.exponentialRampToValueAtTime(SILENT, at + hit.noiseDecay);
  src.connect(band).connect(noiseEnv).connect(out);
  src.start(at);
  src.stop(at + hit.noiseDecay + 0.02);

  // 울림
  for (const [hz, amp, decay] of hit.partials) {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz * detune;
    const env = ac.createGain();
    env.gain.setValueAtTime(amp, at);
    env.gain.exponentialRampToValueAtTime(SILENT, at + decay);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + decay + 0.02);
  }
}

/**
 * 한 수 두는 소리를 낸다.
 *
 * 소리를 못 내는 환경(자동재생 차단, Web Audio 없음)에서는 조용히 넘어간다.
 * 소리가 안 난다고 대국이 멈추면 안 된다.
 */
export function playMoveSound(kind: MoveSound): void {
  const ac = open();
  if (!ac) return;
  try {
    const now = ac.currentTime + 0.001;
    if (kind === "capture") {
      // 걷어내고, 잠깐 뒤에 내려놓는다.
      strike(ac, MOVE, now, 0.5);
      strike(ac, CAPTURE, now + 0.055, 1);
    } else {
      strike(ac, MOVE, now, 1);
    }
  } catch {
    /* 소리는 없어도 되는 것이다 */
  }
}
