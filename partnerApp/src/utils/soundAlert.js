import { Platform, Vibration } from 'react-native';

class SoundAlertManager {
  constructor() {
    this.interval = null;
    this.audioCtx = null;
    this.isPlaying = false;
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;

    // 📳 Native Mobile: Trigger continuous pulsed vibration
    if (Platform.OS !== 'web') {
      try {
        Vibration.vibrate([0, 500, 300, 500], true);
      } catch (e) {
        console.warn('Vibration API not supported:', e);
      }
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        this.audioCtx = new AudioContextClass();

        const playChime = () => {
          if (!this.isPlaying || !this.audioCtx) return;
          if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
          }

          // Two-tone bell alert (Swiggy / Zomato order alert style)
          const now = this.audioCtx.currentTime;

          // Tone 1
          const osc1 = this.audioCtx.createOscillator();
          const gain1 = this.audioCtx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(784, now); // G5
          gain1.gain.setValueAtTime(0.4, now);
          gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
          osc1.connect(gain1);
          gain1.connect(this.audioCtx.destination);
          osc1.start(now);
          osc1.stop(now + 0.3);

          // Tone 2
          const osc2 = this.audioCtx.createOscillator();
          const gain2 = this.audioCtx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1046.5, now + 0.2); // C6
          gain2.gain.setValueAtTime(0.45, now + 0.2);
          gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
          osc2.connect(gain2);
          gain2.connect(this.audioCtx.destination);
          osc2.start(now + 0.2);
          osc2.stop(now + 0.6);
        };

        playChime();
        this.interval = setInterval(playChime, 1400);
      } catch (err) {
        console.warn('Web Audio chime initialization failed:', err);
      }
    }
  }

  stop() {
    this.isPlaying = false;
    if (Platform.OS !== 'web') {
      try {
        Vibration.cancel();
      } catch (e) {}
    }
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch (e) {}
      this.audioCtx = null;
    }
  }
}

export const soundAlert = new SoundAlertManager();
