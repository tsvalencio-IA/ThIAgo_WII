// =====================================================
// KART DO OTTO – COMMERCIAL EDITION (FIXED)
// STATUS: PHYSICS (PRO) + RENDER (ORIGINAL PRESERVED)
// ENGINEER: CODE 177
// =====================================================

(function() {

// =================================================================
// 1. SISTEMAS GLOBAIS & CONFIGURAÇÃO
// =================================================================
let minimapPoints = [];
let particles = [];
let nitroBtn = null;
let keys = {}; // Estado do teclado para input híbrido

// Listener de Teclado (Fallback e Suporte)
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

// Configuração de Engenharia (Ajuste Fino para "Otto")
const CONF = {
    // Física
    MAX_SPEED: 245,          // Levemente aumentado para sensação comercial
    TURBO_MAX_SPEED: 450,    // Velocidade de impacto no turbo
    ACCEL: 1.2,              // Aceleração progressiva
    FRICTION: 0.98,          // Atrito do asfalto
    OFFROAD_DECEL: 0.94,     // Penalidade na grama
    BRAKING: 0.96,           // Frenagem

    // Curvas & Drift (CORREÇÃO DO TOMBAMENTO)
    CENTRIFUGAL_FORCE: 0.28, // Força lateral realista
    STEER_AUTHORITY: 0.16,   // Controle preciso
    DRIFT_GRIP: 0.97,        // Mantém velocidade no drift
    
    // Gameplay
    HITBOX_WIDTH: 0.4,
    CRASH_PENALTY: 0.6,      // Perdoa um pouco mais, mas pune
    TOTAL_LAPS: 3,
    
    // Visual
    DRAW_DISTANCE: 70,       // Mantém performance e visual
    FOV: 100
};

// =================================================================
// 2. LOGIC STATE (DADOS DO JOGO)
// =================================================================
const Logic = {
    // Estado Físico
    speed: 0, 
    pos: 0,            
    playerX: 0,        
    steer: 0,          
    targetSteer: 0,      
    
    // Mecânicas
    nitro: 100,
    turboLock: false,
    driftState: 0, // 0=Normal, 1=Drift
    driftDir: 0, 
    driftCharge: 0, 
    mtStage: 0,    // Mini-Turbo (0, 1=Azul, 2=Laranja)
    boostTimer: 0,     
    
    // Corrida
    state: 'race', 
    finishTimer: 0,
    lap: 1, totalLaps: CONF.TOTAL_LAPS,
    time: 0, rank: 1, score: 0,
    
    // Visuais
    visualTilt: 0,     
    bounce: 0,
    skyColor: 0, 
    shake: 0,
    stats: { drifts: 0, overtakes: 0, crashes: 0 },
    
    // Input
    inputState: 0, 
    gestureTimer: 0,
    virtualWheel: { x:0, y:0, r:0, opacity:0 },
    
    rivals: [],

    // -------------------------------------------------------------
    // CONSTRUÇÃO DE PISTA (ORIGINAL)
    // -------------------------------------------------------------
    buildTrack: function() {
        // Reinicializa arrays
        segments = [];
        minimapPoints = [];

        const addRoad = (enter, curve, y) => {
            const startIdx = segments.length;
            for(let i = 0; i < enter; i++) {
                const isDark = Math.floor(segments.length / 3) % 2; // RUMBLE_LENGTH 3 hardcoded
                segments.push({
                    curve: curve,
                    y: y,
                    color: isDark ? 'dark' : 'light',
                    obs: []
                });
            }
            return startIdx;
        };

        const addProp = (index, type, offset) => {
            if (segments[index]) segments[index].obs.push({ type: type, x: offset });
        };

        // TRAÇADO "OTTO CIRCUIT" (Original)
        addRoad(50, 0, 0); 
        let sHook = addRoad(20, 0.5, 0); addProp(sHook, 'sign', -1.5);
        addRoad(20, 1.5, 0);              
        let sApex1 = addRoad(30, 3.5, 0); addProp(sApex1 + 5, 'cone', 0.9);
        addRoad(20, 1.0, 0);              
        addRoad(40, 0, 0);
        let sChicane = addRoad(20, 0, 0); addProp(sChicane, 'sign', 1.5); 
        addRoad(15, -2.5, 0); addProp(segments.length - 5, 'cone', -0.9);
        addRoad(10, 0, 0);       
        addRoad(15, 2.5, 0); addProp(segments.length - 5, 'cone', 0.9);
        addRoad(20, 0, 0);    
        let sLoop = addRoad(30, 0, 0); addProp(sLoop, 'sign', 1.5); addProp(sLoop + 5, 'sign', 1.5);
        addRoad(20, -1.0, 0); 
        addRoad(60, -3.5, 0); 
        addRoad(20, -1.0, 0); 
        let sHazards = addRoad(70, 0, 0);
        addProp(sHazards + 15, 'cone', 0); addProp(sHazards + 35, 'cone', -0.6); addProp(sHazards + 55, 'cone', 0.6);
        addRoad(40, 1.2, 0);

        // Define comprimento total
        trackLength = segments.length * 200; // SEGMENT_LENGTH 200 hardcoded

        // Gera pontos do Mini Mapa (Vetorial)
        let x = 0, y = 0, dir = -Math.PI / 2;
        segments.forEach(seg => {
            dir += seg.curve * 0.002;
            x += Math.cos(dir) * 4;
            y += Math.sin(dir) * 4;
            minimapPoints.push({ x, y, dir }); // Salva direção para rotação
        });
    },

    // -------------------------------------------------------------
    // UI SETUP (BOTÃO NITRO)
    // -------------------------------------------------------------
    setupUI: function() {
        const oldBtn = document.getElementById('nitro-btn-kart');
        if(oldBtn) oldBtn.remove();

        nitroBtn = document.createElement('div');
        nitroBtn.id = 'nitro-btn-kart';
        nitroBtn.innerHTML = "NITRO";
        Object.assign(nitroBtn.style, {
            position: 'absolute', top: '35%', right: '20px', width: '85px', height: '85px',
            borderRadius: '50%', background: 'radial-gradient(#ffaa00, #cc5500)', border: '4px solid #fff',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "sans-serif", fontWeight: "bold", fontSize: '16px', zIndex: '100',
            boxShadow: '0 0 20px rgba(255, 100, 0, 0.5)', cursor: 'pointer', 
            userSelect: 'none', touchAction: 'manipulation', transform: 'scale(1)', transition: 'transform 0.1s'
        });

        const toggleTurbo = (e) => {
            if(e) { e.preventDefault(); e.stopPropagation(); }
            if(this.nitro > 5) {
                this.turboLock = !this.turboLock;
                nitroBtn.style.transform = this.turboLock ? 'scale(0.95)' : 'scale(1)';
                nitroBtn.style.filter = this.turboLock ? 'brightness(1.5)' : 'brightness(1)';
                if(this.turboLock) {
                    window.Sfx.play(600, 'square', 0.1, 0.1);
                    this.shake = 5;
                }
            }
        };
        nitroBtn.addEventListener('touchstart', toggleTurbo, {passive:false});
        nitroBtn.addEventListener('mousedown', toggleTurbo);
        
        const container = document.getElementById('game-ui') || document.body;
        container.appendChild(nitroBtn);
    },

    // -------------------------------------------------------------
    // INIT
    // -------------------------------------------------------------
    init: function() { 
        this.buildTrack();
        this.setupUI();
        
        this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0;
        this.state = 'race'; this.lap = 1; this.score = 0;
        this.driftState = 0; this.nitro = 100;
        
        // Rivais com IA Aprimorada (Personalidade)
        this.rivals = [
            { pos: 1000, x: -0.4, speed: 0, color: '#2ecc71', name: 'Luigi', aggro: 0.035, mistakeProb: 0.01 },
            { pos: 800,  x: 0.4,  speed: 0, color: '#3498db', name: 'Toad',  aggro: 0.028, mistakeProb: 0.005 },
            { pos: 1200, x: 0,    speed: 0, color: '#e74c3c', name: 'Bowser', aggro: 0.045, mistakeProb: 0.02 }
        ];

        window.System.msg("LARGADA!"); 
    },

    // =============================================================
    // GAME LOOP
    // =============================================================
    update: function(ctx, w, h, pose) {
        // 1. Física e Lógica
        this.updatePhysics(w, h, pose);
        
        // 2. Renderização (Visual Preservado)
        this.renderWorld(ctx, w, h);
        
        // 3. UI (HUD Melhorado)
        this.renderUI(ctx, w, h);

        return Math.floor(this.score);
    },

    // -------------------------------------------------------------
    // PHYSICS ENGINE (CORRIGIDA)
    // -------------------------------------------------------------
    updatePhysics: function(w, h, pose) {
        const d = this;
        
        // --- A. INPUT (HÍBRIDO: POSE + TECLADO) ---
        let detected = false;
        let poseSteer = 0;
        let pLeft, pRight;

        // Detecção de Pose
        if (d.state === 'race' && pose && pose.keypoints) {
            const lw = pose.keypoints.find(k => k.name === 'left_wrist');
            const rw = pose.keypoints.find(k => k.name === 'right_wrist');
            
            if (lw && lw.score > 0.3 && rw && rw.score > 0.3) {
                detected = true;
                pLeft = window.Gfx.map(lw, w, h);
                pRight = window.Gfx.map(rw, w, h);
                
                const dx = pRight.x - pLeft.x;
                const dy = pRight.y - pLeft.y;
                const rawAngle = Math.atan2(dy, dx);
                
                if (Math.abs(rawAngle) > CONF.DEADZONE) poseSteer = rawAngle * 2.5;

                // Visual Wheel
                d.virtualWheel.x = (pLeft.x + pRight.x) / 2;
                d.virtualWheel.y = (pLeft.y + pRight.y) / 2;
                d.virtualWheel.r = Math.hypot(dx, dy) / 2;
                d.virtualWheel.opacity = 1;
                d.inputState = 2;

                // Gesto Turbo
                if (d.virtualWheel.y < h * 0.35) {
                    d.gestureTimer++;
                    if (d.gestureTimer > 15 && d.nitro > 10 && !d.turboLock) d.turboLock = true;
                } else d.gestureTimer = 0;
            }
        }

        // Fallback Teclado
        if (!detected) {
            d.inputState = 1;
            d.virtualWheel.opacity *= 0.9;
            if (keys['ArrowLeft'] || keys['KeyA']) poseSteer = -1.2;
            if (keys['ArrowRight'] || keys['KeyD']) poseSteer = 1.2;
            // Turbo Teclado
            if (keys['Space']) d.turboLock = true;
            else if(!nitroBtn.matches(':active')) d.turboLock = false;
        }

        // Suavização
        d.targetSteer = poseSteer;
        d.steer += (d.targetSteer - d.steer) * 0.15; // Smooth

        // --- B. MOTOR & VELOCIDADE ---
        let currentMax = CONF.MAX_SPEED;
        
        // Turbo
        if (d.turboLock && d.nitro > 0) {
            currentMax = CONF.TURBO_MAX_SPEED;
            d.nitro -= 0.6;
            if (d.nitro <= 0) { d.nitro = 0; d.turboLock = false; }
            if (d.time % 2 === 0) this.spawnParticle(w/2 + (Math.random()*20-10), h*0.8, 'fire', '#ffaa00');
        } else {
            d.nitro = Math.min(100, d.nitro + 0.1);
        }
        
        // Boost Temporário (Mini Turbo)
        if(d.boostTimer > 0) { 
            currentMax += 100; d.boostTimer--; 
            this.spawnParticle(w/2, h*0.8, 'fire', '#00ffff');
        }

        // Aceleração (Auto-Gas ou Tecla)
        const hasGas = d.inputState === 2 || keys['ArrowUp'] || keys['KeyW'] || d.turboLock;
        if (hasGas && d.state === 'race') {
           d.speed += (currentMax - d.speed) * (CONF.ACCEL / 100);
        } else {
           d.speed *= CONF.FRICTION;
           if(keys['ArrowDown'] || keys['KeyS']) d.speed *= CONF.BRAKING;
        }

        // Offroad
        const isOffRoad = Math.abs(d.playerX) > 2.2;
        if (isOffRoad) {
            d.speed *= CONF.OFFROAD_DECEL;
            d.shake = 3;
            if(d.speed > 50 && d.time % 3 === 0) this.spawnParticle(w/2 + (Math.random()*40-20), h*0.9, 'smoke', '#5d4037');
        }

        // --- C. CURVAS & DRIFT (CORRIGIDO) ---
        const segIdx = Math.floor(d.pos / 200) % segments.length;
        const seg = segments[segIdx] || segments[0];
        const speedRatio = d.speed / CONF.MAX_SPEED;

        // Inércia Lateral
        // Força centrífuga empurra para fora da curva
        const centrifugal = seg.curve * (speedRatio * speedRatio) * CONF.CENTRIFUGAL_FORCE;
        
        // Drift Logic
        // Entrada (Pulo)
        if (d.driftState === 0 && Math.abs(d.steer) > 0.8 && speedRatio > 0.5 && !isOffRoad) {
            // Drift inicia se segurar curva forte
            d.driftState = 1; 
            d.driftDir = Math.sign(d.steer);
            d.driftCharge = 0; 
            d.bounce = -12; // Hop!
            window.Sfx.skid();
        }

        if (d.driftState === 1) {
            // Saída
            if (Math.abs(d.steer) < 0.2 || d.speed < 40) {
                if (d.mtStage > 0) {
                    d.boostTimer = d.mtStage * 40;
                    window.System.msg("BOOST!");
                    window.Sfx.play(800, 'square', 0.2, 0.2);
                }
                d.driftState = 0; d.mtStage = 0;
            } else {
                // Carregamento
                d.driftCharge++;
                if(d.driftCharge > 90) d.mtStage = 2; else if(d.driftCharge > 40) d.mtStage = 1;
                
                // Partículas (Sparks)
                const c = d.mtStage === 2 ? '#ffaa00' : (d.mtStage === 1 ? '#00ffff' : '#fff');
                if(d.time % 5 === 0) {
                    this.spawnParticle(w/2 - 40*d.driftDir, h*0.9, 'spark', c);
                    this.spawnParticle(w/2 + 40*d.driftDir, h*0.9, 'spark', c);
                }
            }
        }

        // Movimento Lateral (X)
        // Correção do "Tombo": Drift permite curva mais fechada visualmente, mas fisicamente desliza.
        const grip = (d.driftState === 1) ? CONF.DRIFT_GRIP : 1.0;
        const turnForce = d.steer * CONF.STEER_AUTHORITY * grip * speedRatio;
        
        d.playerX += turnForce - centrifugal;
        
        // Clamp
        if(d.playerX < -4.5) { d.playerX = -4.5; d.speed *= 0.9; }
        if(d.playerX > 4.5)  { d.playerX = 4.5;  d.speed *= 0.9; }

        // --- D. COLISÕES ---
        seg.obs.forEach(o => {
            if(o.x > 50) return; // Removido
            if(Math.abs(d.playerX - o.x) < CONF.HITBOX_WIDTH) {
                d.speed *= CONF.CRASH_PENALTY;
                d.shake = 20; d.bounce = -10;
                window.Sfx.crash();
                window.System.msg("BATEU!");
                o.x = 999; // Remove obstáculo
                for(let i=0; i<5; i++) this.spawnParticle(w/2, h*0.8, 'smoke', '#888');
            }
        });

        // --- E. PROGRESSO & RIVAIS ---
        d.pos += d.speed;
        while (d.pos >= trackLength) {
            d.pos -= trackLength;
            d.lap++;
            if (d.lap <= d.totalLaps) {
                window.System.msg(`VOLTA ${d.lap}/${d.totalLaps}`);
                window.Sfx.play(400, 'sine', 0.1, 0.1);
            } else if (d.state === 'race') {
                d.state = 'finished';
                window.System.msg(d.rank === 1 ? "VITORIA!" : "FIM!");
                setTimeout(()=>window.System.gameOver(Math.floor(d.score)), 2000);
            }
        }
        while(d.pos < 0) d.pos += trackLength;

        // IA Rubber Banding
        let pAhead = 0;
        d.rivals.forEach(r => {
            let dist = r.pos - d.pos;
            if(dist > trackLength/2) dist -= trackLength;
            if(dist < -trackLength/2) dist += trackLength;

            let targetS = CONF.MAX_SPEED * 0.92;
            if(dist > 600) targetS *= 0.8;  // Espera
            if(dist < -600) targetS *= 1.2; // Acelera
            
            r.speed += (targetS - r.speed) * r.aggro;
            r.pos += r.speed;
            if(r.pos >= trackLength) r.pos -= trackLength;

            const rSeg = segments[Math.floor(r.pos/200)%segments.length];
            let ideal = -(rSeg.curve * 0.5);
            if(Math.random() < r.mistakeProb) ideal = (Math.random()*4)-2;
            r.x += (ideal - r.x) * 0.05;

            // Rank
            let pTotal = d.pos + (d.lap * trackLength);
            let rTotal = r.pos + ((d.lap - (r.pos > d.pos + trackLength/2 ? 1:0)) * trackLength);
            if(rTotal > pTotal) pAhead++;
        });
        d.rank = 1 + pAhead;

        d.time++;
        d.score += d.speed * 0.01;
        d.bounce *= 0.8; d.shake *= 0.8;
        // Visual Tilt suavizado para evitar "capotamento"
        d.visualTilt += (d.steer * 20 - d.visualTilt) * 0.1; 
    },

    // -------------------------------------------------------------
    // PARTICLE SYSTEM (NOVO)
    // -------------------------------------------------------------
    spawnParticle: function(x, y, type, color) {
        if(particles.length > 50) particles.shift();
        particles.push({ 
            x:x, y:y, 
            vx: (Math.random()-0.5)*10, vy: (Math.random()-0.5)*10, 
            life: 1.0, color: color, type: type 
        });
    },

    // -------------------------------------------------------------
    // RENDER WORLD (ORIGINAL PRESERVADO + PARTÍCULAS)
    // -------------------------------------------------------------
    renderWorld: function(ctx, w, h) {
        const d = this;
        const cx = w / 2;
        const horizon = (h * 0.40) + (Math.random() * d.shake - d.shake/2);

        // 1. CÉU E PARALLAX (Original Colors)
        const currentSegIndex = Math.floor(d.pos / 200) % segments.length;
        const currentSeg = segments[currentSegIndex] || segments[0];
        const isOffRoad = Math.abs(d.playerX) > 2.2;

        let topSky = d.skyColor === 0 ? "#3388ff" : "#663399";
        let botSky = d.skyColor === 0 ? "#88ccff" : "#ffaa00";
        const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
        gradSky.addColorStop(0, topSky); gradSky.addColorStop(1, botSky);
        ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

        // Montanhas (Original)
        const bgOffset = (currentSeg.curve * 30) + (d.steer * 20);
        ctx.fillStyle = d.skyColor === 0 ? '#44aa44' : '#331133';
        ctx.beginPath(); ctx.moveTo(0, horizon);
        for(let i=0; i<=12; i++) {
            const mx = (w/12 * i) - (bgOffset * 0.5);
            const my = horizon - 50 - Math.abs(Math.sin(i + d.pos*0.0001))*40;
            ctx.lineTo(mx, my);
        }
        ctx.lineTo(w, horizon); ctx.fill();

        // Chão (Original Colors)
        ctx.fillStyle = isOffRoad ? '#336622' : '#448833';
        ctx.fillRect(0, horizon, w, h-horizon);

        // 2. ESTRADA (Pseudo-3D)
        let drawDistance = CONF.DRAW_DISTANCE; 
        let dx = 0;
        let camX = d.playerX * (w * 0.4);
        let segmentCoords = [];

        for(let n = 0; n < drawDistance; n++) {
            const segIdx = (currentSegIndex + n) % segments.length;
            const seg = segments[segIdx];
            dx += (seg.curve * 0.8);
            
            const z = n * 20; 
            const scale = 1 / (1 + (z * 0.05));
            const scaleNext = 1 / (1 + ((z+20) * 0.05));
            const screenY = horizon + ((h - horizon) * scale);
            const screenYNext = horizon + ((h - horizon) * scaleNext);
            const screenX = cx - (camX * scale) - (dx * z * scale * 2);
            const screenXNext = cx - (camX * scaleNext) - ((dx + seg.curve*0.8) * (z+20) * scaleNext * 2);
            const roadWidth = (w * 3) * scale;
            const roadWidthNext = (w * 3) * scaleNext;
            
            segmentCoords.push({ x: screenX, y: screenY, scale: scale, index: segIdx, z: z });

            const grassColor = (seg.color === 'dark') ? (isOffRoad?'#336622':'#448833') : (isOffRoad?'#3a7528':'#55aa44');
            const roadColor = (seg.color === 'dark') ? '#666' : '#636363';
            const rumbleColor = (seg.color === 'dark') ? '#c00' : '#fff';

            // Grama
            ctx.fillStyle = grassColor; ctx.fillRect(0, screenYNext, w, screenY - screenYNext);
            
            // Rumble
            ctx.fillStyle = rumbleColor;
            ctx.beginPath(); ctx.moveTo(screenX - roadWidth/2 - roadWidth*0.1, screenY); ctx.lineTo(screenX + roadWidth/2 + roadWidth*0.1, screenY); ctx.lineTo(screenXNext + roadWidthNext/2 + roadWidthNext*0.1, screenYNext); ctx.lineTo(screenXNext - roadWidthNext/2 - roadWidthNext*0.1, screenYNext); ctx.fill();
            
            // Pista
            ctx.fillStyle = roadColor;
            ctx.beginPath(); ctx.moveTo(screenX - roadWidth/2, screenY); ctx.lineTo(screenX + roadWidth/2, screenY); ctx.lineTo(screenXNext + roadWidthNext/2, screenYNext); ctx.lineTo(screenXNext - roadWidthNext/2, screenYNext); ctx.fill();
        }

        // 3. SPRITES (De trás para frente)
        for(let n = drawDistance-1; n >= 0; n--) {
            const coord = segmentCoords[n];
            const seg = segments[coord.index];
            const scale = coord.scale;

            // Rivais
            d.rivals.forEach(r => {
                let rRelPos = r.pos - d.pos;
                if(rRelPos < -trackLength/2) rRelPos += trackLength;
                if(rRelPos > trackLength/2) rRelPos -= trackLength;
                
                let distInSegs = Math.floor(rRelPos / 200);
                if (Math.abs(distInSegs - n) < 1.5 && n > 1) {
                    const rX = coord.x + (r.x * (w * 3) * scale / 2);
                    const rY = coord.y;
                    
                    ctx.save(); ctx.translate(rX, rY); ctx.scale(scale * 12, scale * 12);
                    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 3, 0, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = r.color; ctx.fillRect(-6, -8, 12, 6); // Kart box
                    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -12, 4, 0, Math.PI*2); ctx.fill(); // Helmet
                    ctx.restore();
                }
            });

            // Obstáculos
            seg.obs.forEach(o => {
                if(o.x > 50) return;
                const sX = coord.x + (o.x * (w * 3) * scale / 2);
                const sY = coord.y;
                const size = (w * 0.22) * scale;

                if (o.type === 'cone') {
                    ctx.fillStyle = '#ff5500'; ctx.beginPath(); ctx.moveTo(sX, sY - size); ctx.lineTo(sX - size*0.3, sY); ctx.lineTo(sX + size*0.3, sY); ctx.fill();
                } else {
                    ctx.fillStyle = '#f1c40f'; ctx.fillRect(sX - size/2, sY - size, size, size*0.6);
                    ctx.fillStyle = '#000'; ctx.textAlign='center'; ctx.font = `bold ${size*0.4}px Arial`;
                    ctx.fillText(seg.curve > 0 ? ">>>" : "<<<", sX, sY - size*0.2);
                }
            });
        }

        // 4. JOGADOR (ORIGINAL ASSET)
        // Usando drawKartSprite exatamente como fornecido, mas com ajustes de Turbo
        const carScale = w * 0.0055;
        this.drawKartSprite(ctx, cx, h*0.85 + d.bounce, carScale, d.steer, d.visualTilt, d);

        // 5. PARTÍCULAS (Overlay)
        particles.forEach((p, i) => {
            p.x += p.vx; p.y += p.vy; p.life -= 0.05;
            if(p.life <= 0) particles.splice(i,1);
            else {
                ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
                const sz = (p.type==='fire'?5:3);
                ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, Math.PI*2); ctx.fill();
                ctx.globalAlpha = 1.0;
            }
        });
    },

    // HELPER: Sprite do Kart (Original, sem alteração de design)
    drawKartSprite: function(ctx, cx, y, carScale, steer, tilt, d) {
        ctx.save(); ctx.translate(cx, y); ctx.scale(carScale, carScale);
        
        let visualRotation = tilt * 0.02; 
        if (d.driftState === 1) visualRotation += (d.driftDir * 0.3); // Drift Angle
        ctx.rotate(visualRotation);

        // Sombra
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 35, 60, 15, 0, 0, Math.PI*2); ctx.fill();

        // Chassi (Vermelho Original)
        const gradBody = ctx.createLinearGradient(-30, 0, 30, 0);
        gradBody.addColorStop(0, '#cc0000'); gradBody.addColorStop(0.5, '#ff4444'); gradBody.addColorStop(1, '#cc0000');
        ctx.fillStyle = gradBody;
        ctx.beginPath(); ctx.moveTo(-25, -30); ctx.lineTo(25, -30); ctx.lineTo(40, 10); ctx.lineTo(10, 35); ctx.lineTo(-10, 35); ctx.lineTo(-40, 10); ctx.fill();

        // Turbo Flame (NOVO - Apenas visual)
        if (d.turboLock || d.boostTimer > 0) {
            const fireSize = 10 + Math.random() * 15;
            ctx.fillStyle = (d.mtStage === 2 || d.turboLock) ? '#00ffff' : '#ffaa00';
            ctx.beginPath(); ctx.arc(-20, -30, fireSize, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(20, -30, fireSize, 0, Math.PI*2); ctx.fill();
        }

        // Rodas
        const wheelAngle = steer * 0.8;
        ctx.fillStyle = '#111';
        const drawWheel = (wx, wy) => {
            ctx.save(); ctx.translate(wx, wy); ctx.rotate(wheelAngle); ctx.fillRect(-12, -15, 24, 30); ctx.fillStyle = '#666'; ctx.fillRect(-5, -5, 10, 10); ctx.fillStyle = '#111'; ctx.restore();
        };
        drawWheel(-45, 15); drawWheel(45, 15); ctx.fillRect(-50, -25, 20, 30); ctx.fillRect(30, -25, 20, 30);

        // Piloto "Otto" (Capacete Branco, Macacão Cinza/Preto)
        ctx.save(); ctx.translate(0, -10); ctx.rotate(steer * 0.3);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -20, 18, 0, Math.PI*2); ctx.fill(); // Helmet
        ctx.fillStyle = '#333'; ctx.fillRect(-15, -25, 30, 8); // Body
        ctx.fillStyle = 'red'; ctx.font='bold 12px Arial'; ctx.textAlign='center'; ctx.fillText('M', 0, -32); // Logo
        ctx.restore(); ctx.restore(); 
    },

    // -------------------------------------------------------------
    // RENDER UI (MELHORADA COM MAPA ROTATIVO)
    // -------------------------------------------------------------
    renderUI: function(ctx, w, h) {
        const d = this;
        if (d.state === 'race') {
            
            // VELOCIMETRO
            const hudX = w - 80, hudY = h - 60;
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(hudX, hudY, 55, 0, Math.PI * 2); ctx.fill();
            const rpm = Math.min(1, d.speed / CONF.TURBO_MAX_SPEED);
            ctx.beginPath(); ctx.arc(hudX, hudY, 50, Math.PI, Math.PI + Math.PI * rpm);
            ctx.lineWidth = 6; ctx.strokeStyle = d.turboLock ? '#00ffff' : '#ff3300'; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = "bold 36px sans-serif";
            ctx.fillText(Math.floor(d.speed), hudX, hudY + 10);
            
            // BARRA NITRO
            const nW = 200;
            ctx.fillStyle = '#111'; ctx.fillRect(w/2 - nW/2, 20, nW, 15);
            ctx.fillStyle = d.turboLock ? '#00ffff' : '#ffaa00';
            ctx.fillRect(w/2 - nW/2 + 2, 22, (nW-4) * (d.nitro/100), 11);

            // MINI MAPA ROTATIVO (CORRIGIDO PARA O ESTILO MARIO KART)
            if (minimapPoints.length > 0) {
                const mapS = 120, mapX = 20, mapY = 20;
                ctx.save();
                
                // Clip Circular
                ctx.beginPath(); ctx.arc(mapX + mapS/2, mapY + mapS/2, mapS/2, 0, Math.PI*2); ctx.clip();
                ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fill();

                // Centraliza e Rotaciona
                ctx.translate(mapX + mapS/2, mapY + mapS/2);
                
                // Encontrar direção do jogador no mapa
                const pIdx = Math.floor((d.pos / trackLength) * minimapPoints.length) % minimapPoints.length;
                const pPoint = minimapPoints[pIdx];
                
                // Gira o mapa para o jogador apontar para cima (-PI/2)
                ctx.rotate(-pPoint.dir - Math.PI/2);
                
                // Move o mundo para o jogador ficar no centro
                const zoom = 2.5;
                ctx.translate(-pPoint.x * zoom, -pPoint.y * zoom);

                // Desenha Pista
                ctx.strokeStyle = '#aaa'; ctx.lineWidth = 8; ctx.lineCap='round';
                ctx.beginPath();
                minimapPoints.forEach((p, i) => {
                    if (i === 0) ctx.moveTo(p.x*zoom, p.y*zoom);
                    else ctx.lineTo(p.x*zoom, p.y*zoom);
                });
                ctx.stroke();

                // Rivais
                d.rivals.forEach(r => {
                    const rI = Math.floor((r.pos / trackLength) * minimapPoints.length) % minimapPoints.length;
                    const rP = minimapPoints[rI];
                    ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(rP.x*zoom, rP.y*zoom, 6, 0, Math.PI*2); ctx.fill();
                });

                // Jogador (Sempre no centro relativo da transformação, desenhado depois)
                ctx.restore(); // Sai do contexto rotacionado para desenhar o icone do player fixo

                // Desenha seta do jogador fixa no centro do minimapa
                ctx.fillStyle = '#00ffff'; 
                ctx.beginPath(); 
                const cx = mapX + mapS/2, cy = mapY + mapS/2;
                ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 6, cy + 6); ctx.lineTo(cx - 6, cy + 6); 
                ctx.fill();
            }
            
            // VOLANTE VIRTUAL
            if (d.virtualWheel.opacity > 0.01) {
                ctx.save(); ctx.globalAlpha = d.virtualWheel.opacity;
                ctx.translate(d.virtualWheel.x, d.virtualWheel.y);
                ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, d.virtualWheel.r, 0, Math.PI*2); ctx.stroke();
                ctx.rotate(d.steer * 1.5);
                ctx.fillStyle = '#ff3300'; ctx.beginPath(); ctx.arc(0, -d.virtualWheel.r, 10, 0, Math.PI*2); ctx.fill();
                ctx.restore();
            }

        } else {
            // FIM
            ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#fff"; ctx.textAlign = "center";
            ctx.font = "bold 60px sans-serif"; ctx.fillText(d.rank === 1 ? "VITÓRIA!" : `${d.rank}º LUGAR`, w / 2, h * 0.4);
        }
    }
};

if(window.System) {
    window.System.registerGame('drive', 'Otto Kart Fixed', '🏎️', Logic, { camOpacity: 0.4, showWheel: false });
}
})();