/**
 * Zero-dependency Web Audio API chime + mobile haptic vibration
 * triggered when a student's ticket transitions to "called" or is re-called.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  return audioCtx;
}

export function unlockAudioOnGesture(): void {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  } catch {
    // Ignore autoplay restrictions
  }
}

function scheduleChime(ctx: AudioContext): void {
  const now = ctx.currentTime;
  // Bright 3-note MSU-IIT campus chime: D5 -> F#5 -> A5
  const notes = [
    { freq: 587.33, delay: 0, duration: 0.42 },
    { freq: 739.99, delay: 0.14, duration: 0.44 },
    { freq: 880.0, delay: 0.28, duration: 0.65 },
  ];

  notes.forEach(({ freq, delay, duration }) => {
    const startAt = now + delay;

    // Primary sine tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startAt);

    gain.gain.setValueAtTime(0.001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.24, startAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.03);

    // Subtle bell overtone for mobile speaker clarity
    const overtone = ctx.createOscillator();
    const overtoneGain = ctx.createGain();
    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(freq * 2, startAt);

    overtoneGain.gain.setValueAtTime(0.001, startAt);
    overtoneGain.gain.exponentialRampToValueAtTime(0.055, startAt + 0.02);
    overtoneGain.gain.exponentialRampToValueAtTime(0.001, startAt + duration * 0.6);

    overtone.connect(overtoneGain);
    overtoneGain.connect(ctx.destination);
    overtone.start(startAt);
    overtone.stop(startAt + duration * 0.65);
  });
}

export function playCalledAlert(soundEnabled: boolean): void {
  // Vibrate mobile devices when supported
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([220, 90, 220, 90, 340]);
    } catch {
      // Ignore vibration failures
    }
  }

  if (!soundEnabled) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => scheduleChime(ctx))
        .catch(() => {});
    } else {
      scheduleChime(ctx);
    }
  } catch {
    // Audio playback blocked or unavailable
  }
}