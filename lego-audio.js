/**
 * LEGO Audio Engine (lego-audio.js)
 * 外部SEファイル不要の Web Audio API 内蔵シンセ＋BGM2曲シームレス制御
 */
class LegoSoundEngine {
    constructor(options = {}) {
        this.ctx = null;
        this.isMuted = true;
        this.currentTrack = null;
        this.bgmTitle = options.bgmTitleSrc ? this._createAudio(options.bgmTitleSrc, options.titleVol ?? 0.32) : null;
        this.bgmMain = options.bgmMainSrc ? this._createAudio(options.bgmMainSrc, options.mainVol ?? 0.28) : null;
    }

    _createAudio(src, vol) {
        try {
            const a = new Audio(src);
            a.loop = true;
            a.volume = vol;
            return a;
        } catch (e) {
            return null;
        }
    }

    initCtx() {
        if (!this.ctx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) this.ctx = new Ctx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    toggleMute(buttonEl, activeScene = 'title') {
        this.isMuted = !this.isMuted;
        if (buttonEl) {
            buttonEl.textContent = this.isMuted ? '🔇 消音中' : '🔊 音声ON';
        }
        if (this.isMuted) {
            this.stopAllBgm();
        } else {
            this.initCtx();
            this.playBgm(activeScene);
            this.playClick();
        }
        return !this.isMuted;
    }

    playBgm(scene) {
        const target = scene === 'main' ? this.bgmMain : this.bgmTitle;
        if (!target) return;
        // 同じ曲が再生中なら途切れさせない（シームレス再生教訓）
        if (this.currentTrack === target && !target.paused) return;
        this.stopAllBgm();
        this.currentTrack = target;
        if (!this.isMuted) {
            target.play().catch(() => {});
        }
    }

    stopAllBgm() {
        [this.bgmTitle, this.bgmMain].forEach(a => {
            if (a && !a.paused) a.pause();
        });
    }

    playTone(freq, duration = 0.14, type = 'sine', gainVal = 0.2) {
        if (this.isMuted) return;
        this.initCtx();
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(gainVal, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + duration);
        } catch (e) {}
    }

    playClick() { this.playTone(580, 0.06, 'triangle', 0.18); }
    playLightOn() { this.playTone(880, 0.10, 'sine', 0.22); }
    playHarisen() {
        this.playTone(170, 0.08, 'sawtooth', 0.24);
        setTimeout(() => this.playTone(620, 0.11, 'square', 0.16), 45);
    }
    playAlert() {
        this.playTone(240, 0.18, 'sawtooth', 0.26);
        setTimeout(() => this.playTone(180, 0.26, 'sawtooth', 0.28), 140);
    }
    playArpeggio(notes = [440, 554.37, 659.25, 880]) {
        notes.forEach((f, idx) => setTimeout(() => this.playTone(f, 0.12, 'triangle', 0.22), idx * 60));
    }
    playSuccess() {
        this.playArpeggio([523.25, 659.25, 783.99, 1046.5]);
    }
    playFanfare() {
        const seq = [
            { f: 523.25, t: 0, d: 0.14 },
            { f: 523.25, t: 140, d: 0.14 },
            { f: 523.25, t: 280, d: 0.14 },
            { f: 659.25, t: 420, d: 0.35 },
            { f: 783.99, t: 740, d: 0.26 },
            { f: 1046.5, t: 980, d: 0.55 }
        ];
        seq.forEach(n => setTimeout(() => this.playTone(n.f, n.d, 'triangle', 0.26), n.t));
    }
}
window.LegoSoundEngine = LegoSoundEngine;

