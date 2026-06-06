// Lightweight platform feature detection. Used for iOS-specific hints
// (silent switch, share Shortcut) and capability gating.

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as Mac; detect via touch points.
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

export function canShareText(): boolean {
  return typeof navigator.share === 'function';
}

export function canShareFiles(): boolean {
  return (
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    (() => {
      try {
        const f = new File(['x'], 'x.txt', { type: 'text/plain' });
        return navigator.canShare({ files: [f] });
      } catch {
        return false;
      }
    })()
  );
}

export function hasHaptics(): boolean {
  return typeof navigator.vibrate === 'function';
}

export function hasSpeech(): boolean {
  return typeof window.speechSynthesis !== 'undefined';
}

export function hasWakeLock(): boolean {
  return 'wakeLock' in navigator;
}
