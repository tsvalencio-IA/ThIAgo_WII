// =====================================================
// OTTO SUPER RUN KART – COMMERCIAL GOLD MASTER
// VERSÃO: 2.0 (ENHANCED PHYSICS & HUD)
// ENGINEER: CODE 177
// =====================================================

(function() {

    // =================================================================
    // 0. CONSTANTES & CONFIGURAÇÃO (TUNING COMERCIAL)
    // =================================================================
    const CONF = {
        // --- Física de Motor ---
        MAX_SPEED: 240,          // Velocidade terminal padrão
        TURBO_MAX_SPEED: 460,    // Velocidade durante Nitro
        ACCEL: 1.8,              // Curva de aceleração mais agressiva
        FRICTION: 0.98,          // Resistência do ar/solo
        BRAKING: 0.95,           // Força de frenagem
        OFFROAD_DECEL: 0.92,     // Penalidade fora da pista
        
        // --- Física de Direção & Drift ---
        CENTRIFUGAL_FORCE: 0.35, // Força que joga o carro para fora na curva
        STEER_AUTHORITY: 0.15,   // Resposta do volante
        DRIFT_GRIP: 0.96,        // Perda leve de tração no drift
        DRIFT_BONUS_TURN: 1.4,   // Capacidade de curvar mais fechado no drift
        MINI_TURBO_1: 45,        // Frames para carga nível 1 (Azul)
        MINI_TURBO_2: 100,       // Frames para carga nível 2 (Laranja)

        // --- Gameplay ---
        HITBOX_WIDTH: 0.5,       // Largura para colisão
        CRASH_PENALTY: 0.4,      // Multiplicador de velocidade após batida
        TOTAL_LAPS: 3,           // Total de voltas

        // --- Visual ---
        DRAW_DISTANCE: 70,       // Distância de renderização (segmentos)
        FOV: 100,
        PARTICLE_LIMIT: 100      // Limite para manter 60 FPS
    };

    // Variáveis Globais de Escopo Seguro
    let nitroBtn = null;
    let particles = [];
    let keys = {}; // Estado do teclado
    
    // Cache de Pista e Mapa
    const SEGMENT_LENGTH = 200;
    const RUMBLE_LENGTH = 3;
    let segments = [];
    let trackLength = 0;
    let minimapPoints = [];
    let trackCurvatureSum = 0; // Para rotação do mapa

    // =================================================================
    // 1. SISTEMAS AUXILIARES (PARTÍCULAS & INPUT)
    // =================================================================

    // Listener de Teclado (Fallback se não houver Pose)
    window.addEventListener('keydown', e => keys[e.code] = true);
    window.addEventListener('keyup', e => keys[e.code] = false);

    // Sistema de Partículas Otimizado
    function spawnParticle(x, y, type, color) {
        if (particles.length > CONF.PARTICLE_LIMIT) particles.shift(); // Remove antigas
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10 - 2,
            life: 1.0,
            decay: 0.03 + Math.random() * 0.02,
            type: type, // 'smoke', 'fire', 'spark'
            color: color
        });
    }

    // Gerador de Mini-Mapa (Pré-cálculo)
    function buildMiniMap(segments) {
        minimapPoints = [];
        let x = 0, y = 0, dir = 0;
        
        // Passo de precisão para o mapa ficar suave
        segments.forEach(seg => {
            dir += seg.curve * 0.0025; // Escala de curvatura
            x += Math.sin(dir) * 2;
            y += Math.cos(dir) * 2;
            minimapPoints.push({ x, y, dir }); // Salva direção para rotação
        });
    }

    // =================================================================
    // 2. LÓGICA DO JOGO (STATE CONTAINER)
    // =================================================================
    const Logic = {
        // --- Estado Físico ---
        speed: 0,
        pos: 0,
        playerX: 0,
        steer: 0,
        targetSteer: 0,
        
        // --- Estado de Gameplay ---
        state: 'race', // 'race', 'finished'
        lap: 1,
        totalLaps: CONF.TOTAL_LAPS,
        rank: 1,
        time: 0,
        score: 0,
        finishTimer: 0,

        // --- Mecânicas Especiais ---
        nitro: 100,
        turboLock: false,
        boostTimer: 0,
        
        // Drift State
        driftState: 0, // 0=Normal, 1=Drifting
        driftDir: 0,   // -1 Esquerda, 1 Direita
        driftCharge: 0,
        mtStage: 0,    // 0=Nenhum, 1=Azul, 2=Laranja

        // --- Visual FX ---
        bounce: 0,
        visualTilt: 0,
        skyColor: 0,
        shake: 0,
        lapPopupTimer: 0,
        lapPopupText: "",

        // --- Input ---
        inputState: 0, // 0=None, 1=Key/Mouse, 2=Pose
        virtualWheel: { x:0, y:0, r:0, opacity:0 },
        gestureTimer: 0,

        // --- IA ---
        rivals: [],

        // -------------------------------------------------------------
        // CONSTRUÇÃO DA PISTA (PRESERVED ASSETS)
        // -------------------------------------------------------------
        buildTrack: function() {
            segments = [];
            const addRoad = (enter, curve, y) => {
                const startIdx = segments.length;
                for(let i = 0; i < enter; i++) {
                    const isDark = Math.floor(segments.length / RUMBLE_LENGTH) % 2;
                    segments.push({
                        curve: curve, y: y,
                        color: isDark ? 'dark' : 'light',
                        obs: []
                    });
                }
                return startIdx;
            };

            const addProp = (index, type, offset) => {
                if (segments[index]) segments[index].obs.push({ type: type, x: offset });
            };

            // --- Layout "Otto Circuit" ---
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

            trackLength = segments.length * SEGMENT_LENGTH;
            buildMiniMap(segments); // Gera o mapa vetorial
        },

        // -------------------------------------------------------------
        // SETUP UI (BOTÕES E INTERFACE)
        // -------------------------------------------------------------
        setupUI: function() {
            const oldBtn = document.getElementById('nitro-btn-kart');
            if(oldBtn) oldBtn.remove();

            nitroBtn = document.createElement('div');
            nitroBtn.id = 'nitro-btn-kart';
            nitroBtn.innerHTML = "NITRO";
            // Estilo Comercial "Juicy"
            Object.assign(nitroBtn.style, {
                position: 'absolute', top: '30%', right: '20px', width: '90px', height: '90px',
                borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, #ffcc00, #ff4500)', 
                border: '4px solid white', color: '#fff', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Russo One', sans-serif", fontSize: '18px', zIndex: '100',
                boxShadow: '0 5px 15px rgba(0,0,0,0.4), inset 0 0 10px rgba(255,255,0,0.5)', 
                cursor: 'pointer', transform: 'scale(1)', transition: 'all 0.1s ease',
                userSelect: 'none', touchAction: 'manipulation'
            });

            const activateNitro = (e) => {
                if(e) { e.preventDefault(); e.stopPropagation(); }
                if(this.nitro > 5) {
                    this.turboLock = !this.turboLock;
                    // Feedback visual tátil
                    nitroBtn.style.transform = this.turboLock ? 'scale(0.9) translateY(5px)' : 'scale(1)';
                    nitroBtn.style.boxShadow = this.turboLock ? '0 0 25px #00ffff' : '0 5px 15px rgba(0,0,0,0.4)';
                    if(this.turboLock) {
                        window.Sfx.play(600, 'square', 0.2, 0.1);
                        this.shake = 10;
                    }
                }
            };

            nitroBtn.addEventListener('touchstart', activateNitro, {passive:false});
            nitroBtn.addEventListener('mousedown', activateNitro);
            
            // Container seguro
            const container = document.getElementById('game-ui') || document.body;
            container.appendChild(nitroBtn);
        },

        // -------------------------------------------------------------
        // INICIALIZAÇÃO
        // -------------------------------------------------------------
        init: function() { 
            this.buildTrack();
            this.setupUI();
            
            // Reset de Estado
            this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0;
            this.state = 'race'; this.lap = 1; this.score = 0; this.time = 0;
            this.nitro = 100; this.driftState = 0; this.driftCharge = 0;
            
            // Rivais com IA Aprimorada (Rubber-banding Parameters)
            // Aggro: Quão rápido tentam alcançar. Mistake: Chance de sair da linha ideal.
            this.rivals = [
                { pos: 1000, x: -0.4, speed: 0, color: '#2ecc71', name: 'Luigi', aggro: 0.035, mistakeProb: 0.008, offset: 0 },
                { pos: 800,  x: 0.4,  speed: 0, color: '#3498db', name: 'Toad',  aggro: 0.028, mistakeProb: 0.005, offset: 0 },
                { pos: 1200, x: 0,    speed: 0, color: '#e74c3c', name: 'Mario', aggro: 0.040, mistakeProb: 0.012, offset: 0 },
                { pos: 600,  x: -0.2, speed: 0, color: '#f1c40f', name: 'Wario', aggro: 0.045, mistakeProb: 0.020, offset: 0 }
            ];

            window.System.msg("LARGADA!"); 
        },

        // =============================================================
        // GAME LOOP (UPDATE & PHYSICS)
        // =============================================================
        update: function(ctx, w, h, pose) {
            
            // 1. Atualiza Física do Mundo e Jogador
            this.updatePhysics(w, h, pose);
            
            // 2. Renderiza Cenário (Pseudo-3D)
            this.renderWorld(ctx, w, h);
            
            // 3. Renderiza UI (HUD, Mapa, Partículas UI)
            this.renderUI(ctx, w, h);

            return Math.floor(this.score);
        },

        // -------------------------------------------------------------
        // MOTOR DE FÍSICA BLINDADO
        // -------------------------------------------------------------
        updatePhysics: function(w, h, pose) {
            const d = this; // Alias curto

            // --- A. INPUT SYSTEM (HÍBRIDO) ---
            let inputDetected = false;
            let poseSteer = 0;

            // 1. Detecção de Pose (Prioridade)
            if (pose && pose.keypoints) {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                
                if (lw && rw && lw.score > 0.4 && rw.score > 0.4) {
                    inputDetected = true;
                    d.inputState = 2; // Modo Pose
                    const pLeft = window.Gfx.map(lw, w, h);
                    const pRight = window.Gfx.map(rw, w, h);
                    
                    // Cálculo do ângulo
                    const dx = pRight.x - pLeft.x;
                    const dy = pRight.y - pLeft.y;
                    const rawAngle = Math.atan2(dy, dx);
                    
                    // Deadzone e Amplificação
                    if (Math.abs(rawAngle) > 0.05) {
                        poseSteer = rawAngle * 2.5;
                    }
                    
                    // Visual Wheel
                    d.virtualWheel.x = (pLeft.x + pRight.x) / 2;
                    d.virtualWheel.y = (pLeft.y + pRight.y) / 2;
                    d.virtualWheel.r = Math.hypot(dx, dy) / 2;
                    d.virtualWheel.opacity = 1;

                    // Gesto de Nitro (Mãos altas)
                    if (d.virtualWheel.y < h * 0.35) {
                        d.gestureTimer++;
                        if (d.gestureTimer > 15 && d.nitro > 10 && !d.turboLock) {
                            d.turboLock = true;
                            window.System.msg("TURBO GESTO!");
                            window.Sfx.play(600, 'square', 0.2, 0.2);
                        }
                    } else {
                        d.gestureTimer = 0;
                    }
                }
            }

            // 2. Fallback Teclado (Se não houver pose)
            if (!inputDetected) {
                d.inputState = 1; // Modo Teclado
                d.virtualWheel.opacity *= 0.9; // Fade out wheel
                if (keys['ArrowLeft'] || keys['KeyA']) poseSteer = -1;
                else if (keys['ArrowRight'] || keys['KeyD']) poseSteer = 1;
                else poseSteer = 0;

                // Nitro via Espaço
                if (keys['Space'] && d.nitro > 5) d.turboLock = true;
                else if (!nitroBtn.matches(':active')) d.turboLock = false; // Só solta se botão ui tbm não estiver pressionado
            }

            // Suavização do Input (Lerp)
            d.targetSteer = poseSteer;
            d.steer += (d.targetSteer - d.steer) * CONF.STEER_AUTHORITY;

            // --- B. MOTOR E VELOCIDADE ---
            let targetSpeed = 0;
            let speedCap = d.turboLock ? CONF.TURBO_MAX_SPEED : CONF.MAX_SPEED;
            let accel = CONF.ACCEL;

            // Boost Temporário (Mini-Turbo ou Pad)
            if (d.boostTimer > 0) {
                speedCap += 100;
                accel *= 2;
                d.boostTimer--;
                // Rastro de fogo
                if(d.time % 2 === 0) spawnParticle(w/2, h*0.8, 'fire', '#00ffff');
            }

            // Consumo de Nitro
            if (d.turboLock && d.nitro > 0) {
                d.nitro -= 0.8;
                spawnParticle(w/2 + (Math.random()*20-10), h*0.85, 'fire', '#ffaa00');
                if (d.nitro <= 0) d.turboLock = false;
            } else {
                d.nitro = Math.min(100, d.nitro + 0.1); // Recarga lenta
            }

            // Aceleração Automática (Auto-Gas em jogos Mobile/Arcade) ou Tecla Cima
            const isGasPressed = keys['ArrowUp'] || keys['KeyW'] || d.inputState === 2 || d.turboLock; 
            
            if (isGasPressed && d.state === 'race') {
                d.speed += (speedCap - d.speed) * (accel / 100);
            } else {
                d.speed *= CONF.FRICTION; // Atrito natural
                if (keys['ArrowDown'] || keys['KeyS']) d.speed *= CONF.BRAKING; // Freio
            }

            // Penalidade Offroad
            const isOffRoad = Math.abs(d.playerX) > 2.3;
            if (isOffRoad) {
                d.speed *= CONF.OFFROAD_DECEL;
                d.shake = 3; // Tremedeira
                if(d.speed > 50 && d.time % 3 === 0) 
                    spawnParticle(w/2 + (Math.random()*50-25), h*0.9, 'smoke', '#5c4033'); // Terra
            }

            // --- C. CURVAS E DRIFT (Física Avançada) ---
            const segIdx = Math.floor(d.pos / SEGMENT_LENGTH) % segments.length;
            const currentSeg = segments[segIdx];
            const speedRatio = (d.speed / CONF.MAX_SPEED);

            // 1. Drift Logic
            // Entrar no drift: Curva forte + Pulo
            if (d.driftState === 0 && Math.abs(d.steer) > 0.8 && speedRatio > 0.5 && keys['ShiftLeft']) {
                 // Nota: Shift é opcional, mas no mobile é automático por curva forte
                 d.driftState = 1;
                 d.driftDir = Math.sign(d.steer);
                 d.bounce = -12; // Hop!
                 window.Sfx.skid();
            }
            // Mobile Auto-Drift logic: Se segurar curva forte por muito tempo
            if (d.driftState === 0 && Math.abs(d.steer) > 0.95 && speedRatio > 0.6) {
                d.driftState = 1;
                d.driftDir = Math.sign(d.steer);
                d.bounce = -10;
            }

            // Processar Drift
            if (d.driftState === 1) {
                // Sair do Drift
                if (Math.abs(d.steer) < 0.1 || d.speed < 50) {
                    // Libera Mini-Turbo
                    if (d.mtStage > 0) {
                        d.boostTimer = d.mtStage * 40; // 40 ou 80 frames
                        window.System.msg(d.mtStage === 2 ? "SUPER TURBO!" : "TURBO!");
                        window.Sfx.play(800, 'square', 0.2, 0.2);
                        d.shake = 10;
                    }
                    d.driftState = 0;
                    d.driftCharge = 0;
                    d.mtStage = 0;
                } else {
                    // Carregar Mini-Turbo
                    d.driftCharge++;
                    if (d.driftCharge > CONF.MINI_TURBO_2) d.mtStage = 2;
                    else if (d.driftCharge > CONF.MINI_TURBO_1) d.mtStage = 1;
                    
                    // Partículas de Drift
                    const pColor = d.mtStage === 2 ? '#ffaa00' : (d.mtStage === 1 ? '#00ffff' : '#cccccc');
                    if (d.time % 4 === 0) {
                        spawnParticle(w/2 - 30 * d.driftDir, h*0.85, 'spark', pColor);
                        spawnParticle(w/2 + 30 * d.driftDir, h*0.85, 'spark', pColor);
                    }
                }
            }

            // 2. Cálculo de Posição X (Inércia + Direção)
            const dx = d.steer * d.speed * 0.0003; // Força do volante
            
            // Centrífuga: Puxa o carro para fora da curva baseado na velocidade
            // Se estiver em drift, puxa menos (controle maior)
            const centrifugal = currentSeg.curve * (speedRatio * speedRatio) * CONF.CENTRIFUGAL_FORCE;
            
            // Drift compensa a curva permitindo ângulo mais fechado
            const driftBonus = (d.driftState === 1 && Math.sign(d.steer) === Math.sign(currentSeg.curve)) 
                             ? CONF.DRIFT_BONUS_TURN : 1.0;

            d.playerX -= (dx * driftBonus) - centrifugal;

            // Limites da pista (Clamp)
            if (d.playerX < -3.5) d.playerX = -3.5;
            if (d.playerX > 3.5) d.playerX = 3.5;

            // --- D. COLISÕES & OBSTÁCULOS ---
            // Lookahead simples (segmento atual)
            currentSeg.obs.forEach(o => {
                const spriteW = CONF.HITBOX_WIDTH;
                // Se colidir
                if (Math.abs(d.playerX - o.x) < spriteW) {
                    if (o.type === 'cone' || o.type === 'sign') {
                        // Batida
                        d.speed *= CONF.CRASH_PENALTY;
                        d.shake = 20;
                        d.bounce = -10;
                        window.Sfx.crash();
                        window.System.msg("CRASH!");
                        // Efeito visual: arremessa o cone (virtualmente) removendo-o
                        o.x = 100; // Move para fora da tela
                        // Partículas de batida
                        for(let i=0; i<5; i++) spawnParticle(w/2, h*0.8, 'smoke', '#aaaaaa');
                    }
                }
            });

            // --- E. PROGRESSO & IA ---
            d.pos += d.speed;
            
            // Volta Completa
            while (d.pos >= trackLength) {
                d.pos -= trackLength;
                d.lap++;
                if (d.lap <= d.totalLaps) {
                    d.lapPopupText = `VOLTA ${d.lap}/${d.totalLaps}`;
                    d.lapPopupTimer = 120;
                    window.Sfx.play(400, 'sine', 0.1, 0.1);
                }
                if (d.lap > d.totalLaps && d.state === 'race') {
                    d.state = 'finished';
                    window.System.msg(d.rank === 1 ? "CAMPEÃO!" : "TERMINADO!");
                    setTimeout(() => window.System.gameOver(Math.floor(d.score)), 3000);
                }
            }
            while (d.pos < 0) d.pos += trackLength;

            // IA dos Rivais (Rubber-Banding)
            let playersAhead = 0;
            const playerTotalDist = d.pos + (d.lap * trackLength);

            d.rivals.forEach(r => {
                // Distância relativa para o jogador
                const rivalTotalDist = r.pos + ((d.lap - (r.pos > d.pos + trackLength/2 ? 1 : 0)) * trackLength); // Simplificado
                
                let distDelta = rivalTotalDist - playerTotalDist;
                // Correção de loop circular para cálculo de velocidade
                if (distDelta > trackLength/2) distDelta -= trackLength;
                if (distDelta < -trackLength/2) distDelta += trackLength;

                // Velocidade base do rival
                let targetRivalSpeed = CONF.MAX_SPEED * 0.95;

                // Rubber Banding: Se o jogador está longe na frente, rival acelera. Se jogador está atrás, rival espera.
                if (distDelta < -500) targetRivalSpeed *= 1.35; // Catch-up forte
                else if (distDelta > 500) targetRivalSpeed *= 0.85; // Espera
                
                // IA de Curva
                const rSeg = segments[Math.floor(r.pos/SEGMENT_LENGTH) % segments.length];
                // Eles tentam seguir a linha oposta à curva (racing line)
                let idealX = -rSeg.curve * 0.5; 
                // Erro humano aleatório
                if (Math.random() < r.mistakeProb) idealX = (Math.random() * 4) - 2;

                r.x += (idealX - r.x) * 0.05;
                r.speed += (targetRivalSpeed - r.speed) * r.aggro;
                r.pos += r.speed;

                // Wrap around da posição do rival
                if (r.pos >= trackLength) r.pos -= trackLength;
                if (r.pos < 0) r.pos += trackLength;

                // Contagem de Rank (Baseada na distância absoluta estimada)
                // Lógica simplificada de rank local
                if (distDelta > 0) playersAhead++;
            });

            d.rank = 1 + playersAhead;

            // Timers & Score
            d.time++;
            d.score += d.speed * 0.01;
            
            // Decaimento de efeitos visuais
            d.bounce *= 0.8;
            d.shake *= 0.8;
            d.visualTilt += (d.steer * 20 - d.visualTilt) * 0.1;
        },

        // -------------------------------------------------------------
        // RENDER: CENÁRIO (PSEUDO-3D PRESERVED & OPTIMIZED)
        // -------------------------------------------------------------
        renderWorld: function(ctx, w, h) {
            const d = this;
            const cx = w / 2;
            // Shake Effect no Horizonte
            const horizon = (h * 0.40) + (Math.random() * d.shake - d.shake/2);

            // 1. Céu (Parallax)
            const currentSegIndex = Math.floor(d.pos / SEGMENT_LENGTH) % segments.length;
            const currentSeg = segments[currentSegIndex];
            
            // Gradiente dinâmico (Dia/Tarde simulado pelo skyColor)
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, "#1e90ff"); grad.addColorStop(0.4, "#87cefa");
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,horizon);

            // Montanhas Parallax
            ctx.fillStyle = "#2c3e50";
            ctx.beginPath();
            const bgOffset = (currentSeg.curve * 50) + (d.steer * 30);
            ctx.moveTo(0, horizon);
            for(let x=0; x<=w; x+=w/10) {
                const hM = Math.sin(x*0.01 + d.pos*0.0001 - bgOffset*0.01) * 30;
                ctx.lineTo(x, horizon - 50 + hM);
            }
            ctx.lineTo(w, horizon); ctx.fill();

            // Chão
            ctx.fillStyle = Math.abs(d.playerX) > 2.3 ? "#5d4037" : "#4caf50";
            ctx.fillRect(0, horizon, w, h-horizon);

            // 2. Estrada (Projection Loop)
            let dx = 0;
            let camX = d.playerX * (w * 0.5); // Camera tracking
            let segmentCoords = [];
            
            // Otimização: Renderizar apenas o necessário
            const drawDist = CONF.DRAW_DISTANCE;

            for(let n = 0; n < drawDist; n++) {
                const segIdx = (currentSegIndex + n) % segments.length;
                const seg = segments[segIdx];
                
                // Acumula curvatura
                dx += seg.curve; 
                
                const z = n * SEGMENT_LENGTH;
                // Perspective projection factor
                const scale = 1 / (1 + (z * 0.01)); 
                const scaleNext = 1 / (1 + ((z + SEGMENT_LENGTH) * 0.01));
                
                // Screen coordinates
                const bottomY = horizon + ((h - horizon) * scale);
                const topY = horizon + ((h - horizon) * scaleNext);
                
                // X position with curve offset
                const bottomX = cx - (camX * scale) - (dx * z * scale * 0.002);
                const topX = cx - (camX * scaleNext) - ((dx + seg.curve) * (z + SEGMENT_LENGTH) * scaleNext * 0.002);
                
                const width = (w * 4) * scale;
                const widthNext = (w * 4) * scaleNext;

                segmentCoords.push({ 
                    x: bottomX, y: bottomY, scale: scale, index: segIdx, z: z, 
                    topY: topY, topX: topX, width: width, widthNext: widthNext 
                });

                // Desenha o segmento (Painter's Algo: back to front logic not needed here for road, but strictly ordered)
                // Na verdade, desenhamos de trás para frente no loop de sprites, mas a estrada pode ser desenhada aqui se cortarmos o z-buffer
                // Mas para seguir o padrão clássico "Outrun", desenhamos a estrada aqui e sprites depois de trás pra frente.
                
                const colorGrass = (seg.color === 'dark') ? '#4caf50' : '#66bb6a';
                const colorRumble = (seg.color === 'dark') ? '#c0392b' : '#ecf0f1';
                const colorRoad = (seg.color === 'dark') ? '#555' : '#666';

                // Grama Lateral
                ctx.fillStyle = colorGrass;
                ctx.fillRect(0, topY, w, bottomY - topY); // Preenche linha inteira (otimização)

                // Rumble Strip
                ctx.fillStyle = colorRumble;
                ctx.beginPath();
                ctx.moveTo(bottomX - width/2 - width*0.05, bottomY);
                ctx.lineTo(bottomX + width/2 + width*0.05, bottomY);
                ctx.lineTo(topX + widthNext/2 + widthNext*0.05, topY);
                ctx.lineTo(topX - widthNext/2 - widthNext*0.05, topY);
                ctx.fill();

                // Pista
                ctx.fillStyle = colorRoad;
                ctx.beginPath();
                ctx.moveTo(bottomX - width/2, bottomY);
                ctx.lineTo(bottomX + width/2, bottomY);
                ctx.lineTo(topX + widthNext/2, topY);
                ctx.lineTo(topX - widthNext/2, topY);
                ctx.fill();
            }

            // 3. Renderizar Sprites (In Reverse Order for Z-Sorting)
            for (let n = drawDist - 1; n >= 0; n--) {
                const coord = segmentCoords[n];
                const seg = segments[coord.index];

                // Rivais
                d.rivals.forEach(r => {
                    // Check se rival está neste segmento
                    let rRelPos = r.pos - d.pos;
                    if (rRelPos < -trackLength/2) rRelPos += trackLength;
                    if (rRelPos > trackLength/2) rRelPos -= trackLength;
                    
                    const segDist = Math.floor(rRelPos / SEGMENT_LENGTH);
                    
                    if (segDist === n) {
                        const rScale = coord.scale;
                        // Interpolate lateral X relative to road center
                        const rScreenX = coord.x + (r.x * coord.width / 2);
                        const rScreenY = coord.y;
                        
                        // Desenha Rival (Simple Kart Sprite)
                        const size = w * 0.006 * (1/rScale); // Scale correction inverted? No, scale is 0..1
                        const kartSize = 1000 * rScale; // Empirical

                        ctx.save();
                        ctx.translate(rScreenX, rScreenY);
                        ctx.scale(rScale * 8, rScale * 8); // Scale multiplier
                        
                        // Sombra
                        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.ellipse(0, 5, 20, 5, 0, 0, Math.PI*2); ctx.fill();
                        // Corpo
                        ctx.fillStyle = r.color; ctx.fillRect(-10, -15, 20, 15);
                        // Cabeça
                        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, -18, 8, 0, Math.PI*2); ctx.fill();
                        // Nome
                        if(n < 20) { // Só mostra nome se perto
                            ctx.fillStyle = "#fff"; ctx.font = "10px Arial"; ctx.fillText(r.name, -10, -30);
                        }
                        ctx.restore();
                    }
                });

                // Obstáculos
                seg.obs.forEach(o => {
                    if (o.x > 50) return; // Se foi "jogado longe"
                    const scale = coord.scale;
                    const spriteX = coord.x + (o.x * coord.width / 2);
                    const spriteY = coord.y;
                    
                    ctx.save();
                    ctx.translate(spriteX, spriteY);
                    ctx.scale(scale * 10, scale * 10);
                    
                    if(o.type === 'cone') {
                        ctx.fillStyle = '#ff5722';
                        ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(0, -15); ctx.fill();
                    } else if (o.type === 'sign') {
                        ctx.fillStyle = '#f1c40f'; ctx.fillRect(-8, -20, 16, 20);
                        ctx.fillStyle = '#000'; ctx.fillText(seg.curve > 0 ? ">" : "<", -3, -5);
                    }
                    ctx.restore();
                });
            }

            // 4. Renderizar Jogador (Local)
            // Desenhado por último para ficar na frente
            const playerScale = w * 0.006; // Ajuste de escala responsivo
            // Bounce do motor + colisão
            const pY = h * 0.85 + d.bounce + (Math.random() * (d.speed/CONF.MAX_SPEED) * 2); 
            
            this.drawPlayer(ctx, cx, pY, playerScale, d);
            
            // 5. Renderizar Partículas (Overlay Global)
            particles.forEach((p, i) => {
                p.x += p.vx; 
                p.y += p.vy; 
                p.life -= p.decay;
                
                if (p.life <= 0) {
                    particles.splice(i, 1);
                } else {
                    ctx.globalAlpha = p.life;
                    ctx.fillStyle = p.color;
                    const size = (p.type === 'smoke' ? 10 : 5) * (p.y / h); // Perspective fake
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size, 0, Math.PI*2);
                    ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            });
        },

        // Helper: Desenha o Kart do Jogador (High Quality)
        drawPlayer: function(ctx, x, y, s, d) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(s, s);
            
            // Inclinação nas curvas
            let angle = d.visualTilt * 0.03;
            if(d.driftState === 1) angle += d.driftDir * 0.2; // Drift Angle
            ctx.rotate(angle);

            // Sombra Dinâmica
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.beginPath(); ctx.ellipse(0, 30, 50 - Math.abs(d.bounce), 10, 0, 0, Math.PI*2); ctx.fill();

            // Kart Body (Gradiente Metálico)
            const g = ctx.createLinearGradient(-30, 0, 30, 0);
            g.addColorStop(0, '#b71c1c'); g.addColorStop(0.5, '#f44336'); g.addColorStop(1, '#b71c1c');
            ctx.fillStyle = g;
            
            // Chassi Esportivo
            ctx.beginPath();
            ctx.moveTo(-25, -20); ctx.lineTo(25, -20); // Traseira
            ctx.lineTo(35, 10); ctx.lineTo(15, 40); // Bico Dir
            ctx.lineTo(-15, 40); ctx.lineTo(-35, 10); // Bico Esq
            ctx.fill();

            // Escapamento / Turbo
            if (d.turboLock || d.boostTimer > 0) {
                const color = (d.mtStage === 2) ? '#ff9800' : '#00bcd4';
                const size = (Math.random() * 10) + 10;
                ctx.fillStyle = color;
                ctx.beginPath(); ctx.arc(-20, -20, size, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(20, -20, size, 0, Math.PI*2); ctx.fill();
            }

            // Rodas (Giram visualmente com a velocidade)
            ctx.fillStyle = "#212121";
            const wheelY = 15;
            // Efeito de rotação simples (cor muda)
            if((d.time % 4) < 2) ctx.fillStyle = "#424242"; 
            ctx.fillRect(-45, wheelY, 15, 25);
            ctx.fillRect(30, wheelY, 15, 25);
            // Rodas Traseiras
            ctx.fillRect(-48, -25, 18, 25);
            ctx.fillRect(30, -25, 18, 25);

            // Piloto (Capacete e Corpo)
            ctx.fillStyle = "#333"; // Macacão
            ctx.fillRect(-15, -25, 30, 15);
            
            ctx.fillStyle = "#eceff1"; // Capacete
            ctx.beginPath(); ctx.arc(0, -30, 16, 0, Math.PI*2); ctx.fill();
            
            // Visor do Capacete
            ctx.fillStyle = "#37474f";
            ctx.beginPath(); ctx.ellipse(0, -30, 12, 6, 0, 0, Math.PI*2); ctx.fill();

            // Placa
            ctx.fillStyle = "white"; ctx.font = "bold 12px Arial"; ctx.textAlign="center";
            ctx.fillText("OTTO", 0, 20);

            ctx.restore();
        },

        // -------------------------------------------------------------
        // RENDER: HUD & UI (COMERCIAL GRADE)
        // -------------------------------------------------------------
        renderUI: function(ctx, w, h) {
            const d = this;

            if (d.state === 'race') {
                // --- 1. POPUP DE MENSAGEM ---
                if (d.lapPopupTimer > 0) {
                    ctx.save();
                    ctx.shadowColor = "black"; ctx.shadowBlur = 10;
                    ctx.globalAlpha = Math.min(1, d.lapPopupTimer / 20);
                    // Escala pulsante
                    const s = 1 + Math.sin(d.time * 0.2) * 0.1;
                    ctx.translate(w/2, h*0.3); ctx.scale(s, s);
                    
                    ctx.fillStyle = "#ffeb3b";
                    ctx.font = "italic 900 48px 'Arial Black', Gadget, sans-serif";
                    ctx.textAlign = 'center';
                    ctx.fillText(d.lapPopupText, 0, 0);
                    ctx.lineWidth = 2; ctx.strokeStyle = "black"; ctx.strokeText(d.lapPopupText, 0, 0);
                    ctx.restore();
                    d.lapPopupTimer--;
                }

                // --- 2. VELOCÍMETRO RADIAL ---
                const hudX = w - 80;
                const hudY = h - 80;
                
                // Fundo
                ctx.beginPath(); ctx.arc(hudX, hudY, 60, 0, Math.PI*2);
                ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fill();
                ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.stroke();

                // Arco de RPM
                const speedPct = d.speed / CONF.TURBO_MAX_SPEED;
                ctx.beginPath();
                ctx.arc(hudX, hudY, 50, Math.PI * 0.8, (Math.PI * 0.8) + (Math.PI * 1.4 * speedPct));
                ctx.strokeStyle = d.turboLock ? "#00e5ff" : (speedPct > 0.8 ? "#ff1744" : "#76ff03");
                ctx.lineWidth = 8; ctx.lineCap = "round"; ctx.stroke();

                // Texto KM/H
                ctx.fillStyle = "#fff"; ctx.textAlign = "center";
                ctx.font = "bold 32px sans-serif";
                ctx.fillText(Math.floor(d.speed), hudX, hudY + 10);
                ctx.font = "12px sans-serif"; ctx.fillText("KM/H", hudX, hudY + 25);

                // --- 3. RANK & VOLTA ---
                ctx.fillStyle = "rgba(0,0,0,0.6)";
                ctx.beginPath(); ctx.roundRect(20, h - 70, 160, 50, 10); ctx.fill();
                
                // Posição Gigante
                ctx.fillStyle = d.rank === 1 ? "#ffd700" : "#fff";
                ctx.font = "italic 900 40px sans-serif";
                ctx.textAlign = "left";
                ctx.fillText(`${d.rank}º`, 35, h - 32);
                
                // Volta Pequena
                ctx.fillStyle = "#ccc";
                ctx.font = "bold 16px sans-serif";
                ctx.fillText(`/ ${d.rivals.length + 1}`, 90, h - 32);
                ctx.fillText(`L ${d.lap}/${d.totalLaps}`, 90, h - 50);

                // --- 4. BARRA DE NITRO ---
                const barW = 300;
                const barH = 20;
                const barX = w/2 - barW/2;
                const barY = 30;

                // Moldura
                ctx.fillStyle = "rgba(0,0,0,0.8)";
                ctx.transform(1, 0, -0.2, 1, 0, 0); // Shear effect (Itálico)
                ctx.fillRect(barX, barY, barW, barH);
                
                // Preenchimento
                const fillW = (d.nitro / 100) * (barW - 4);
                const nitroColor = d.turboLock ? "#00e5ff" : "#ff9100";
                
                // Efeito de brilho piscante se cheio
                if (d.nitro >= 99 && d.time % 10 < 5) ctx.fillStyle = "#fff";
                else ctx.fillStyle = nitroColor;
                
                ctx.fillRect(barX + 2, barY + 2, fillW, barH - 4);
                ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset Transform

                // Texto Nitro
                ctx.fillStyle = "#fff"; ctx.font = "italic bold 16px sans-serif"; ctx.textAlign = "right";
                ctx.fillText("BOOST", barX - 10, barY + 16);

                // --- 5. MINI-MAPA DINÂMICO (Advanced Rotation) ---
                if (minimapPoints.length > 0) {
                    const mapS = 130;
                    const mapX = 30;
                    const mapY = 30; // Top Left
                    
                    ctx.save();
                    // Clip redondo
                    ctx.beginPath(); ctx.arc(mapX + mapS/2, mapY + mapS/2, mapS/2, 0, Math.PI*2); 
                    ctx.clip();
                    
                    // Fundo
                    ctx.fillStyle = "rgba(0, 0, 0, 0.85)"; ctx.fill();

                    // Transformação para rotação
                    ctx.translate(mapX + mapS/2, mapY + mapS/2);
                    
                    // Calcula ângulo atual do jogador no mapa
                    // A rotação deve ser oposta à curva atual da pista ou direção acumulada
                    const currentMapIdx = Math.floor((d.pos / trackLength) * minimapPoints.length) % minimapPoints.length;
                    const currentPoint = minimapPoints[currentMapIdx];
                    
                    // Rotaciona o mundo para que o jogador sempre aponte para "CIMA"
                    ctx.rotate(-currentPoint.dir - Math.PI/2);
                    
                    // Move o mundo para centralizar no jogador
                    const scale = 3.5; // Zoom
                    ctx.translate(-currentPoint.x * scale, -currentPoint.y * scale);
                    
                    // Desenha Pista
                    ctx.strokeStyle = "#555";
                    ctx.lineWidth = 14;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    minimapPoints.forEach((p, i) => {
                        if (i===0) ctx.moveTo(p.x * scale, p.y * scale);
                        else ctx.lineTo(p.x * scale, p.y * scale);
                    });
                    ctx.stroke();

                    // Core Pista (Branco)
                    ctx.strokeStyle = "#fff"; ctx.lineWidth = 6; ctx.stroke();

                    // Rivais
                    d.rivals.forEach(r => {
                        const rIdx = Math.floor((r.pos / trackLength) * minimapPoints.length) % minimapPoints.length;
                        const rp = minimapPoints[rIdx];
                        ctx.fillStyle = r.color;
                        ctx.beginPath(); ctx.arc(rp.x * scale, rp.y * scale, 8, 0, Math.PI*2); ctx.fill();
                        // Borda do rival
                        ctx.strokeStyle="black"; ctx.lineWidth=2; ctx.stroke();
                    });

                    // Jogador (Seta) - Desenhado nas coordenadas do ponto, mas como giramos o canvas, vai ficar no centro
                    ctx.translate(currentPoint.x * scale, currentPoint.y * scale);
                    // Como rotacionamos o canvas, a seta aponta sempre para "Cima" visualmente (que é a direção da pista)
                    ctx.rotate(currentPoint.dir + Math.PI/2); // Cancela rotação para desenhar ícone fixo? Não, queremos fixo na tela.
                    // Na verdade, já estamos no 0,0 do contexto rotacionado. O ponto (0,0) é o jogador.
                    
                    ctx.fillStyle = "#00e5ff";
                    ctx.shadowColor="#00e5ff"; ctx.shadowBlur=10;
                    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.fill();
                    
                    ctx.restore();

                    // Borda do Mapa
                    ctx.beginPath(); ctx.arc(mapX + mapS/2, mapY + mapS/2, mapS/2, 0, Math.PI*2); 
                    ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.stroke();
                }

                // --- 6. VOLANTE VIRTUAL (Se ativo) ---
                if (d.virtualWheel.opacity > 0) {
                    ctx.save();
                    ctx.globalAlpha = d.virtualWheel.opacity;
                    ctx.translate(d.virtualWheel.x, d.virtualWheel.y);
                    
                    // Aro
                    ctx.beginPath(); ctx.arc(0,0, d.virtualWheel.r, 0, Math.PI*2);
                    ctx.lineWidth = 6; ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.stroke();
                    
                    // Marcador de Direção
                    ctx.rotate(d.steer * 1.5);
                    ctx.fillStyle = "#ff3d00";
                    ctx.beginPath(); ctx.arc(0, -d.virtualWheel.r, 10, 0, Math.PI*2); ctx.fill();
                    
                    ctx.restore();
                }

            } else {
                // TELA FINAL
                ctx.fillStyle = "rgba(0,0,0,0.9)";
                ctx.fillRect(0,0,w,h);
                
                ctx.fillStyle = "#fff"; ctx.textAlign="center";
                ctx.font = "bold 60px sans-serif";
                ctx.fillText(d.rank === 1 ? "VITÓRIA!" : "FIM DE JOGO", w/2, h*0.4);
                
                ctx.font = "30px sans-serif";
                ctx.fillStyle = "#aaa";
                ctx.fillText(`POSIÇÃO: ${d.rank}º`, w/2, h*0.55);
                ctx.fillText(`PONTOS: ${Math.floor(d.score)}`, w/2, h*0.65);
            }
        }
    };

    // Registro no Sistema
    if(window.System) {
        window.System.registerGame('drive', 'Otto Kart Commercial', '🏎️', Logic, {
            camOpacity: 0.1, // Quase transparente para imersão
            showWheel: false // Usamos nosso próprio render
        });
    }

})();