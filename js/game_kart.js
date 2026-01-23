// =====================================================
// KART DO OTTO – HYBRID FUSION: NINTENDO FEEL EDITION
// STATUS: PHYSICS v2.0 + RENDER ENHANCED + AI PRO
// ENGINEER: CODE 177
// =====================================================

(function() {

    // =================================================================
    // 0. GLOBAL UTILS & ASSETS GENERATION
    // =================================================================
    
    // Sistema de Partículas Global (Performance Pool)
    let particles = [];
    const MAX_PARTICLES = 100;

    function spawnParticle(x, y, color, speed, life) {
        if (particles.length > MAX_PARTICLES) particles.shift();
        const angle = Math.random() * Math.PI * 2;
        const v = Math.random() * speed;
        particles.push({
            x: x, y: y,
            vx: Math.cos(angle) * v,
            vy: Math.sin(angle) * v - (speed * 0.5), // Tendência a subir
            color: color,
            life: life,
            maxLife: life
        });
    }

    // Mini Mapa Data
    let minimapPoints = [];
    function buildMiniMap(segments) {
        minimapPoints = [];
        let x = 0;
        let y = 0;
        let dir = -Math.PI / 2; // Começa apontando para Norte
        
        segments.forEach(seg => {
            dir += seg.curve * 0.0035; // Fator de escala da curva para o mapa
            x += Math.cos(dir) * 4;
            y += Math.sin(dir) * 4;
            minimapPoints.push({ x, y });
        });
    }

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÃO DE ENGENHARIA (TUNING "NINTENDO FEEL")
    // -----------------------------------------------------------------
    const CONF = {
        // Velocidade & Motor
        MAX_SPEED: 245,           // Velocidade top base
        TURBO_MAX_SPEED: 440,     // Velocidade com Cogumelo/Turbo
        ACCEL: 1.8,               // Arrancada mais forte
        FRICTION: 0.98,           // Resistência do ar
        OFFROAD_DECEL: 0.92,      // Punição severa na grama
        OFFROAD_LIMIT: 2.3,       // Largura da pista segura

        // Curvas & Drift
        CENTRIFUGAL: 0.22,        // Força que joga para fora na curva
        STEER_SPEED: 0.16,        // Agilidade do volante
        DRIFT_GRIP: 0.96,         // Perda leve de tração no drift
        DRIFT_CHARGE_RATE: 1.2,   // Velocidade de carga do Mini-Turbo
        
        // Gameplay
        TOTAL_LAPS: 3,
        CAMERA_HEIGHT: 1100,      // Câmera mais alta (estilo MK)
        CAMERA_DEPTH: 0.8,        // Profundidade de campo
        
        // Input
        DEADZONE: 0.08,
        INPUT_SMOOTHING: 0.15     // Input mais "snappy"
    };

    // -----------------------------------------------------------------
    // 2. LÓGICA DO JOGO (STATE MACHINE)
    // -----------------------------------------------------------------
    const SEGMENT_LENGTH = 200;
    const RUMBLE_LENGTH = 3;
    let segments = [];
    let trackLength = 0;
    let nitroBtn = null; // UI Element

    const Logic = {
        // Estado Físico
        speed: 0,
        pos: 0,
        playerX: 0,
        steer: 0,
        targetSteer: 0,
        
        // Mecânicas de Corrida
        state: 'race', // 'race', 'finished'
        lap: 1,
        rank: 1,
        time: 0,
        finishTimer: 0,
        
        // Mecânicas de Power-up/Drift
        nitro: 100,
        turboLock: false, // Se ativado por gesto
        boostTimer: 0,    // Frames de boost ativo
        driftState: 0,    // 0: Normal, 1: Drifting
        driftDir: 0,      // -1 (Esq) ou 1 (Dir)
        driftCharge: 0,   // Carga do Mini-Turbo
        mtStage: 0,       // 0: Nada, 1: Azul, 2: Laranja
        hopY: 0,          // Pulinho do drift

        // Visuais
        visualTilt: 0,
        bounce: 0,
        skyOffset: 0,
        
        // IA & Input
        rivals: [],
        inputState: 0, // 0: Nada, 1: Mão, 2: Volante
        gestureTimer: 0,
        virtualWheel: { x:0, y:0, r:0, opacity:0, angle: 0 },

        // -------------------------------------------------------------
        // CONSTRUÇÃO DE PISTA (OTTO CIRCUIT LAYOUT)
        // -------------------------------------------------------------
        buildTrack: function() {
            segments = [];
            const addRoad = (enter, curve, yChange) => {
                const startIdx = segments.length;
                let currentY = segments.length > 0 ? segments[segments.length-1].y : 0;
                
                for(let i = 0; i < enter; i++) {
                    const isDark = Math.floor(segments.length / RUMBLE_LENGTH) % 2;
                    // Interpolação suave de altura (Y)
                    const percent = i / enter;
                    const thisY = currentY + (yChange * percent); 
                    
                    segments.push({
                        index: segments.length,
                        curve: curve,
                        y: thisY,
                        color: isDark ? 'dark' : 'light',
                        obs: []
                    });
                }
            };

            const addProp = (idx, type, x) => {
                if(segments[idx]) segments[idx].obs.push({ type, x });
            };

            // --- LAYOUT DA PISTA ---
            addRoad(50, 0, 0);                 // Reta Largada
            addRoad(40, 0.8, 0);               // Curva Suave Dir
            addRoad(20, -0.5, 0);              // S-Bend
            addRoad(40, 0, 1500);              // Subida Reta
            addRoad(30, 1.5, -1500);           // Descida em Curva Forte (Hairpin)
            addProp(segments.length-15, 'sign', -1.8);

            addRoad(50, 0, 0);                 // Reta Plana
            addRoad(30, -1.2, 0);              // Curva Esq
            addRoad(30, -1.2, 0);              // Cont. Esq
            addProp(segments.length-15, 'cone', 0.5);

            addRoad(60, 0, 1000);              // Grande Subida
            addRoad(20, 0, 0);                 // Topo
            addRoad(50, 2.5, -2000);           // Mega Descida em Curva
            
            addRoad(40, -0.5, 0);              // Ajuste final
            addRoad(30, 0, 0);                 // Reta final

            trackLength = segments.length * SEGMENT_LENGTH;
            buildMiniMap(segments); // Gera o mapa baseado na geometria
        },

        // -------------------------------------------------------------
        // SETUP UI (HTML OVERLAY)
        // -------------------------------------------------------------
        setupUI: function() {
            const oldBtn = document.getElementById('nitro-btn-kart');
            if(oldBtn) oldBtn.remove();

            nitroBtn = document.createElement('div');
            nitroBtn.id = 'nitro-btn-kart';
            nitroBtn.innerHTML = "⚡";
            Object.assign(nitroBtn.style, {
                position: 'absolute', top: '35%', right: '20px', width: '80px', height: '80px',
                borderRadius: '50%', background: 'linear-gradient(135deg, #ffcc00, #ff6600)', 
                border: '4px solid #fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "sans-serif", fontSize: '40px', zIndex: '100',
                boxShadow: '0 5px 15px rgba(0,0,0,0.5)', cursor: 'pointer', userSelect: 'none',
                transform: 'scale(1)', transition: 'transform 0.1s'
            });

            const activateTurbo = (e) => {
                if(e) { e.preventDefault(); e.stopPropagation(); }
                if(this.nitro > 10) {
                    this.turboLock = !this.turboLock;
                    nitroBtn.style.transform = this.turboLock ? 'scale(0.9)' : 'scale(1)';
                    if(this.turboLock && window.Sfx) window.Sfx.play(600, 'square', 0.1, 0.1);
                }
            };

            nitroBtn.addEventListener('touchstart', activateTurbo, {passive:false});
            nitroBtn.addEventListener('mousedown', activateTurbo);
            document.getElementById('game-ui').appendChild(nitroBtn);
        },

        // -------------------------------------------------------------
        // INICIALIZAÇÃO
        // -------------------------------------------------------------
        init: function() { 
            this.buildTrack();
            this.setupUI();
            
            // Reset Estado
            this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0;
            this.state = 'race'; this.lap = 1; this.nitro = 100;
            this.rivals = [
                // IA Avançada com rastreamento de volta individual
                { pos: 600,  lap: 1, x: -0.5, speed: 0, color: '#32cd32', name: 'Luigi', aggro: 0.02, offset: 0 },
                { pos: 1000, lap: 1, x: 0.5,  speed: 0, color: '#1e90ff', name: 'Toad',  aggro: 0.03, offset: 0 },
                { pos: 1400, lap: 1, x: 0,    speed: 0, color: '#ff4500', name: 'Mario', aggro: 0.04, offset: 0 }
            ];
            
            if(window.System) window.System.msg("LARGADA!"); 
        },

        // =============================================================
        // GAME LOOP (60 FPS)
        // =============================================================
        update: function(ctx, w, h, pose) {
            // 1. INPUT & FÍSICA
            this.updatePhysics(w, h, pose);
            
            // 2. RENDERIZAÇÃO
            this.renderWorld(ctx, w, h);
            
            // 3. INTERFACE
            this.renderUI(ctx, w, h);

            return Math.floor(this.speed * 10); // Score dummy
        },

        // -------------------------------------------------------------
        // ENGINE DE FÍSICA (EVOLUÍDA)
        // -------------------------------------------------------------
        updatePhysics: function(w, h, pose) {
            const d = Logic;
            
            // --- A. POSE DETECTION INPUT ---
            let detected = false;
            if (d.state === 'race' && pose && pose.keypoints) {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                
                if (lw && rw && lw.score > 0.4 && rw.score > 0.4) {
                    detected = true;
                    const p1 = window.Gfx.map(lw, w, h);
                    const p2 = window.Gfx.map(rw, w, h);
                    
                    // Volante Virtual
                    d.virtualWheel.x = (p1.x + p2.x) / 2;
                    d.virtualWheel.y = (p1.y + p2.y) / 2;
                    d.virtualWheel.r = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2;
                    d.virtualWheel.opacity = 1;

                    // Cálculo de Ângulo
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const angle = Math.atan2(dy, dx);
                    d.targetSteer = angle * 2.5; // Ganho de direção

                    // Gesto de Turbo (Mãos para cima da linha do horizonte)
                    if (d.virtualWheel.y < h * 0.35 && d.nitro > 0) {
                        d.gestureTimer++;
                        if(d.gestureTimer > 10) d.turboLock = true;
                    } else {
                        d.gestureTimer = 0;
                        d.turboLock = false;
                    }
                }
            }
            
            if (!detected) {
                d.targetSteer = 0;
                d.virtualWheel.opacity *= 0.9;
            }

            // Suavização da Direção
            d.steer += (d.targetSteer - d.steer) * CONF.INPUT_SMOOTHING;
            // Clamp estrito para evitar giro infinito
            d.steer = Math.max(-1.5, Math.min(1.5, d.steer));

            // --- B. VEÍCULO & MOTOR ---
            let maxS = CONF.MAX_SPEED;
            if (d.turboLock || d.boostTimer > 0) maxS = CONF.TURBO_MAX_SPEED;
            
            // Aceleração / Desaceleração
            if (detected || d.boostTimer > 0 || d.inputState > 0) { // Auto-gas se input detectado
                d.speed += (maxS - d.speed) * (CONF.ACCEL / 100);
            } else {
                d.speed *= CONF.FRICTION;
            }

            // Consumo de Nitro
            if(d.turboLock && d.nitro > 0) d.nitro -= 0.5;
            else if(!d.turboLock && d.nitro < 100) d.nitro += 0.1; // Recarga lenta
            if(d.nitro <= 0) d.turboLock = false;
            
            // Boost Timer (Do Drift)
            if (d.boostTimer > 0) {
                d.boostTimer--;
                spawnParticle(w/2, h-50, '#00ffff', 15, 20); // Efeito visual
            }

            // --- C. OFFROAD & LIMITES ---
            const isOffRoad = Math.abs(d.playerX) > CONF.OFFROAD_LIMIT;
            
            if (isOffRoad) {
                // Penalidade severa mas sem "muro invisível"
                d.speed *= CONF.OFFROAD_DECEL;
                d.bounce = Math.random() * 5 - 2.5; // Trepidação
                // Partículas de terra
                if(d.speed > 50) spawnParticle(w/2 + (Math.random()*100-50), h-20, '#5c4033', 5, 15);
            } else {
                d.bounce *= 0.8; // Estabiliza
            }
            
            // Limites extremos do mundo
            if (d.playerX < -5) { d.playerX = -5; d.speed = 0; }
            if (d.playerX > 5)  { d.playerX = 5; d.speed = 0; }

            // --- D. CURVAS E DRIFT (MECÂNICA CORE) ---
            const segIdx = Math.floor(d.pos / SEGMENT_LENGTH) % segments.length;
            const currentSeg = segments[segIdx];
            const speedRatio = d.speed / CONF.MAX_SPEED;
            
            // Força Centrífuga Realista
            const centrifugalForce = -(currentSeg.curve * speedRatio * speedRatio * CONF.CENTRIFUGAL);
            
            // Drift State Machine
            if (d.driftState === 0) {
                // Iniciar Drift (Curva forte + Velocidade + Pulo)
                if (Math.abs(d.steer) > 0.8 && speedRatio > 0.5 && !isOffRoad) {
                    d.driftState = 1;
                    d.driftDir = Math.sign(d.steer);
                    d.driftCharge = 0;
                    d.hopY = 15; // Pulo visual estilo Mario Kart
                    if(window.Sfx) window.Sfx.play(400, 'square', 0.1, 0.05); // Som pulo
                }
            } else {
                // Durante Drift
                d.hopY *= 0.8; // Gravidade do pulo
                
                // Manter Drift
                if (Math.abs(d.steer) > 0.1 && speedRatio > 0.2 && !isOffRoad) {
                    // Carregar Mini-Turbo
                    d.driftCharge += CONF.DRIFT_CHARGE_RATE;
                    
                    // Níveis de Turbo
                    if(d.driftCharge > 150) d.mtStage = 2; // Laranja
                    else if(d.driftCharge > 60) d.mtStage = 1; // Azul
                    else d.mtStage = 0;
                    
                    // Partículas de Drift nas rodas
                    const sparkColor = d.mtStage === 2 ? '#ffaa00' : (d.mtStage === 1 ? '#00ffff' : '#ffffaa');
                    if(d.time % 3 === 0) {
                        spawnParticle(w/2 - 60, h-40, sparkColor, 8, 10);
                        spawnParticle(w/2 + 60, h-40, sparkColor, 8, 10);
                    }
                    
                    // Física de Drift (Escorrega mais, vira menos)
                    d.playerX += (d.steer * 0.05); // Controle reduzido
                    d.playerX -= (d.driftDir * 0.08 * speedRatio); // Desliza para fora
                    
                } else {
                    // Soltar Drift (BOOST!)
                    if (d.mtStage > 0) {
                        const boostFrames = d.mtStage === 2 ? 60 : 30;
                        d.boostTimer = boostFrames;
                        if(window.System) window.System.msg(d.mtStage === 2 ? "SUPER TURBO!" : "TURBO!");
                        if(window.Sfx) window.Sfx.play(800, 'sawtooth', 0.3, 0.5);
                    }
                    d.driftState = 0;
                    d.mtStage = 0;
                }
            }
            
            // Aplicação final de movimento lateral
            if (d.driftState === 0) {
                d.playerX += d.steer * speedRatio * CONF.STEER_SPEED;
            }
            d.playerX += centrifugalForce;

            // --- E. PROGRESSO E IA ---
            d.pos += d.speed;
            
            // Loop Pista e Voltas
            while (d.pos >= trackLength) {
                d.pos -= trackLength;
                d.lap++;
                if (d.lap > CONF.TOTAL_LAPS && d.state !== 'finished') {
                    d.state = 'finished';
                    if(window.System) window.System.msg(d.rank === 1 ? "VITÓRIA!" : "FINALIZADO!");
                } else if(window.System) {
                    window.System.msg("VOLTA " + d.lap);
                }
            }
            while(d.pos < 0) d.pos += trackLength;

            // IA Humanizada
            let playerDist = (d.lap * trackLength) + d.pos;
            let pAhead = 0;

            d.rivals.forEach(r => {
                // Cálculo de velocidade alvo (Rubber banding)
                let rDist = (r.lap * trackLength) + r.pos;
                let diff = rDist - playerDist;
                
                let targetSpeed = CONF.MAX_SPEED * 0.92; // Base speed
                if (diff < -500) targetSpeed *= 1.15; // Catch up
                if (diff > 1000) targetSpeed *= 0.85; // Wait up
                
                r.speed += (targetSpeed - r.speed) * 0.05;
                r.pos += r.speed;

                // Loop Rival
                if (r.pos >= trackLength) {
                    r.pos -= trackLength;
                    r.lap++;
                }
                
                // IA Steering (Segue a pista)
                const rSegIdx = Math.floor(r.pos / SEGMENT_LENGTH) % segments.length;
                const rSeg = segments[rSegIdx];
                let idealX = -(rSeg.curve * 0.8); 
                r.x += (idealX - r.x) * r.aggro; // Suavização

                // Rank Check (Absoluto)
                rDist = (r.lap * trackLength) + r.pos; // Recalcula com novos valores
                if (rDist > playerDist) pAhead++;
            });
            d.rank = 1 + pAhead;

            // --- F. COLISÃO OBSTÁCULOS ---
            const playerHitbox = 0.5;
            currentSeg.obs.forEach(o => {
                if (Math.abs(d.playerX - o.x) < playerHitbox) {
                    d.speed *= 0.4; // Crash penalty
                    d.bounce = -20;
                    o.x = 999; // Remove obstáculo (efeito visual de destruir)
                    spawnParticle(w/2, h-50, '#ffaa00', 10, 30); // Explosão
                    if(window.Gfx) window.Gfx.shake(10);
                }
            });

            d.time++;
            // Tilt visual (inclinação do chassi)
            d.visualTilt += (d.steer * 25 - d.visualTilt) * 0.1;
        },

        // -------------------------------------------------------------
        // RENDERIZAÇÃO DE MUNDO (PSEUDO-3D MELHORADO)
        // -------------------------------------------------------------
        renderWorld: function(ctx, w, h) {
            const d = Logic;
            const cx = w / 2;
            const horizon = h * 0.45; // Horizonte um pouco mais alto

            // 1. SKYBOX (GRADIENTES VIBRANTES)
            const gSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gSky.addColorStop(0, "#0066cc");
            gSky.addColorStop(1, "#66ccff");
            ctx.fillStyle = gSky;
            ctx.fillRect(0, 0, w, horizon);

            // 2. PARALLAX SCENERY
            // Montanhas simples se movendo com a curva
            const currentSegIdx = Math.floor(d.pos / SEGMENT_LENGTH) % segments.length;
            const baseSeg = segments[currentSegIdx];
            const bgOffset = (baseSeg.curve * 2 + d.steer) * 40;
            
            ctx.fillStyle = "#1e90ff"; // Montanhas distantes (azulado)
            ctx.beginPath();
            for(let i=0; i<w; i+=10) {
                const hM = 50 + Math.sin((i + d.pos*0.05 + bgOffset)*0.01) * 30;
                ctx.lineTo(i, horizon - hM);
            }
            ctx.lineTo(w, horizon); ctx.lineTo(0, horizon); ctx.fill();

            // Chão (Gradiente)
            const gGround = ctx.createLinearGradient(0, horizon, 0, h);
            gGround.addColorStop(0, "#2d802d"); // Verde escuro longe
            gGround.addColorStop(1, "#33cc33"); // Verde claro perto
            ctx.fillStyle = gGround;
            ctx.fillRect(0, horizon, w, h-horizon);

            // 3. ESTRADA (PROJEÇÃO 3D)
            const drawDistance = 80; // Distância de visão
            let dx = 0;
            let dY = 0; // Altura acumulada
            let camX = d.playerX * (w * 0.5); // Posição câmera X
            let camY = 1500 + segments[currentSegIdx].y; // Altura base da câmera + pista

            let zMap = []; // Armazena coords para sprites

            for (let n = 0; n < drawDistance; n++) {
                const segIdx = (currentSegIdx + n) % segments.length;
                const seg = segments[segIdx];
                const looped = segIdx < currentSegIdx; // Se deu a volta no array
                
                // Curva acumulativa
                dx += seg.curve;
                dY = seg.y;

                // Geometria Projetiva
                const z = n * SEGMENT_LENGTH; 
                if (z < CONF.CAMERA_DEPTH) continue; // Clip plane

                // Escala baseada em Z (Perspectiva)
                const scale = CONF.CAMERA_DEPTH / (z + CONF.CAMERA_DEPTH); // Simplificado
                const scaleNext = CONF.CAMERA_DEPTH / ((z+SEGMENT_LENGTH) + CONF.CAMERA_DEPTH);

                // Posição de tela
                // X: Centro - (CameraPos * Scale) - (CurvaAcumulada * Scale)
                const screenX = cx - (camX * scale) - (dx * z * scale * 0.003); 
                const screenXNext = cx - (camX * scaleNext) - ((dx + seg.curve) * (z+SEGMENT_LENGTH) * scaleNext * 0.003);
                
                // Y: Horizonte + (AlturaRelativa * Scale)
                const relY = (dY - camY);
                const screenY = horizon + (relY * scale * 0.15) + (n*2); // +n*2 compensa perspectiva linear
                const screenYNext = horizon + (relY * scaleNext * 0.15) + ((n+1)*2);

                const width = w * 2.5 * scale;
                const widthNext = w * 2.5 * scaleNext;

                zMap.push({ idx: segIdx, sx: screenX, sy: screenY, scale: scale });

                // Desenha Segmento
                const colorRoad = seg.color === 'dark' ? '#555' : '#505050';
                const colorRumble = seg.color === 'dark' ? '#cc0000' : '#ffffff';
                const colorGrass = seg.color === 'dark' ? '#2d802d' : '#33cc33';

                // Grama Lateral (Opcional, para cobrir falhas)
                // ctx.fillStyle = colorGrass; ctx.fillRect(0, screenYNext, w, screenY-screenYNext);

                // Rumble Strip (Zebras)
                ctx.fillStyle = colorRumble;
                ctx.beginPath();
                ctx.moveTo(screenX - width - width*0.15, screenY);
                ctx.lineTo(screenX + width + width*0.15, screenY);
                ctx.lineTo(screenXNext + widthNext + widthNext*0.15, screenYNext);
                ctx.lineTo(screenXNext - widthNext - widthNext*0.15, screenYNext);
                ctx.fill();

                // Asfalto
                ctx.fillStyle = colorRoad;
                ctx.beginPath();
                ctx.moveTo(screenX - width, screenY);
                ctx.lineTo(screenX + width, screenY);
                ctx.lineTo(screenXNext + widthNext, screenYNext);
                ctx.lineTo(screenXNext - widthNext, screenYNext);
                ctx.fill();
            }

            // 4. SPRITES (PAINTER'S ALGORITHM: BACK TO FRONT)
            for (let i = zMap.length - 1; i >= 0; i--) {
                const zm = zMap[i];
                const seg = segments[zm.idx];
                
                // A. OBSTÁCULOS
                seg.obs.forEach(o => {
                    if(o.x > 500) return; // Destruído
                    const oX = zm.sx + (o.x * w * 2.5 * zm.scale);
                    const oY = zm.sy;
                    const size = 600 * zm.scale;
                    
                    if(o.type === 'cone') {
                        ctx.fillStyle = '#ff6600';
                        ctx.beginPath(); ctx.moveTo(oX, oY-size); ctx.lineTo(oX-size/3, oY); ctx.lineTo(oX+size/3, oY); ctx.fill();
                    } else if (o.type === 'sign') {
                        ctx.fillStyle = '#ffcc00'; ctx.fillRect(oX-size/2, oY-size, size, size*0.7);
                        ctx.fillStyle = '#333'; ctx.fillRect(oX-size/10, oY, size/5, size/3);
                        ctx.fillStyle = '#000'; ctx.font=`${size*0.5}px Arial`; ctx.textAlign='center';
                        ctx.fillText(seg.curve > 0 ? ">" : "<", oX, oY - size*0.2);
                    }
                });

                // B. RIVAIS
                d.rivals.forEach(r => {
                    // Lógica para determinar se o rival está neste segmento
                    // Calcula distância relativa considerando loop da pista
                    let rRel = (r.lap * trackLength + r.pos) - (d.lap * trackLength + d.pos);
                    // Aproximação visual
                    let rSegIdx = Math.floor(r.pos / SEGMENT_LENGTH);
                    
                    if (rSegIdx === zm.idx) {
                        const rX = zm.sx + (r.x * w * 2.5 * zm.scale);
                        const rY = zm.sy;
                        const size = 1000 * zm.scale; // Tamanho do kart
                        
                        // Desenho simples do rival
                        ctx.save();
                        ctx.translate(rX, rY);
                        // Sombra
                        ctx.fillStyle = "rgba(0,0,0,0.4)";
                        ctx.beginPath(); ctx.ellipse(0, 0, size*0.4, size*0.1, 0, 0, Math.PI*2); ctx.fill();
                        // Kart
                        ctx.fillStyle = r.color;
                        ctx.fillRect(-size/4, -size/3, size/2, size/3);
                        // Cabeça
                        ctx.fillStyle = "#fff";
                        ctx.beginPath(); ctx.arc(0, -size/2, size/6, 0, Math.PI*2); ctx.fill();
                        // Nome (Opcional)
                        if(i < 10) { // Só desenha nome se estiver perto
                             ctx.fillStyle = "#fff"; ctx.font=`bold ${size*0.2}px Arial`; ctx.textAlign='center';
                             ctx.fillText(r.name, 0, -size*0.8);
                        }
                        ctx.restore();
                    }
                });
            }

            // 5. JOGADOR (SPRITE DE ALTA FIDELIDADE)
            // Offset Y inclui o "bounce" da física e o "hop" do drift
            const playerY = h * 0.85 + d.bounce - d.hopY; 
            this.drawPlayerKart(ctx, cx, playerY, w * 0.0008, d);

            // 6. PARTÍCULAS (GLOBAL)
            particles.forEach((p, idx) => {
                p.x += p.vx;
                p.y += p.vy;
                p.life--;
                p.vy += 0.5; // Gravidade leve
                if(p.life <= 0) {
                    particles.splice(idx, 1);
                } else {
                    ctx.globalAlpha = p.life / p.maxLife;
                    ctx.fillStyle = p.color;
                    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1;
                }
            });
        },

        // HELPER: DESENHO DO KART "NINTENDO STYLE"
        drawPlayerKart: function(ctx, x, y, scale, d) {
            const size = 800 * scale; // Tamanho base
            ctx.save();
            ctx.translate(x, y);
            
            // Inclinação visual (Tilt) nas curvas
            let tilt = d.visualTilt * 0.03;
            if(d.driftState === 1) tilt += d.driftDir * 0.1; // Inclina mais no drift
            ctx.rotate(tilt);

            // Sombra
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.beginPath(); ctx.ellipse(0, size*0.4, size*0.6, size*0.15, 0, 0, Math.PI*2); ctx.fill();

            // Pneus Traseiros
            ctx.fillStyle = "#222";
            ctx.fillRect(-size*0.5, -size*0.1, size*0.2, size*0.4); // Esq
            ctx.fillRect(size*0.3, -size*0.1, size*0.2, size*0.4);  // Dir

            // Chassi Principal
            const grad = ctx.createLinearGradient(-size/2, 0, size/2, 0);
            grad.addColorStop(0, "#cc0000"); grad.addColorStop(0.5, "#ff3333"); grad.addColorStop(1, "#990000");
            ctx.fillStyle = grad;
            
            // Desenho do corpo (Trapézio arredondado)
            ctx.beginPath();
            ctx.moveTo(-size*0.3, -size*0.3);
            ctx.lineTo(size*0.3, -size*0.3);
            ctx.lineTo(size*0.4, size*0.2);
            ctx.lineTo(-size*0.4, size*0.2);
            ctx.fill();

            // Motor / Exhaust (Se turbo ativo)
            if(d.turboLock || d.boostTimer > 0) {
                const fireScale = 1 + Math.random()*0.5;
                ctx.fillStyle = (d.mtStage === 2 || d.turboLock) ? "#00ffff" : "#ffaa00";
                ctx.beginPath(); ctx.arc(-size*0.2, -size*0.3, size*0.15*fireScale, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(size*0.2, -size*0.3, size*0.15*fireScale, 0, Math.PI*2); ctx.fill();
            }

            // Cabeça do Piloto (Gira com o volante)
            ctx.save();
            ctx.translate(0, -size*0.4);
            ctx.rotate(d.steer * 0.5); // Gira cabeça
            ctx.fillStyle = "#ffcc99"; // Pele
            ctx.beginPath(); ctx.arc(0, 0, size*0.18, 0, Math.PI*2); ctx.fill();
            // Capacete
            ctx.fillStyle = "#ff0000";
            ctx.beginPath(); ctx.arc(0, -size*0.05, size*0.19, Math.PI, Math.PI*2); ctx.fill();
            ctx.restore();

            // Pneus Dianteiros (Giram com o volante)
            const wheelAngle = d.steer * 0.8;
            const drawFrontWheel = (offsetX) => {
                ctx.save();
                ctx.translate(offsetX, size*0.2);
                ctx.rotate(wheelAngle);
                ctx.fillStyle = "#222";
                ctx.fillRect(-size*0.08, -size*0.15, size*0.16, size*0.3);
                // Calota
                ctx.fillStyle = "#ccc";
                ctx.fillRect(-size*0.04, -size*0.05, size*0.08, size*0.1);
                ctx.restore();
            };
            drawFrontWheel(-size*0.4);
            drawFrontWheel(size*0.4);

            ctx.restore();
        },

        // -------------------------------------------------------------
        // UI & HUD (VISUAL CLEAN & TÁTICO)
        // -------------------------------------------------------------
        renderUI: function(ctx, w, h) {
            const d = Logic;

            if (d.state === 'race') {
                
                // --- 1. VELOCÍMETRO & POSIÇÃO ---
                const hudX = w - 90;
                const hudY = h - 90;

                // Fundo Circular
                ctx.fillStyle = "rgba(0,0,0,0.7)";
                ctx.beginPath(); ctx.arc(hudX, hudY, 70, 0, Math.PI*2); ctx.fill();
                
                // Arco de RPM
                const rpm = Math.min(1, d.speed / CONF.TURBO_MAX_SPEED);
                ctx.strokeStyle = d.turboLock ? "#00ffff" : (d.driftState? "#ff9900" : "#fff");
                ctx.lineWidth = 8;
                ctx.beginPath(); ctx.arc(hudX, hudY, 60, Math.PI, Math.PI + (rpm * Math.PI)); ctx.stroke();

                // Texto Velocidade
                ctx.fillStyle = "#fff"; ctx.textAlign = "center";
                ctx.font = "bold 40px 'Russo One', sans-serif";
                ctx.fillText(Math.floor(d.speed), hudX, hudY + 10);
                
                // Texto Rank (Grande)
                ctx.font = "bold 60px 'Russo One', sans-serif";
                ctx.fillStyle = d.rank === 1 ? "#ffff00" : (d.rank === 2 ? "#c0c0c0" : "#cc6600");
                ctx.strokeStyle = "#000"; ctx.lineWidth = 4;
                ctx.strokeText(d.rank, 50, 80);
                ctx.fillText(d.rank, 50, 80);
                ctx.font = "20px Arial"; ctx.fillStyle = "#fff"; ctx.fillText("POS", 50, 105);

                // Voltas
                ctx.fillStyle = "#fff"; ctx.font = "bold 20px Arial"; ctx.textAlign = "left";
                ctx.fillText(`VOLTA ${d.lap}/${CONF.TOTAL_LAPS}`, 20, h - 20);

                // --- 2. MINI MAPA CORRIGIDO & OTIMIZADO ---
                if (minimapPoints.length > 0) {
                    const mapSize = 130;
                    const mapX = 20;
                    const mapY = 130;
                    
                    // Fundo semi-transparente
                    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
                    ctx.fillRect(mapX, mapY, mapSize, mapSize);
                    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
                    ctx.strokeRect(mapX, mapY, mapSize, mapSize);

                    ctx.save();
                    // Clip area
                    ctx.beginPath(); ctx.rect(mapX, mapY, mapSize, mapSize); ctx.clip();
                    
                    // Auto-Centralização (Bounding Box)
                    // Calcula limites do mapa gerado
                    if (!this.mapBounds) {
                        let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
                        minimapPoints.forEach(p => {
                            if(p.x < minX) minX = p.x; if(p.x > maxX) maxX = p.x;
                            if(p.y < minY) minY = p.y; if(p.y > maxY) maxY = p.y;
                        });
                        this.mapBounds = { minX, maxX, minY, maxY, w: maxX-minX, h: maxY-minY };
                    }
                    
                    // Escala para caber
                    const mb = this.mapBounds;
                    const scale = (mapSize * 0.8) / Math.max(mb.w, mb.h);
                    
                    ctx.translate(mapX + mapSize/2, mapY + mapSize/2);
                    ctx.scale(scale, scale);
                    ctx.translate(-(mb.minX + mb.w/2), -(mb.minY + mb.h/2)); // Centraliza
                    
                    // Desenha Pista
                    ctx.strokeStyle = "#888"; ctx.lineWidth = 40; ctx.lineCap = 'round';
                    ctx.beginPath();
                    minimapPoints.forEach((p, i) => { if(i===0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
                    ctx.stroke();
                    ctx.strokeStyle = "#ccc"; ctx.lineWidth = 15; // Linha interna
                    ctx.stroke();

                    // Desenha Jogador (Ponto Neon)
                    // Mapeia pos (0 a trackLength) para índice do array de pontos
                    let pIdx = Math.floor((d.pos / trackLength) * minimapPoints.length);
                    pIdx = Math.max(0, Math.min(pIdx, minimapPoints.length-1));
                    const pPoint = minimapPoints[pIdx];
                    
                    ctx.fillStyle = "#00ffff";
                    ctx.beginPath(); ctx.arc(pPoint.x, pPoint.y, 40, 0, Math.PI*2); ctx.fill();

                    // Desenha Rivais
                    d.rivals.forEach(r => {
                        let rIdx = Math.floor((r.pos / trackLength) * minimapPoints.length);
                        rIdx = Math.max(0, Math.min(rIdx, minimapPoints.length-1));
                        const rPoint = minimapPoints[rIdx];
                        ctx.fillStyle = r.color;
                        ctx.beginPath(); ctx.arc(rPoint.x, rPoint.y, 30, 0, Math.PI*2); ctx.fill();
                    });

                    ctx.restore();
                }

                // --- 3. VOLANTE VIRTUAL ---
                if (d.virtualWheel.opacity > 0.1) {
                    const vw = d.virtualWheel;
                    ctx.save();
                    ctx.globalAlpha = vw.opacity;
                    ctx.translate(vw.x, vw.y);
                    
                    // Aro
                    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 6;
                    ctx.beginPath(); ctx.arc(0, 0, vw.r, 0, Math.PI*2); ctx.stroke();
                    
                    // Indicador de Giro
                    ctx.rotate(d.steer * 1.5);
                    ctx.fillStyle = "#ffcc00";
                    ctx.fillRect(-5, -vw.r, 10, 20); // Marcador topo
                    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill(); // Centro

                    ctx.restore();
                    ctx.globalAlpha = 1;
                }

            } else if (d.state === 'finished') {
                // TELA FINAL
                ctx.fillStyle = "rgba(0,0,0,0.8)";
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = "#fff"; ctx.textAlign = "center";
                ctx.font = "bold 60px 'Russo One'";
                ctx.fillText(d.rank === 1 ? "VITÓRIA!" : "FIM DE JOGO", w/2, h/2 - 20);
                
                ctx.font = "30px Arial";
                ctx.fillText(`Posição: ${d.rank}º Lugar`, w/2, h/2 + 40);
                ctx.fillText(`Pontos: ${Math.floor(d.speed * 10)}`, w/2, h/2 + 80);
            }
        }
    };

    // Registro no Sistema
    if(window.System) {
        window.System.registerGame('drive', 'Otto Kart GP', '🏎️', Logic, {
            camOpacity: 0.4, 
            showWheel: false
        });
    }

})();