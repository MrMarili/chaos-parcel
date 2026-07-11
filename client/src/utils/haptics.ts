/**
 * Cross-platform haptic pulse for the panic (package holder) state.
 *
 * Priority:
 * 1. iOS Safari 17.4+ — Taptic via persistent checkbox[switch] + label.click()
 * 2. Android / others — Vibration API
 *
 * Note: iOS often ignores programmatic haptics outside a user-gesture chain.
 * Call pulseHaptic() from pointer/touch handlers while the player holds the package.
 */

const ANDROID_PATTERN = [100, 50, 100, 50, 100, 50];

type IosRig = { input: HTMLInputElement; label: HTMLLabelElement };

let iosRig: IosRig | null = null;
let lastPulseAt = 0;

function canUseIosSwitch(): boolean {
  return typeof HTMLInputElement !== 'undefined' && 'switch' in HTMLInputElement.prototype;
}

function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function ensureIosRig(): IosRig | null {
  if (typeof document === 'undefined' || !canUseIosSwitch()) return null;
  if (iosRig && iosRig.input.isConnected && iosRig.label.isConnected) return iosRig;

  try {
    const id = `__chaos_haptic_switch_${Math.random().toString(36).slice(2, 10)}`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.id = id;
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';

    const label = document.createElement('label');
    label.htmlFor = id;
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';

    document.body.appendChild(input);
    document.body.appendChild(label);
    iosRig = { input, label };
    return iosRig;
  } catch {
    return null;
  }
}

function triggerIosSwitchHaptic(): boolean {
  const rig = ensureIosRig();
  if (!rig) return false;
  try {
    rig.label.click();
    return true;
  } catch {
    return false;
  }
}

/**
 * One panic pulse. Prefer iOS switch when available (even if vibrate exists as a stub).
 * Safe to call from timers; may be silent on iOS until a real pointer gesture runs.
 */
export function pulseHaptic(): void {
  if (canUseIosSwitch()) {
    triggerIosSwitchHaptic();
    return;
  }
  if (canVibrate()) {
    try {
      navigator.vibrate(ANDROID_PATTERN);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Throttled pulse for pointer/touch handlers (required for reliable iPhone Taptic).
 */
export function pulseHapticFromGesture(minIntervalMs = 450): void {
  const now = Date.now();
  if (now - lastPulseAt < minIntervalMs) return;
  lastPulseAt = now;
  pulseHaptic();
}

/** Cancel an in-progress Android vibration pattern. */
export function stopHaptic(): void {
  lastPulseAt = 0;
  if (canVibrate()) {
    try {
      navigator.vibrate(0);
    } catch {
      /* ignore */
    }
  }
}

/** Create the iOS switch rig early (e.g. on first lobby touch). */
export function warmHaptics(): void {
  ensureIosRig();
}
