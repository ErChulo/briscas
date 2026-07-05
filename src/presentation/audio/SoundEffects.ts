type SoundName = 'play' | 'capture' | 'win';

/** Lightweight synthesized UI sounds. Browser-only and isolated from domain logic. */
export class SoundEffects {
  private context: AudioContext | null = null;
  private enabled = true;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public unlock(): void {
    const context = this.getContext();
    if (context?.state === 'suspended') {
      void context.resume().catch(() => undefined);
    }
  }

  public play(sound: SoundName): void {
    if (!this.enabled) {
      return;
    }

    const context = this.getContext();
    if (!context) {
      return;
    }

    if (context.state === 'suspended') {
      void context
        .resume()
        .then(() => {
          if (context.state === 'running') {
            this.play(sound);
          }
        })
        .catch(() => undefined);
      return;
    }

    if (sound === 'play') {
      this.cardTap(context);
    } else if (sound === 'capture') {
      this.captureSweep(context);
    } else {
      this.winChime(context);
    }
  }

  private getContext(): AudioContext | null {
    if (this.context) {
      return this.context;
    }

    const AudioContextClass = globalThis.AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    this.context = new AudioContextClass();
    return this.context;
  }

  private cardTap(context: AudioContext): void {
    const start = context.currentTime;
    this.tone(context, 560, start, 0.045, 0.055, 'triangle');
    this.tone(context, 330, start + 0.035, 0.04, 0.035, 'sine');
  }

  private captureSweep(context: AudioContext): void {
    const start = context.currentTime;
    this.tone(context, 260, start, 0.08, 0.045, 'sine', 470);
    this.tone(context, 190, start + 0.06, 0.11, 0.035, 'triangle', 310);
  }

  private winChime(context: AudioContext): void {
    const start = context.currentTime;
    [440, 554, 659].forEach((frequency, index) => {
      this.tone(context, frequency, start + index * 0.09, 0.13, 0.045, 'sine');
    });
  }

  private tone(
    context: AudioContext,
    frequency: number,
    start: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    endFrequency?: number,
  ): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);

    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}
