/**
 * A short victory flourish, synthesized with the Web Audio API rather than
 * shipping an audio file -- no asset, no licensing, and it still works offline.
 * Safe to call anywhere: if audio is blocked or unsupported it silently does
 * nothing. (Browsers allow this because a win always follows user clicks.)
 */
export function playWinSound(): void {
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const start = ctx.currentTime;
    // A rising major arpeggio: C5 - E5 - G5 - C6.
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = frequency;

      const at = start + index * 0.12;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(0.22, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);

      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.6);
    });

    // Release the audio device once the flourish has finished.
    window.setTimeout(() => void ctx.close().catch(() => undefined), 1600);
  } catch {
    /* audio unavailable -- the visual celebration still plays */
  }
}
