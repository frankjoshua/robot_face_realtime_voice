// Baxter Eyes Implementation
// Baxter Eyes Implementation
class BaxterEyes {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.mood = 'neutral';
        this.pupil = { x: 0, y: 0 };
        this.blink = false;
        this.blinkProgress = 0;
        this.lastBlink = Date.now();
        this.dpr = Math.max(1, window.devicePixelRatio || 1);
        this.cssWidth = window.innerWidth;
        this.cssHeight = window.innerHeight;
        this.animationsStarted = false;
        this.enableAutoMood = !!options.enableAutoMood; // default off; MCP can control mood
        this.rendering = false;
        this._blinkTimer = null;
        this._pupilTimer = null;
        this._moodTimer = null;
        
        this.init();
    }
    
    init() {
        // Set canvas size to match viewport
        this.resizeCanvas();
        
        // Listen for window resize
        window.addEventListener('resize', () => this.resizeCanvas());
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
        if (this.animationsStarted) return;
        this.animationsStarted = true;
        // Start animation loops (blink + pupil movement always; mood cycle optional)
        this.startBlinkLoop();
        this.startPupilMovement();
        if (this.enableAutoMood) {
            this.startMoodChanges();
        }
        if (!this.rendering) this.startRendering();
    }
    
    resizeCanvas() {
        const vw = (window.visualViewport && window.visualViewport.width) || window.innerWidth;
        const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
        this.cssWidth = vw;
        this.cssHeight = vh;

        // Handle high-DPI rendering for crispness while keeping CSS px coords
        this.dpr = Math.max(1, window.devicePixelRatio || 1);
        this.canvas.width = Math.round(vw * this.dpr);
        this.canvas.height = Math.round(vh * this.dpr);
        // Scale the drawing context so our math is in CSS pixels
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    
    drawEye(cx, cy, scale) {
        const rx = 50 * scale, ry = 40 * scale;
        
        // Draw white of eye
        this.ctx.fillStyle = "white";
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw pupil
        const amp = 15 * scale;
        const px = cx + this.pupil.x * amp;
        const py = cy + this.pupil.y * amp;
        this.ctx.fillStyle = "black";
        this.ctx.beginPath();
        this.ctx.arc(px, py, 20 * scale, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw eyelid for blink
        if (this.blinkProgress > 0) {
            this.ctx.fillStyle = "#1e293b";
            const lid = ry * 2 * this.blinkProgress;
            this.ctx.fillRect(cx - rx, cy - ry, rx * 2, lid);
        }
    }
    
    drawBrow(x, y, w, h, rot) {
        this.ctx.save();
        this.ctx.translate(x + w / 2, y + h / 2);
        this.ctx.rotate(rot);
        this.ctx.fillRect(-w / 2, -h / 2, w, h);
        this.ctx.restore();
    }
    
    drawBrows(leftEyeX, rightEyeX, eyeY, scale) {
        this.ctx.fillStyle = "white";
        const browWidth = 80 * scale;
        const browHeight = 10 * scale;
        const browOffset = 40 * scale;
        
        if (this.mood === "happy") {
            this.drawBrow(leftEyeX - browWidth/2, eyeY - browOffset, browWidth, browHeight, -0.2);
            this.drawBrow(rightEyeX - browWidth/2, eyeY - browOffset, browWidth, browHeight, 0.2);
        } else if (this.mood === "angry") {
            this.drawBrow(leftEyeX - browWidth/2, eyeY - browOffset, browWidth, browHeight, 0.3);
            this.drawBrow(rightEyeX - browWidth/2, eyeY - browOffset, browWidth, browHeight, -0.3);
        } else if (this.mood === "sad") {
            // Invert the happy angles for a sad/worried look
            this.drawBrow(leftEyeX - browWidth/2, eyeY - browOffset, browWidth, browHeight, 0.2);
            this.drawBrow(rightEyeX - browWidth/2, eyeY - browOffset, browWidth, browHeight, -0.2);
        } else {
            this.drawBrow(leftEyeX - browWidth/2, eyeY - browOffset, browWidth, browHeight, 0);
            this.drawBrow(rightEyeX - browWidth/2, eyeY - browOffset, browWidth, browHeight, 0);
        }
    }
    
    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw solid background (original color)
        this.ctx.fillStyle = "#1e293b";
        // Use CSS pixel dimensions for fills due to DPR transform
        this.ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
        
        // Responsive sizing: target a strong, central presence
        // Estimated total dimensions (at scale=1): width ~240, height ~90
        const unitWidth = 240;
        const unitHeight = 90;

        // Choose coverage that looks good across devices (work in CSS px)
        const targetWidth = this.cssWidth * 0.72;  // ~72% of viewport width
        const targetHeight = this.cssHeight * 0.5; // ~50% of viewport height

        // Prefer a "cover" feel but keep everything visible
        const scaleFromWidth = targetWidth / unitWidth;
        const scaleFromHeight = targetHeight / unitHeight;
        const scale = Math.min(scaleFromWidth, scaleFromHeight);
        
        // Calculate eye positions (centered horizontally, vertically centered)
        const eyeSpacing = 140 * scale;
        const centerX = this.cssWidth / 2;
        const eyeY = this.cssHeight * 0.5; // Centered vertically for focus
        
        const leftEyeX = centerX - eyeSpacing / 2;
        const rightEyeX = centerX + eyeSpacing / 2;
        
        // Draw eyes and brows
        this.drawEye(leftEyeX, eyeY, scale);
        this.drawEye(rightEyeX, eyeY, scale);
        this.drawBrows(leftEyeX, rightEyeX, eyeY, scale);
        
        // Continue animation loop if enabled
        if (this.rendering) {
            requestAnimationFrame(() => this.render());
        }
    }
    
    startBlinkLoop() {
        if (this._blinkTimer) return;
        this._blinkTimer = setInterval(() => {
            if (Date.now() - this.lastBlink > 3000) {
                this.blink = true;
                this.lastBlink = Date.now();
                this.performBlink();
            }
        }, 100);
    }
    
    performBlink() {
        let progress = 0;
        const blinkAnim = setInterval(() => {
            progress += 0.2;
            if (progress >= 1) {
                this.blink = false;
                clearInterval(blinkAnim);
                this.blinkProgress = 1;
                setTimeout(() => {
                    this.blinkProgress = 0;
                }, 200);
            } else {
                this.blinkProgress = progress;
            }
        }, 50);
    }
    
    startPupilMovement() {
        if (this._pupilTimer) return;
        this._pupilTimer = setInterval(() => {
            this.pupil = {
                x: (Math.random() * 2 - 1) * 0.7,
                y: (Math.random() * 2 - 1) * 0.4,
            };
        }, 800);
    }
    
    startMoodChanges() {
        if (this._moodTimer) return;
        this._moodTimer = setInterval(() => {
            // Cycle through a simple set when auto-mood is enabled
            if (this.mood === "neutral") this.mood = "happy";
            else if (this.mood === "happy") this.mood = "angry";
            else if (this.mood === "angry") this.mood = "sad";
            else this.mood = "neutral";
        }, 5000);
    }

    setMood(mood) {
        const allowed = new Set(["neutral", "happy", "sad", "angry"]);
        if (!allowed.has(mood)) return;
        this.mood = mood;
    }

    stopAnimations() {
        if (this._blinkTimer) { clearInterval(this._blinkTimer); this._blinkTimer = null; }
        if (this._pupilTimer) { clearInterval(this._pupilTimer); this._pupilTimer = null; }
        if (this._moodTimer) { clearInterval(this._moodTimer); this._moodTimer = null; }
        this.animationsStarted = false;
    }
}
