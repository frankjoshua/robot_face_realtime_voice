// HAL 9000-style single red eye renderer
class HalEye {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.dpr = Math.max(1, window.devicePixelRatio || 1);
        this.cssWidth = window.innerWidth;
        this.cssHeight = window.innerHeight;
        this.rendering = false;
        this.animationsStarted = false;
        this.startTime = performance.now();
        this.mood = 'neutral';
        this.init();
    }

    init() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        // Animate by default so behavior is visible without external triggers
        this.startRendering();
        this.startAnimations();
    }

    resizeCanvas() {
        const vw = (window.visualViewport && window.visualViewport.width) || window.innerWidth;
        const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
        this.cssWidth = vw;
        this.cssHeight = vh;
        this.dpr = Math.max(1, window.devicePixelRatio || 1);
        this.canvas.width = Math.round(vw * this.dpr);
        this.canvas.height = Math.round(vh * this.dpr);
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    startRendering() {
        if (this.rendering) return;
        this.rendering = true;
        try { console.log('[hal] startRendering'); } catch (_) {}
        this.render();
    }

    stopRendering() {
        this.rendering = false;
    }

    startAnimations() {
        this.animationsStarted = true;
        try { console.log('[hal] startAnimations'); } catch (_) {}
        if (!this.rendering) this.startRendering();
    }

    stopAnimations() {
        this.animationsStarted = false;
    }

    setMood(mood) {
        const allowed = new Set(['neutral', 'happy', 'sad', 'angry']);
        if (!allowed.has(mood)) return;
        this.mood = mood;
    }

    moodProfile() {
        // Different pulse speeds/amps and glow for moods
        switch (this.mood) {
            case 'happy':
                return { speed: 1.6, amp: 0.60, base: 0.95, glow: 0.12, palette: 'happy' };
            case 'sad':
                return { speed: 0.6, amp: 0.35, base: 0.80, glow: 0.06, palette: 'sad' };
            case 'angry':
                return { speed: 2.2, amp: 0.70, base: 1.0, glow: 0.16, palette: 'angry' };
            default:
                return { speed: 1.2, amp: 0.55, base: 0.9, glow: 0.10, palette: 'neutral' };
        }
    }

    lensColors(palette) {
        // Return color stops for radial gradient depending on mood palette
        if (palette === 'happy') {
            return ['#fff4cc', '#ffa366', '#ff3b2f', '#990000', '#260000'];
        }
        if (palette === 'sad') {
            return ['#ffd6d6', '#cc4242', '#990d0d', '#330000', '#0d0000'];
        }
        if (palette === 'angry') {
            return ['#fff0e6', '#ff8566', '#ff1a00', '#8a0000', '#140000'];
        }
        // neutral
        return ['#ffe6cc', '#ff6f5e', '#ff2a2a', '#7a0000', '#1a0000'];
    }

    draw() {
        const ctx = this.ctx;
        const w = this.cssWidth;
        const h = this.cssHeight;

        // Background
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#0b0f1a';
        ctx.fillRect(0, 0, w, h);

        // Lens geometry
        const cx = w / 2;
        const cy = h / 2;
        const baseR = Math.min(w, h) * 0.22; // core lens radius
        const ringR = baseR * 1.45;          // outer ring radius

        // Metallic ring (radial gradient)
        const ringGrad = ctx.createRadialGradient(cx, cy, baseR * 0.9, cx, cy, ringR);
        ringGrad.addColorStop(0.0, '#222');
        ringGrad.addColorStop(0.5, '#666');
        ringGrad.addColorStop(0.9, '#aaa');
        ringGrad.addColorStop(1.0, '#333');
        ctx.fillStyle = ringGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.fill();

        // Inner bezel to create ring effect
        ctx.fillStyle = '#0b0f1a';
        ctx.beginPath();
        ctx.arc(cx, cy, baseR * 1.02, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing lens tuned by mood
        const prof = this.moodProfile();
        const t = (performance.now() - this.startTime) / 1000;
        const s = Math.sin(t * prof.speed);
        const pulse = this.animationsStarted ? (0.65 + prof.amp * s) : prof.base;
        const innerR = baseR * (0.32 + 0.18 * (0.5 + 0.5 * s));

        const [c0, c1, c2, c3, c4] = this.lensColors(prof.palette);
        const lensGrad = ctx.createRadialGradient(cx, cy, innerR * 0.5, cx, cy, baseR);
        lensGrad.addColorStop(0.0, c0);
        lensGrad.addColorStop(0.15, c1);
        lensGrad.addColorStop(0.35, c2);
        lensGrad.addColorStop(0.75, c3);
        lensGrad.addColorStop(1.0, c4);
        ctx.fillStyle = lensGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
        ctx.fill();

        // Add a visible breathing iris ring (highly noticeable)
        const ringPhase = 0.5 + 0.5 * s; // 0..1
        const irisR = baseR * (0.55 + 0.15 * ringPhase);
        ctx.save();
        ctx.lineWidth = Math.max(2, baseR * 0.06);
        ctx.strokeStyle = `rgba(255, 80, 60, ${0.25 + 0.55 * ringPhase})`;
        ctx.beginPath();
        ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Center intensity overlay for obvious pulsing
        const overlayAlpha = 0.15 + 0.35 * ringPhase;
        const overlayGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 0.8);
        overlayGrad.addColorStop(0.0, `rgba(255, 50, 50, ${overlayAlpha})`);
        overlayGrad.addColorStop(1.0, 'rgba(255, 50, 50, 0)');
        ctx.fillStyle = overlayGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
        ctx.fill();

        // Glint highlight
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.6);
        const glintR = baseR * 0.2;
        const glintGrad = ctx.createRadialGradient(-baseR * 0.25, -baseR * 0.25, 0, -baseR * 0.25, -baseR * 0.25, glintR);
        glintGrad.addColorStop(0.0, 'rgba(255,255,255,0.9)');
        glintGrad.addColorStop(1.0, 'rgba(255,255,255,0)');
        ctx.fillStyle = glintGrad;
        ctx.beginPath();
        ctx.arc(-baseR * 0.25, -baseR * 0.25, glintR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Subtle outer glow
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glowAlpha = (this.animationsStarted ? (prof.glow * (0.6 + 0.4 * (0.5 + 0.5 * s))) : prof.glow);
        ctx.fillStyle = `rgba(255,30,30,${glowAlpha})`;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR * 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    render() {
        this.draw();
        if (this.rendering) {
            requestAnimationFrame(() => this.render());
        }
    }
}
