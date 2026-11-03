// src/lib/feedback.ts
// Handles device haptic vibration and synthetic camera sounds.
// 100% offline, zero external dependencies or audio asset files.

export type HapticType =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'shutter'
  | 'success'
  | 'warning'
  | 'selection';

export function isHapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

export function isSoundSupported(): boolean {
  return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
}

export function getHapticsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('geocamera_haptics') !== 'false';
}

export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('geocamera_haptics', enabled ? 'true' : 'false');
}

export function getSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('geocamera_sound') !== 'false';
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('geocamera_sound', enabled ? 'true' : 'false');
}

export function getAutoGpsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('geocamera_autogps') === 'true';
}

export function setAutoGpsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('geocamera_autogps', enabled ? 'true' : 'false');
}

export function getHighAccuracyEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('geocamera_high_acc') !== 'false';
}

export function setHighAccuracyEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('geocamera_high_acc', enabled ? 'true' : 'false');
}

/**
 * Triggers device vibration with specific tactile patterns
 */
export function triggerHaptic(type: HapticType = 'light'): void {
  if (typeof window === 'undefined') return;
  if (!getHapticsEnabled() || !isHapticsSupported()) return;

  try {
    switch (type) {
      case 'selection':
        // Extremely crisp tick for toggles / tabs
        navigator.vibrate(10);
        break;
      case 'light':
        // Gentle tap for button presses
        navigator.vibrate(18);
        break;
      case 'medium':
        // Noticeable click for key actions
        navigator.vibrate(35);
        break;
      case 'heavy':
        // Strong tactile impact
        navigator.vibrate(55);
        break;
      case 'shutter':
        // Double-tap camera shutter snap feel: press -> shutter travel -> click
        navigator.vibrate([25, 30, 45]);
        break;
      case 'success':
        // Positive ascending tactile sequence
        navigator.vibrate([15, 45, 25]);
        break;
      case 'warning':
        // Pulsing warning/danger rumble
        navigator.vibrate([35, 40, 35, 40, 45]);
        break;
    }
  } catch {
    // Fail silently on browsers that block vibration in background
  }
}

let sharedAudioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (!isSoundSupported()) return null;
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Synthesizes a realistic mechanical camera shutter sound completely offline using Web Audio API.
 * 0 byte external files needed!
 */
export function playShutterSound(): void {
  if (!getSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // First click (mirror raise / shutter blade start)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(180, now);
    osc1.frequency.exponentialRampToValueAtTime(35, now + 0.05);

    gain1.gain.setValueAtTime(0.4, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.06);

    // Second click (shutter blade curtain close) - 50ms later
    const t2 = now + 0.045;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(650, t2);
    osc2.frequency.exponentialRampToValueAtTime(90, t2 + 0.04);

    gain2.gain.setValueAtTime(0.3, t2);
    gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.04);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t2);
    osc2.stop(t2 + 0.05);
  } catch {
    // Audio autoplay restrictions or error
  }
}

/**
 * Short crisp click sound for toggles or timers
 */
export function playTickSound(highPitch = false): void {
  if (!getSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const freq = highPitch ? 880 : 440;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  } catch {
    // Ignore audio error
  }
}
