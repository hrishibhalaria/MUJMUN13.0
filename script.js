/* ═══════════════════════════════════════════════════════════════════
 *  MUJMUN 13.0 — BREAK THE SILENCE
 *  Cinematic Engine v4
 *
 *  Soundtrack: "Can You Hear The Music" by Ludwig Göransson
 *  Audio-reactive visuals via Web Audio API AnalyserNode
 *  Smoke breathes with bass. Map pulses with energy.
 *  Visuals follow the music. No competing audio. No effects.
 * ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const CLR = {
        burgundy: [113,   9,  18],
        darkBurg: [ 26,  10,  13],
        black:    [ 13,  13,  13],
        gold:     [194, 141,  57],
        warm:     [239, 229, 210]
    };

    const CONTINENTS = [
        [[.06,.18],[.03,.25],[.04,.35],[.07,.42],[.12,.50],[.17,.53],[.20,.50],[.24,.43],[.27,.38],[.30,.32],[.28,.25],[.23,.18],[.15,.14],[.10,.15]],
        [[.17,.53],[.15,.56],[.14,.59],[.16,.61],[.18,.59],[.19,.56]],
        [[.19,.60],[.17,.65],[.16,.70],[.17,.77],[.19,.83],[.22,.90],[.24,.88],[.27,.80],[.28,.73],[.27,.66],[.24,.60]],
        [[.46,.16],[.44,.22],[.43,.28],[.45,.33],[.48,.36],[.52,.38],[.55,.35],[.54,.29],[.51,.23],[.48,.18]],
        [[.46,.40],[.44,.46],[.43,.54],[.44,.63],[.47,.70],[.50,.77],[.53,.72],[.56,.64],[.57,.55],[.56,.47],[.53,.42],[.49,.39]],
        [[.55,.16],[.60,.12],[.68,.10],[.75,.14],[.82,.20],[.87,.28],[.88,.36],[.86,.44],[.82,.50],[.77,.52],[.72,.50],[.66,.47],[.62,.43],[.58,.38],[.56,.32],[.54,.24],[.54,.20]],
        [[.67,.40],[.65,.46],[.66,.53],[.69,.58],[.72,.55],[.73,.48],[.71,.42]],
        [[.80,.66],[.78,.70],[.79,.75],[.82,.78],[.86,.76],[.88,.72],[.87,.68],[.84,.66]],
        [[.86,.28],[.87,.24],[.88,.20],[.89,.24],[.88,.28]],
        [[.44,.20],[.43,.23],[.44,.26],[.46,.24],[.45,.21]],
    ];

    /* ── DOM ── */
    const $ = id => document.getElementById(id);
    const container      = $('cinematic-container');
    const blackScreen     = $('black-screen');
    const smokeCanvas     = $('smoke-canvas');
    const missileCanvas   = $('missile-canvas');
    const worldMapCanvas  = $('world-map-canvas');
    const warmBacklight   = $('warm-backlight');
    const finalDarkOverlay = $('final-dark-overlay');
    const logoLayer       = $('logo-layer');

    const vidOrig1 = $('vid-orig1');
    const vidOrig2 = $('vid-orig2');
    const vidNew1  = $('vid-new1');
    const vidNew2  = $('vid-new2');
    const vidNew3  = $('vid-new3');
    const allVideos = [vidOrig1, vidOrig2, vidNew1, vidNew2, vidNew3];

    const textA = $('text-a');
    const textB = $('text-b');

    let wmCtx, smCtx, msCtx;
    let W, H;

    /* ── STATE ── */
    let soundtrack   = null;
    let audioCtx     = null;
    let analyser     = null;
    let freqData     = null;
    let smoke        = null;
    let missiles     = null;
    let worldMapImg  = null;
    let animFrameId  = null;
    let timeouts     = [];
    let isStarted    = false;
    let mapOpacity   = 0;
    let mapReady     = false;   // true once map has fully faded in
    let activeSlot   = null;
    let currentVideo = null;

    // Audio energy (updated each frame)
    let energy = { bass: 0, mid: 0, treble: 0, overall: 0 };

    function sched(ms, fn) {
        const id = setTimeout(fn, ms);
        timeouts.push(id);
        return id;
    }

    /* ══════════════════════════════════════════════════════════════
       SOUNDTRACK + ANALYSER
       ══════════════════════════════════════════════════════════════ */
    function initAudio() {
        soundtrack = new Audio('[ruvs.in] - Can You Hear The Music.mp3');
        soundtrack.volume = 1.0;
        soundtrack.preload = 'auto';

        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
        const source = audioCtx.createMediaElementSource(soundtrack);

        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.82;

        source.connect(analyser);
        analyser.connect(audioCtx.destination);
        freqData = new Uint8Array(analyser.frequencyBinCount);
    }

    function analyseAudio() {
        if (!analyser || !freqData) return;
        analyser.getByteFrequencyData(freqData);

        const bins = freqData.length;
        let bass = 0, mid = 0, treble = 0;

        // Bass: ~0-300 Hz
        for (let i = 0; i < 10; i++) bass += freqData[i];
        bass /= (10 * 255);

        // Mids: ~300-3000 Hz
        for (let i = 10; i < 60; i++) mid += freqData[i];
        mid /= (50 * 255);

        // Treble: ~3000+ Hz
        for (let i = 60; i < bins; i++) treble += freqData[i];
        treble /= Math.max(1, (bins - 60)) / 255;
        treble = Math.min(treble / 255, 1);

        energy.bass    = bass;
        energy.mid     = mid;
        energy.treble  = treble;
        energy.overall = bass * 0.5 + mid * 0.3 + treble * 0.2;
    }

    /* ══════════════════════════════════════════════════════════════
       VIDEO CROSS-FADE
       ══════════════════════════════════════════════════════════════ */
    function fadeToVideo(vid, dur) {
        dur = dur || 2000;
        vid.currentTime = 0;
        vid.play().catch(() => {});
        vid.style.transition = `opacity ${dur}ms ease`;
        requestAnimationFrame(() => { vid.style.opacity = '0.83'; });

        if (currentVideo && currentVideo !== vid) {
            const old = currentVideo;
            old.style.transition = `opacity ${dur}ms ease`;
            old.style.opacity = '0';
            setTimeout(() => { try { old.pause(); } catch(_){} }, dur + 200);
        }
        currentVideo = vid;
    }

    function fadeOutAllVideos(dur) {
        dur = dur || 2500;
        for (const v of allVideos) {
            v.style.transition = `opacity ${dur}ms ease`;
            v.style.opacity = '0';
            setTimeout(() => { try { v.pause(); } catch(_){} }, dur + 200);
        }
        currentVideo = null;
    }

    /* ══════════════════════════════════════════════════════════════
       TEXT — DUAL SLOT CROSS-FADE
       ══════════════════════════════════════════════════════════════ */
    function showText(main, sub, extraClass) {
        const next = (activeSlot === 'a') ? textB : textA;
        const prev = (activeSlot === 'a') ? textA : textB;
        const nextId = (activeSlot === 'a') ? 'b' : 'a';

        const mainEl = next.querySelector('.scene-main');
        const subEl  = next.querySelector('.scene-sub');
        mainEl.textContent = main;
        mainEl.className = 'scene-main' + (extraClass ? ' ' + extraClass : '');
        subEl.textContent  = sub || '';

        next.style.transition = 'none';
        next.style.opacity = '0';
        next.style.transform = 'translateY(25px)';
        void next.offsetWidth;

        next.style.transition = 'opacity 1.8s ease, transform 1.8s ease';
        next.classList.remove('dissolving');
        next.classList.add('active');
        next.style.opacity = '1';
        next.style.transform = 'translateY(0)';

        if (prev && activeSlot !== null) {
            prev.classList.remove('active');
            prev.classList.add('dissolving');
            prev.style.transition = 'opacity 1.8s ease, transform 1.8s ease';
            prev.style.opacity = '0';
            prev.style.transform = 'translateY(-15px)';
        }
        activeSlot = nextId;
    }

    function hideAllText() {
        [textA, textB].forEach(el => {
            el.classList.remove('active');
            el.classList.add('dissolving');
            el.style.transition = 'opacity 2.5s ease, transform 2.5s ease';
            el.style.opacity = '0';
            el.style.transform = 'translateY(-15px)';
        });
    }

    /* ══════════════════════════════════════════════════════════════
       SMOKE SYSTEM — alpha modulated by audio bass
       ══════════════════════════════════════════════════════════════ */
    class SmokeSystem {
        constructor(ctx, w, h) {
            this.ctx = ctx; this.w = w; this.h = h;
            this.particles = [];
            this.audioAlpha = 1.0;  // multiplied by audio bass
            this.texture = this._createTexture();
            for (let i = 0; i < 220; i++) this.particles.push(this._spawn(true));
        }
        _createTexture() {
            const s = 256, c = document.createElement('canvas');
            c.width = s; c.height = s;
            const x = c.getContext('2d'), hs = s / 2;
            const g = x.createRadialGradient(hs, hs, 0, hs, hs, hs);
            g.addColorStop(0,   'rgba(113, 9, 18, 1)');
            g.addColorStop(0.25,'rgba(90, 6, 14, 0.7)');
            g.addColorStop(0.5, 'rgba(50, 4, 10, 0.3)');
            g.addColorStop(0.75,'rgba(26, 10, 13, 0.1)');
            g.addColorStop(1,   'rgba(13, 13, 13, 0)');
            x.fillStyle = g;
            x.beginPath(); x.arc(hs, hs, hs, 0, Math.PI * 2); x.fill();
            return c;
        }
        _spawn(randomX) {
            const dir = Math.random() > 0.5 ? 1 : -1;
            return {
                x: randomX ? Math.random() * this.w : (dir > 0 ? -250 : this.w + 250),
                y: Math.random() * this.h,
                r: 90 + Math.random() * 160,
                sx: (0.25 + Math.random() * 0.65) * dir,
                sy: (Math.random() - 0.5) * 0.15,
                a: 0.025 + Math.random() * 0.055,
                wo: Math.random() * 1000,
                ws: 0.0005 + Math.random() * 0.001
            };
        }
        update(now) {
            // Speed modulated by audio energy — smoke moves faster during swells
            const speedMult = 1.0 + energy.overall * 0.5;
            for (const p of this.particles) {
                p.x += p.sx * speedMult;
                p.y += p.sy + Math.sin(now * p.ws + p.wo) * 0.4;
                if (p.x > this.w + 350 || p.x < -350) Object.assign(p, this._spawn(false));
            }
        }
        render() {
            this.ctx.clearRect(0, 0, this.w, this.h);
            const am = this.audioAlpha;
            for (const p of this.particles) {
                const d = p.r * 2;
                this.ctx.globalAlpha = p.a * am;
                this.ctx.drawImage(this.texture, p.x - p.r, p.y - p.r, d, d);
            }
            this.ctx.globalAlpha = 1;
        }
        resize(w, h) { this.w = w; this.h = h; }
    }

    /* ══════════════════════════════════════════════════════════════
       MISSILE SYSTEM
       ══════════════════════════════════════════════════════════════ */
    class MissileSystem {
        constructor(ctx, w, h) {
            this.ctx = ctx; this.w = w; this.h = h;
            this.missiles = [];
            this.headTex = this._createHead();
        }
        _createHead() {
            const s = 40, c = document.createElement('canvas');
            c.width = s; c.height = s;
            const x = c.getContext('2d'), hs = s / 2;
            const g = x.createRadialGradient(hs, hs, 0, hs, hs, hs);
            g.addColorStop(0,   'rgba(239, 229, 210, 0.85)');
            g.addColorStop(0.25,'rgba(194, 141, 57, 0.5)');
            g.addColorStop(0.6, 'rgba(113, 9, 18, 0.15)');
            g.addColorStop(1,   'rgba(13, 13, 13, 0)');
            x.fillStyle = g;
            x.beginPath(); x.arc(hs, hs, hs, 0, Math.PI * 2); x.fill();
            return c;
        }
        spawn(fromLeft) {
            const y = 80 + Math.random() * (this.h - 160);
            this.missiles.push({
                x: fromLeft ? -30 : this.w + 30,
                y, vx: fromLeft ? (2.5 + Math.random() * 2) : -(2.5 + Math.random() * 2),
                vy: (Math.random() - 0.5) * 0.6,
                trail: [], active: true
            });
        }
        update() {
            for (const m of this.missiles) {
                if (!m.active) continue;
                m.x += m.vx;
                m.y += m.vy + Math.sin(m.x * 0.008) * 0.4;
                m.trail.push({ x: m.x, y: m.y, a: 1 });
                if (m.trail.length > 90) m.trail.shift();
                for (const t of m.trail) t.a *= 0.975;
                if (m.x > this.w + 60 || m.x < -60) m.active = false;
            }
            this.missiles = this.missiles.filter(m => m.active || m.trail.some(t => t.a > 0.01));
        }
        render() {
            this.ctx.clearRect(0, 0, this.w, this.h);
            // Trail brightness modulated by audio mids
            const midBoost = 0.8 + energy.mid * 0.5;
            for (const m of this.missiles) {
                for (let i = 0; i < m.trail.length; i += 3) {
                    const t = m.trail[i];
                    const sz = 6 + (1 - i / m.trail.length) * 14;
                    this.ctx.globalAlpha = t.a * 0.12 * midBoost;
                    this.ctx.fillStyle = `rgb(${CLR.burgundy})`;
                    this.ctx.beginPath();
                    this.ctx.arc(t.x, t.y, sz, 0, Math.PI * 2);
                    this.ctx.fill();
                }
                if (m.trail.length > 1) {
                    for (let i = 1; i < m.trail.length; i++) {
                        const t = m.trail[i], p = m.trail[i - 1];
                        this.ctx.globalAlpha = t.a * 0.45 * midBoost;
                        this.ctx.strokeStyle = `rgb(${CLR.gold})`;
                        this.ctx.lineWidth = 1.5 + (i / m.trail.length) * 1.5;
                        this.ctx.beginPath();
                        this.ctx.moveTo(p.x, p.y);
                        this.ctx.lineTo(t.x, t.y);
                        this.ctx.stroke();
                    }
                }
                if (m.active) {
                    const last = m.trail[m.trail.length - 1] || m;
                    this.ctx.globalAlpha = 1;
                    this.ctx.drawImage(this.headTex, last.x - 20, last.y - 20, 40, 40);
                }
            }
            this.ctx.globalAlpha = 1;
        }
        resize(w, h) { this.w = w; this.h = h; }
    }

    /* ── WORLD MAP ── */
    function createWorldMap(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const x = c.getContext('2d');
        x.fillStyle   = `rgba(${CLR.burgundy}, 0.22)`;
        x.strokeStyle = `rgba(${CLR.burgundy}, 0.35)`;
        x.lineWidth   = 1.2; x.lineJoin = 'round';
        for (const cont of CONTINENTS) {
            x.beginPath();
            x.moveTo(cont[0][0] * w, cont[0][1] * h);
            for (let i = 1; i < cont.length; i++) {
                const cx = (cont[i-1][0]+cont[i][0])/2*w;
                const cy = (cont[i-1][1]+cont[i][1])/2*h;
                x.quadraticCurveTo(cont[i-1][0]*w, cont[i-1][1]*h, cx, cy);
            }
            x.closePath(); x.fill(); x.stroke();
        }
        x.strokeStyle = `rgba(${CLR.burgundy}, 0.06)`;
        x.lineWidth = 0.5;
        for (let i = 0; i <= 24; i++) { const px=(i/24)*w; x.beginPath(); x.moveTo(px,0); x.lineTo(px,h); x.stroke(); }
        for (let i = 0; i <= 16; i++) { const py=(i/16)*h; x.beginPath(); x.moveTo(0,py); x.lineTo(w,py); x.stroke(); }
        return c;
    }

    /* ── CONTINUOUS MISSILES ── */
    function startContinuousMissiles() {
        (function loop() {
            if (!missiles) return;
            missiles.spawn(Math.random() > 0.5);
            setTimeout(loop, 2000 + Math.random() * 3000);
        })();
    }

    /* ══════════════════════════════════════════════════════════════
       TIMELINE — synced to "Can You Hear The Music"
       Visuals follow the music's natural emotional arc.
       ══════════════════════════════════════════════════════════════ */
    function scheduleTimeline() {

        /* ── 0s : Music begins.
           Opening piano notes + atmospheric textures.
           Black screen. Smoke slowly emerges.
           World map becomes faintly visible.
           Curiosity. ── */

        soundtrack.play().catch(() => {});

        smokeCanvas.style.transition  = 'opacity 4s ease';
        smokeCanvas.style.opacity     = '0.20';
        mapOpacity = 0;

        /* ── 2s : Piano develops, orchestration growing.
           Black screen fades. Modi footage at 83%.
           Smoke moves. First distant missiles.
           Global significance. ── */

        sched(2000, () => {
            blackScreen.style.transition = 'opacity 3s ease';
            blackScreen.style.opacity = '0';
            sched(3200, () => { blackScreen.style.pointerEvents = 'none'; });

            missileCanvas.style.transition = 'opacity 2.5s ease';
            missileCanvas.style.opacity   = '0.25';

            fadeToVideo(vidOrig1, 3000);
        });

        sched(3000, () => missiles.spawn(true));
        sched(5000, () => missiles.spawn(false));

        /* ── 6.5s : Music gains momentum.
           Trump footage. Orchestral layers richer.
           Missile activity increases slightly.
           Increasing tension. ── */

        sched(6500, () => {
            fadeToVideo(vidOrig2, 2500);
            smokeCanvas.style.transition = 'opacity 3s ease';
            smokeCanvas.style.opacity = '0.30';
        });

        sched(7500, () => missiles.spawn(true));
        sched(9000, () => missiles.spawn(false));
        sched(10000, () => missiles.spawn(true));

        /* ── 11s : First major crescendo.
           WHEN THE WORLD CHOOSES CONFLICT
           Appears precisely as the orchestra swells.
           No impact sounds. Music creates the power.
           Switch to new video 1. ── */

        sched(11000, () => {
            fadeToVideo(vidNew1, 2000);
            showText('When the World Chooses Conflict');
            missileCanvas.style.transition = 'opacity 2s ease';
            missileCanvas.style.opacity = '0.32';
        });

        sched(12000, () => missiles.spawn(false));
        sched(13500, () => missiles.spawn(true));
        sched(14500, () => missiles.spawn(false));

        /* ── 15.5s : Second emotional swell.
           SOMEONE MUST CHOOSE DIPLOMACY
           Hopeful, not aggressive. Warm light emerges.
           Missile activity decreases slightly.
           Switch to new video 2. ── */

        sched(15500, () => {
            fadeToVideo(vidNew2, 2000);
            warmBacklight.style.transition = 'opacity 3s ease';
            warmBacklight.style.opacity = '1';
            showText('Someone Must Choose Diplomacy');
        });

        sched(17000, () => missiles.spawn(true));

        /* ── 20s : Major orchestral peak.
           GREATEST CONFERENCE IN RAJASTHAN
           Strings and brass at their largest.
           Smoke parts. Map clearer. Heritage prominent.
           Switch to new video 3. ── */

        sched(20000, () => {
            fadeToVideo(vidNew3, 2000);
            warmBacklight.style.transition = 'opacity 3s ease';
            warmBacklight.style.opacity = '0';
            smokeCanvas.style.transition = 'opacity 3s ease';
            smokeCanvas.style.opacity = '0.22';
            showText('Greatest Conference in Rajasthan', null, 'royal');
        });

        sched(21000, () => missiles.spawn(true));
        sched(22500, () => missiles.spawn(false));
        sched(24000, () => missiles.spawn(true));

        /* ── 25.5s : LARGEST musical moment.
           MUJMUN 13.0 / COMING SOON
           The biggest emotional swell.
           Everything was leading to this.
           Video 3 continues. Camera push. ── */

        sched(25500, () => {
            showText('MUJMUN 13.0', 'Coming Soon', 'big');
            smokeCanvas.style.transition = 'opacity 4s ease';
            smokeCanvas.style.opacity = '0.35';

            container.style.transition = 'transform 5s ease-out';
            container.style.transform = 'scale(1.04)';
        });

        sched(26500, () => missiles.spawn(false));
        sched(28000, () => missiles.spawn(true));
        sched(29500, () => missiles.spawn(false));

        /* ── 30.5s : Deceleration.
           Music begins settling.
           Videos dissolve. Text dissolves.
           Atmosphere remains.
           Reflection. ── */

        sched(30500, () => {
            hideAllText();
            fadeOutAllVideos(2500);
            smokeCanvas.style.transition = 'opacity 3s ease';
            smokeCanvas.style.opacity = '0.18';
        });

        /* ── 32s : Final reveal.
           #breakthesilence + MUJMUN Logo + institutional logos.
           Music continues naturally — never stops.
           The soundtrack is the emotional payoff.
           Missiles continue forever. ── */

        sched(32000, () => {
            finalDarkOverlay.style.transition = 'opacity 4s ease';
            finalDarkOverlay.style.opacity = '1';
            
            logoLayer.style.opacity = '1';
            startContinuousMissiles();

            container.style.transition = 'transform 6s ease-out';
            container.style.transform = 'scale(1.0)';
        });
    }

    /* ══════════════════════════════════════════════════════════════
       RENDER LOOP — audio-reactive visual modulation
       ══════════════════════════════════════════════════════════════ */
    function renderLoop(now) {

        /* ── Analyse audio frequencies ── */
        analyseAudio();

        /* ── Smoke breathes with bass ── */
        smoke.audioAlpha = 0.7 + energy.bass * 0.7;
        smoke.update(now);
        smoke.render();

        /* ── Missiles — trail brightness follows mids ── */
        missiles.update();
        missiles.render();

        /* ── World map — initial fade-in, then modulated by overall energy ── */
        if (!mapReady) {
            // Slow initial fade-in
            mapOpacity += 0.00025;
            if (mapOpacity >= 0.18) {
                mapOpacity = 0.18;
                mapReady = true;
            }
            wmCtx.clearRect(0, 0, W, H);
            wmCtx.globalAlpha = mapOpacity;
            wmCtx.drawImage(worldMapImg, 0, 0);
            wmCtx.globalAlpha = 1;
            worldMapCanvas.style.opacity = '1';
        } else {
            // Audio-reactive: map subtly brightens during musical swells
            const dynamicAlpha = 0.18 + energy.overall * 0.10;
            wmCtx.clearRect(0, 0, W, H);
            wmCtx.globalAlpha = dynamicAlpha;
            wmCtx.drawImage(worldMapImg, 0, 0);
            wmCtx.globalAlpha = 1;
        }

        /* ── Warm backlight pulses gently with treble ── */
        if (warmBacklight.style.opacity !== '0') {
            const baseGlow = 0.04 + energy.treble * 0.06;
            warmBacklight.style.background = `radial-gradient(ellipse, rgba(194,141,57,${baseGlow}) 0%, rgba(194,141,57,${baseGlow * 0.4}) 35%, transparent 70%)`;
        }

        animFrameId = requestAnimationFrame(renderLoop);
    }

    /* ── RESIZE ── */
    function onResize() {
        W = window.innerWidth;
        H = window.innerHeight;
        [worldMapCanvas, smokeCanvas, missileCanvas].forEach(c => {
            c.width = W; c.height = H;
        });
        wmCtx = worldMapCanvas.getContext('2d');
        smCtx = smokeCanvas.getContext('2d');
        msCtx = missileCanvas.getContext('2d');
        worldMapImg = createWorldMap(W, H);
        if (smoke) smoke.resize(W, H);
        if (missiles) missiles.resize(W, H);
    }

    /* ── INIT ── */
    function init() {
        W = window.innerWidth;
        H = window.innerHeight;
        [worldMapCanvas, smokeCanvas, missileCanvas].forEach(c => {
            c.width = W; c.height = H;
        });
        wmCtx = worldMapCanvas.getContext('2d');
        smCtx = smokeCanvas.getContext('2d');
        msCtx = missileCanvas.getContext('2d');
        worldMapImg = createWorldMap(W, H);

        const begin = (e) => {
            if (isStarted) return;
            isStarted = true;
            e.preventDefault();
            document.removeEventListener('click', begin);
            document.removeEventListener('touchstart', begin);
            startExperience();
        };
        document.addEventListener('click', begin);
        document.addEventListener('touchstart', begin, { passive: false });
        window.addEventListener('resize', onResize);
    }

    function startExperience() {
        initAudio();
        smoke    = new SmokeSystem(smCtx, W, H);
        missiles = new MissileSystem(msCtx, W, H);
        animFrameId = requestAnimationFrame(renderLoop);
        scheduleTimeline();
    }

    init();

})();
