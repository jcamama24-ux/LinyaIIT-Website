/**
 * Zero-dependency Web Audio API chime + mobile haptic vibration
 * triggered when a student's ticket status switches to "called".
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
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function unlockAudioOnGesture(): void {
  try {
    getAudioContext();
  } catch {
    // Ignore autoplay restrictions
  }
}

export function playCalledAlert(soundEnabled: boolean): void {
  // Vibrate Android devices if supported
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([220, 100, 220, 100, 320]);
    } catch {
      // Ignore vibration failures
    }
  }

  if (!soundEnabled) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [587.33, 880.0]; // D5 -> A5 crisp campus chime

    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.16);

      gain.gain.setValueAtTime(0.001, now + index * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.22, now + index * 0.16 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.16 + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + index * 0.16);
      osc.stop(now + index * 0.16 + 0.48);
    });
  } catch {
    // Audio playback blocked or unavailable
  }
}
