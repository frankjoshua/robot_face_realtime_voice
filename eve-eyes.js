// EveEyes - Wall-E Eve-inspired twin blue eyes in a black visor
class EveEyes {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.dpr = Math.max(1, window.devicePixelRatio || 1);
        this.cssWidth = window.innerWidth;
        this.cssHeight = window.innerHeight;
        this.rendering = false;
        this.animationsStarted = false;
        this.mood = 'neutral';
        this.startTime = performance.now();
        this.init();
    }

    init() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
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
        this.render();
    }

    stopRendering() {
        this.rendering = false;
    }

    startAnimations() {
        this.animationsStarted = true;
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
        switch (this.mood) {
            case 'happy':
                return { eyeH: 1.1, tilt: 0.06, glow: 1.15, scanSpeed: 1.6, top: 1.05, bottom: 1.05, point: 0.85 };
            case 'sad':
                return { eyeH: 0.85, tilt: 0.22, glow: 0.95, scanSpeed: 1.0, top: 0.9, bottom: 0.8, point: 0.9 };
            case 'angry':
                return { eyeH: 0.6, tilt: -0.25, glow: 1.25, scanSpeed: 2.0, top: 0.45, bottom: 0.9, point: 1.15 };
            default:
                return { eyeH: 0.95, tilt: 0.0, glow: 1.0, scanSpeed: 1.2, top: 1.0, bottom: 1.0, point: 1.0 };
        }
    }

    makeEyePath(ctx, rx, ry, topK, botK, point) {
        // Almond-like shape using two cubic Bézier curves.
        const kx = rx * Math.max(0.45, 0.65 * point);
        const top = -ry * topK;
        const bot = ry * botK;
        ctx.beginPath();
        ctx.moveTo(-rx, 0);
        ctx.bezierCurveTo(-kx, top, kx, top, rx, 0);   // top lid
        ctx.bezierCurveTo(kx, bot, -kx, bot, -rx, 0);   // bottom lid
    }

    drawEye(cx, cy, rx, ry, tilt, t, shape) {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tilt);

        // Clip to almond eye path for more expression
        this.makeEyePath(ctx, rx, ry, shape.top, shape.bottom, shape.point);
        ctx.clip();

        // Base blue radial glow
        const grad = ctx.createRadialGradient(0, 0, ry * 0.25, 0, 0, rx);
        grad.addColorStop(0.0, 'rgba(120, 210, 255, 0.95)');
        grad.addColorStop(0.4, 'rgba(70, 170, 255, 0.8)');
        grad.addColorStop(1.0, 'rgba(20, 50, 110, 0.4)');
        ctx.fillStyle = grad;
        ctx.fillRect(-rx, -ry, rx * 2, ry * 2);

        // Animated scanlines across the entire eye area (no central jitter)
        const spacing = 5; // px
        const speed = 30 * shape.scanSpeed; // px/sec
        const scroll = ((t - this.startTime) / 1000) * speed;
        ctx.globalCompositeOperation = 'screen';
        for (let y = -ry; y <= ry; y += spacing) {
            let yy = y + (scroll % spacing);
            yy = Math.round(yy) + 0.5; // pixel align for crispness
            const alpha = 0.15 + 0.1 * Math.cos((y + scroll) * 0.12);
            ctx.fillStyle = `rgba(120, 200, 255, ${alpha})`;
            ctx.fillRect(-rx, yy, rx * 2, 1);
        }
        ctx.globalCompositeOperation = 'source-over';

        // Soft highlight at top-left
        const glint = ctx.createRadialGradient(-rx * 0.25, -ry * 0.25, 0, -rx * 0.25, -ry * 0.25, ry * 0.35);
        glint.addColorStop(0, 'rgba(255,255,255,0.28)');
        glint.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glint;
        ctx.beginPath();
        ctx.arc(-rx * 0.25, -ry * 0.25, ry * 0.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    render() {
        const ctx = this.ctx;
        const w = this.cssWidth;
        const h = this.cssHeight;
        const tNow = performance.now();

        // Background: flat dark color (no oval/visor)
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#0a0d12';
        ctx.fillRect(0, 0, w, h);
        // Soft vignette around edges for depth
        const vcx = w / 2;
        const vcy = h / 2;
        const vignette = ctx.createRadialGradient(vcx, vcy, Math.min(w, h) * 0.2, vcx, vcy, Math.max(w, h) * 0.7);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);

        // Layout metrics (keep proportions similar to old visor but larger eyes)
        const visorW = w * 0.72; // virtual stage width for eye sizing
        const visorH = Math.min(h * 0.5, visorW * 0.75);

        // Eye parameters
        const prof = this.moodProfile();
        const eyeRX = visorW * 0.22;            // larger eyes
        const baseEyeRY = visorH * 0.26;        // larger eyes
        const eyeRY = baseEyeRY * prof.eyeH;
        const eyeTilt = prof.tilt;
        const eyeY = vcy; // centered vertically
        const eyeDX = visorW * 0.24;           // wider spacing

        // Idle bob for a living feel
        const t = (tNow - this.startTime) / 1000;
        const bob = (this.animationsStarted ? Math.sin(t * 1.2) : 0) * visorH * 0.01;

        // Draw left and right eyes (almond shapes)
        const shape = { top: prof.top, bottom: prof.bottom, point: prof.point, scanSpeed: prof.scanSpeed };
        this.drawEye(vcx - eyeDX, eyeY + bob, eyeRX, eyeRY, eyeTilt, tNow, shape);
        this.drawEye(vcx + eyeDX, eyeY + bob, eyeRX, eyeRY, -eyeTilt, tNow, shape);

        if (this.rendering) requestAnimationFrame(() => this.render());
    }
}
