// =====================================================
// KART DO OTTO – GOLD MASTER (FREEZE BUILD COMMERCIAL)
// STATUS: FINAL PRODUCTION READY - PHYSICS FIXED
// ENGINEER: CODE 177
// =====================================================

(function() {
    // =================================================================
    // 1. SISTEMAS GLOBAIS E UTILITÁRIOS
    // =================================================================
    let particles = [];
    let nitroBtn = null;
    
    // Configurações de Pista
    const SEGMENT_LENGTH = 200; 
    const RUMBLE_LENGTH = 3;    
    
    // Dados do Circuito
    let segments = [];
    let trackLength = 0;

    // TUNING PROFISSIONAL (USER EXPERIENCE & PHYSICS)
    const CONF = {
        // Velocidades
        MAX_SPEED: 260,
        TURBO_MAX_SPEED: 460,  // Recompensa alta para o turbo
        ACCEL: 2.2,            // Saída ágil
        FRICTION: 0.97,        // "Glide" satisfatório (inércia)
        
        // Punição Offroad (Balanceada para aprendizado)
        OFFROAD_LIMIT: 60,     // Velocidade de punição
        OFFROAD_SPIN_TIME: 80, // Tolerância de ~1.3s antes de rodar
        
        // Sistema Nitro (Toggle Logic)
        NITRO_MAX: 100,
        NITRO_DRAIN: 0.65,     // Duração estendida para satisfação
        NITRO_RECHARGE: 0.15,  // Recarga constante
        
        // Física de Curva (Mario Kart Style - Sem Auto-Pilot)
        CENTRIFUGAL: 0.38,     // Força que joga o kart para fora
        GRIP_BASE: 1.1,        // Aderência padrão
        GRIP_DRIFT: 0.96,      // Aderência reduzida no drift
        
        // Input Touchless (Robustez Extrema)
        INPUT_SMOOTHING: 0.1,  // Suavização para evitar jitter da câmera
        POSE_GRACE_PERIOD: 60, // 1s de memória muscular se perder tracking
        DEADZONE: 0.06,        // Ignora tremores pequenos
        GESTURE_BUFFER: 10,    // Frames para confirmar gesto (anti-falso-positivo)
        
        // Zonas
        TURBO_ZONE_Y: 0.35     // 35% superior da tela ativa turbo
    };

    const Logic = {
        // --- ESTADO FÍSICO ---
        speed: 0, 
        maxSpeed: 260,
        pos: 0,           
        playerX: 0,       
        steer: 0,         
        rawSteer: 0,      
        
        // --- SISTEMA DE RIVAIS ---
        rivals: [],
        
        // --- NITRO SYSTEM (TOGGLE) ---
        nitro: 100,
        isNitroActive: false,
        btnNitroActive: false, // Fallback Touch
        gestureDetected: false,// Flag de detecção bruta
        gestureTimer: 0,       // Timer de confirmação
        turboLock: false,      // Lógica de travamento (Toggle)
        
        // --- DRIFT SYSTEM ---
        driftState: 0,    // 0=Normal, 1=Drifting
        driftDir: 0,      
        driftCharge: 0,   
        mtStage: 0,       
        boostTimer: 0,    
        
        // --- GAME FLOW ---
        state: 'race', 
        finishTimer: 0,
        isLastLap: false,
        
        // --- FÍSICA ---
        centrifugal: 0,   
        grip: 1.0,        
        offroadTimer: 0,  
        spinTimer: 0,     
        
        // --- DADOS ---
        score: 0,
        lap: 1,
        totalLaps: 3,
        time: 0,
        rank: 1, 
        
        stats: { drifts: 0, overtakes: 0, crashes: 0 },
        
        // --- VISUAL ---
        visualTilt: 0,    
        bounce: 0,
        skyColor: 0, 
        
        // --- INPUT ---
        inputState: 0, // 0=Lost, 1=OneHand, 2=FullControl
        
        tracking: {
            hands: { left: null, right: null }, 
            lastAngle: 0,                       
            lossTimer: 0,                       
            virtualWheel: { x:0, y:0, r:0, a:0, opacity:0 } 
        },
        
        // --- CONSTRUTOR DE PISTA ---
        buildTrack: function() {
            segments = [];
            const addRoad = (enter, curve, y) => {
                const startIdx = segments.length;
                for(let i=0; i<enter; i++) {
                    const isDark = Math.floor(segments.length/RUMBLE_LENGTH)%2;
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
                if(segments[index]) segments[index].obs.push({ type: type, x: offset });
            };

            // TRAÇADO "OTTO CIRCUIT"
            addRoad(50, 0, 0); 
            let sHook = addRoad(20, 0.5, 0); addProp(sHook, 'sign', -1.5);
            addRoad(20, 1.5, 0);             
            let sApex1 = addRoad(30, 3.5, 0); addProp(sApex1 + 5, 'cone', 0.9);
            addRoad(20, 1.0, 0);             
            addRoad(40, 0, 0);
            let sChicane = addRoad(20, 0, 0); addProp(sChicane, 'sign', 1.5); 
            addRoad(15, -2.5, 0); addProp(segments.length-5, 'cone', -0.9);
            addRoad(10, 0, 0);     
            addRoad(15, 2.5, 0); addProp(segments.length-5, 'cone', 0.9);
            addRoad(20, 0, 0);    
            let sLoop = addRoad(30, 0, 0); addProp(sLoop, 'sign', 1.5); addProp(sLoop+5, 'sign', 1.5);
            addRoad(20, -1.0, 0); 
            addRoad(60, -3.5, 0); 
            addRoad(20, -1.0, 0); 
            let sHazards = addRoad(70, 0, 0);
            addProp(sHazards + 15, 'cone', 0); addProp(sHazards + 35, 'cone', -0.6); addProp(sHazards + 55, 'cone', 0.6);
            addRoad(40, 1.2, 0);

            trackLength = segments.length * SEGMENT_LENGTH;
        },
        
        // --- UI (FALLBACK & DEBUG) ---
        setupUI: function() {
            if(document.getElementById('nitro-btn')) document.getElementById('nitro-btn').remove();
            nitroBtn = document.createElement('div');
            nitroBtn.id = 'nitro-btn';
            nitroBtn.innerHTML = "NITRO";
            Object.assign(nitroBtn.style, {
                position: 'absolute', top: '35%', right: '20px', width: '90px', height: '90px',
                borderRadius: '50%', background: 'radial-gradient(#ffaa00, #cc5500)', border: '4px solid #fff',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Russo One', sans-serif", fontSize: '18px', cursor: 'pointer',
                boxShadow: '0 0 25px rgba(255, 100, 0, 0.6)', zIndex: '100', userSelect: 'none', 
                transition: 'transform 0.1s, filter 0.1s, opacity 0.3s', pointerEvents: 'auto'
            });

            // Lógica de Toggle no botão físico
            const toggleNitro = (e) => { 
                if(e.cancelable) e.preventDefault(); 
                e.stopPropagation();
                if(this.nitro > 10) {
                    this.turboLock = !this.turboLock; // Toggle ON/OFF
                    this.btnNitroActive = this.turboLock;
                    if(this.turboLock) {
                        nitroBtn.style.transform = 'scale(0.9)'; 
                        nitroBtn.style.filter = 'brightness(1.5)';
                    } else {
                        nitroBtn.style.transform = 'scale(1.0)'; 
                        nitroBtn.style.filter = 'brightness(1.0)';
                    }
                }
            };
            
            nitroBtn.addEventListener('mousedown', toggleNitro);
            nitroBtn.addEventListener('touchstart', toggleNitro, {passive: false});
            
            document.getElementById('game-ui').appendChild(nitroBtn);
        },

        // --- INICIALIZAÇÃO ---
        init: function() { 
            this.buildTrack();
            this.setupUI();
            
            this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0;
            this.score = 0; this.lap = 1; this.time = 0; this.rank = 1;
            this.state = 'race'; this.finishTimer = 0; this.isLastLap = false;
            this.skyColor = 0; particles = []; 
            this.inputState = 0;
            
            this.tracking = {
                hands: { left: null, right: null },
                lastAngle: 0, lossTimer: 0,
                virtualWheel: { x:0, y:0, r:0, a:0, opacity:0 }
            };
            
            this.driftState = 0; this.driftCharge = 0; this.mtStage = 0; this.boostTimer = 0; this.grip = 1.0;
            this.nitro = 100; this.isNitroActive = false; 
            this.turboLock = false; this.gestureTimer = 0;
            this.offroadTimer = 0; this.spinTimer = 0;

            // RIVAIS (PERSONALIDADES EQUILIBRADAS)
            this.rivals = [
                { id:1, pos: 1200, x: -0.5, speed: 0, lap: 1, finished: false, offset: 0, color: '#00aa00', aggro: 0.055, name: 'Luigi' }, 
                { id:2, pos: 1000,  x: 0.5,  speed: 0, lap: 1, finished: false, offset: 0, color: '#0000aa', aggro: 0.04, name: 'Toad' },  
                { id:3, pos: 1400, x: 0,    speed: 0, lap: 1, finished: false, offset: 0, color: '#aa0000', aggro: 0.08, name: 'Bowser' } 
            ];
            
            window.System.msg("PREPARAR..."); 
            window.Sfx.play(100, 'sawtooth', 0.5, 0.2); 
            setTimeout(() => { window.System.msg("3"); window.Sfx.play(200, 'square', 0.2, 0.1); }, 1000);
            setTimeout(() => { window.System.msg("2"); window.Sfx.play(200, 'square', 0.2, 0.1); }, 2000);
            setTimeout(() => { window.System.msg("1"); window.Sfx.play(200, 'square', 0.2, 0.1); }, 3000);
            setTimeout(() => { window.System.msg("VAI!"); window.Sfx.play(600, 'square', 1.0, 0.3); }, 4000);
        },
        
        // =================================================================
        // UPDATE LOOP PRINCIPAL (60 FPS)
        // =================================================================
        update: function(ctx, w, h, pose) {
            const d = Logic; 
            const cx = w / 2;
            const horizon = h * 0.40;

            // -----------------------------------------------------------------
            // 1. INPUT SYSTEM (ROBUSTEZ + UX COMERCIAL)
            // -----------------------------------------------------------------
            let detectedHands = 0;
            let currentLeft = null;
            let currentRight = null;
            let rawGestureSignal = false; 
            let handsY_Avg = h;

            // A) Análise de Pose
            if(d.state === 'race' && pose && pose.keypoints) {
                const kp = pose.keypoints;
                const lw = kp.find(k => k.name === 'left_wrist' || k.name === 'leftWrist');
                const rw = kp.find(k => k.name === 'right_wrist' || k.name === 'rightWrist');
                
                // Score tolerante para luz ruim
                const validL = lw && lw.score > 0.35; 
                const validR = rw && rw.score > 0.35;

                if(validL) { currentLeft = window.Gfx.map(lw, w, h); detectedHands++; }
                if(validR) { currentRight = window.Gfx.map(rw, w, h); detectedHands++; }

                // B) Detecção de Intenção de Turbo (Zona Superior)
                if(detectedHands === 1) {
                    const activeHand = validL ? currentLeft : currentRight;
                    if(activeHand && activeHand.y < h * CONF.TURBO_ZONE_Y) rawGestureSignal = true;
                }
                if(detectedHands === 2) {
                    handsY_Avg = (currentLeft.y + currentRight.y) / 2;
                    if(handsY_Avg < h * CONF.TURBO_ZONE_Y) rawGestureSignal = true;
                }
            }

            // C) Buffer de Gesto (Anti-Ruído / Toggle Logic)
            if (rawGestureSignal) {
                d.gestureTimer++;
                // Ativa apenas no momento exato que cruza o threshold (Toggle Activation)
                if (d.gestureTimer === CONF.GESTURE_BUFFER && d.nitro > 5) {
                    if (!d.turboLock) {
                        d.turboLock = true; // Ativa
                        window.Sfx.play(800, 'square', 0.1, 0.5); // Som "Ligou"
                    }
                }
            } else {
                d.gestureTimer = 0; // Reset rápido
            }

            // D) Processamento de Direção (Grace Period + Suavização)
            if (detectedHands === 2) {
                // Tracking Perfeito
                d.tracking.lossTimer = 0;
                d.tracking.hands.left = currentLeft;
                d.tracking.hands.right = currentRight;
                d.inputState = 2;

                const dx = currentRight.x - currentLeft.x;
                const dy = currentRight.y - currentLeft.y;
                const angle = Math.atan2(dy, dx);
                
                // Deadzone e Sensibilidade
                if(Math.abs(angle) > CONF.DEADZONE) {
                    d.tracking.lastAngle = angle * window.System.sens * 2.2; 
                } else {
                    d.tracking.lastAngle = 0;
                }

                // UI Volante
                const midX = (currentLeft.x + currentRight.x) / 2;
                const midY = (currentLeft.y + currentRight.y) / 2;
                const dist = Math.hypot(dx, dy);
                
                d.tracking.virtualWheel.x += (midX - d.tracking.virtualWheel.x) * 0.2;
                d.tracking.virtualWheel.y += (midY - d.tracking.virtualWheel.y) * 0.2;
                d.tracking.virtualWheel.r += ((dist/2) - d.tracking.virtualWheel.r) * 0.1;
                d.tracking.virtualWheel.opacity = Math.min(1, d.tracking.virtualWheel.opacity + 0.15);

            } else if (detectedHands === 1) {
                // Modo 1 Mão: Mantém último valor com leve decaimento (robustez para crianças)
                d.tracking.lossTimer++;
                d.inputState = 1;
                d.tracking.virtualWheel.opacity *= 0.95; 
                d.tracking.lastAngle *= 0.99; // Decaimento quase imperceptível

            } else {
                // Perda Total: Grace Period
                d.tracking.lossTimer++;
                d.inputState = 0;
                d.tracking.virtualWheel.opacity *= 0.8;
                
                if (d.tracking.lossTimer < CONF.POSE_GRACE_PERIOD) {
                    // MANTÉM a direção (Tolerância a falha de câmera)
                } else {
                    // Soltou mesmo por muito tempo -> Centraliza
                    d.tracking.lastAngle *= 0.9;
                }
            }

            // Oculta botão touch se estiver usando câmera
            if(nitroBtn) {
                nitroBtn.style.opacity = (d.inputState > 0) ? '0.2' : '1';
            }

            // E) Aplicação Final de Steer
            let targetSteer = d.tracking.lastAngle;
            
            // Em caso de spin, perde controle
            if(d.spinTimer > 0) {
                targetSteer = Math.sin(d.time * 0.8) * 2.0;
                d.spinTimer--;
                if(d.spinTimer === 0) d.speed *= 0.3; // Freia ao fim do spin
            }

            d.steer += (targetSteer - d.steer) * CONF.INPUT_SMOOTHING;
            d.steer = Math.max(-1.4, Math.min(1.4, d.steer)); // Limite físico do volante

            // -----------------------------------------------------------------
            // 2. SISTEMA DE TURBO (LÓGICA DE DRENAGEM)
            // -----------------------------------------------------------------
            
            if (d.turboLock && d.nitro > 0) {
                d.isNitroActive = true;
                d.nitro -= CONF.NITRO_DRAIN;
                
                if(d.nitro <= 0) {
                    d.nitro = 0;
                    d.turboLock = false; // Acabou o gás, desliga
                }
                
                // Shake visual constante
                if(d.time % 3 === 0) window.Gfx.shake(2);
            } else {
                d.isNitroActive = false;
                d.turboLock = false; 
                // Recarga passiva constante
                if (d.nitro < CONF.NITRO_MAX) {
                    d.nitro += CONF.NITRO_RECHARGE;
                }
            }

            // Acelerador: Automático se houver "vida" no input ou turbo
            const isGasPressed = (d.inputState >= 1) || d.isNitroActive || (d.tracking.lossTimer < CONF.POSE_GRACE_PERIOD);

            // -----------------------------------------------------------------
            // 3. FÍSICA E MOVIMENTO (CORREÇÃO CRÍTICA DE AUTO-PILOT)
            // -----------------------------------------------------------------
            
            let activeMaxSpeed = CONF.MAX_SPEED;
            let activeAccel = CONF.ACCEL;

            // Modificadores de Estado
            if (d.isNitroActive) {
                activeMaxSpeed = CONF.TURBO_MAX_SPEED;
                activeAccel = CONF.ACCEL * 3;
            } else if (d.boostTimer > 0) {
                activeMaxSpeed = CONF.MAX_SPEED + 120;
                activeAccel = CONF.ACCEL * 4;
                d.boostTimer--;
            }

            // Lógica Offroad (Grama pune)
            const isOffRoad = Math.abs(d.playerX) > 2.2;
            if (isOffRoad && !d.isNitroActive && d.boostTimer <= 0) {
                d.offroadTimer++;
                activeMaxSpeed = CONF.OFFROAD_LIMIT;
                d.grip = 0.3; // Sem aderência
                window.Gfx.shake(d.offroadTimer * 0.05); 
                
                if(d.speed > activeMaxSpeed) d.speed *= 0.85; // Freio rápido

                // Spin se insistir na grama
                if(d.offroadTimer > CONF.OFFROAD_SPIN_TIME && d.speed > 50) {
                    d.spinTimer = 45;
                    d.offroadTimer = 0;
                    window.Sfx.crash();
                    window.System.msg("SPIN!");
                }
            } else {
                d.offroadTimer = Math.max(0, d.offroadTimer - 2);
            }

            // Integração Velocidade
            if (isGasPressed && d.state === 'race' && d.spinTimer === 0) {
                if (d.speed < activeMaxSpeed) d.speed += activeAccel;
                else d.speed += (activeMaxSpeed - d.speed) * 0.05;
            } else {
                d.speed *= (isOffRoad ? 0.9 : CONF.FRICTION); // Desaceleração natural
            }
            if(d.speed < 0) d.speed = 0;

            // Geometria da Pista
            const currentSegIndex = Math.floor(d.pos / SEGMENT_LENGTH) % segments.length;
            const currentSeg = segments[currentSegIndex] || segments[0];
            const speedRatio = d.speed / CONF.MAX_SPEED;

            // DRIFT (Mecânica de Diversão)
            // Entrada
            if (d.driftState === 0) {
                if (Math.abs(d.steer) > 0.8 && speedRatio > 0.6 && d.inputState === 2 && !isOffRoad && d.spinTimer === 0) {
                    d.driftState = 1; 
                    d.driftDir = Math.sign(d.steer);
                    d.driftCharge = 0; d.mtStage = 0; 
                    d.bounce = -8; 
                    window.Sfx.skid();
                }
            } 
            // Manutenção
            else if (d.driftState === 1) {
                // Se endireitar ou sair da pista, solta o drift
                if (Math.abs(d.steer) < 0.2 || speedRatio < 0.3 || isOffRoad || d.spinTimer > 0) {
                    // Recompensa
                    if (d.mtStage > 0 && !isOffRoad && d.spinTimer === 0) {
                        const boostFrames = [0, 45, 90];
                        d.boostTimer = boostFrames[d.mtStage];
                        window.System.msg(d.mtStage === 2 ? "SUPER!" : "BOOST!");
                        window.Sfx.play(600 + (d.mtStage*200), 'square', 0.3, 0.2);
                        d.stats.drifts++;
                    }
                    d.driftState = 0;
                } else {
                    // Carrega faíscas
                    d.driftCharge += 1.5;
                    if (d.driftCharge > 150) d.mtStage = 2; else if (d.driftCharge > 60) d.mtStage = 1; else d.mtStage = 0;
                    
                    // Partículas
                    if (d.time % 4 === 0) {
                        const color = d.mtStage === 2 ? '#ff5500' : (d.mtStage === 1 ? '#00ffff' : '#ffffaa');
                        const pX = cx + (d.playerX * w * 0.4) + (d.driftDir * 50);
                        particles.push({ x: pX, y: h * 0.9, vx: -d.driftDir * (2+Math.random()*4), vy: -2-Math.random()*3, c: color, l: 20 });
                    }
                }
            }

            // FÍSICA LATERAL DEFINITIVA (CORREÇÃO DE AUTO-PILOT)
            // Grip Base
            if(!isOffRoad) d.grip = d.driftState === 1 ? CONF.GRIP_DRIFT : CONF.GRIP_BASE;

            // 1. Centrífuga (SEMPRE empurra para fora da curva)
            // Curva > 0 (Direita) -> Centrífuga empurra para Esquerda (Negativo)
            // Curva < 0 (Esquerda) -> Centrífuga empurra para Direita (Positivo)
            // Nota: Se curve=1, player deve virar steer=1 para compensar.
            // Fórmula: trackForce = curve * speedRatio * CONST
            d.centrifugal = (currentSeg.curve * (speedRatio * speedRatio)) * CONF.CENTRIFUGAL;

            // --------------------------------------------------
            // FÍSICA LATERAL – PADRÃO COMERCIAL
            // --------------------------------------------------
            // Elimina micro ruído involuntário
            if (Math.abs(d.steer) < 0.03) d.steer = 0;

            // Força gerada pelo jogador
            // O jogador vira. Se steer e curve têm mesmo sinal, ele entra na curva.
            const playerForce = d.steer * (d.driftState === 1 ? 0.09 : 0.07) * d.grip * (d.speed/50);

            // Força da pista (nunca vira, só empurra para fora)
            const trackForce = d.centrifugal;

            // Assistência suave (SOMENTE COM INPUT ATIVO)
            // Ajuda a manter a curva se o jogador estiver tentando virar
            let assistForce = 0;
            if (Math.abs(d.steer) > 0.1) {
                // Se jogador vira para o lado da curva, ajuda levemente a combater a centrífuga
                if (Math.sign(d.steer) === Math.sign(currentSeg.curve)) {
                    assistForce = -trackForce * 0.25; 
                }
            }

            // Integração final: Posição X += (Jogador + Ajuda - Pista)
            d.playerX += playerForce + assistForce - trackForce;

            // Limites rígidos da pista
            if (d.playerX > 4.5) d.playerX = 4.5;
            if (d.playerX < -4.5) d.playerX = -4.5;

            // -----------------------------------------------------------------
            // 4. RIVAIS (IA COMPETITIVA)
            // -----------------------------------------------------------------
            if(d.state === 'race') {
                let playersAhead = 0;
                d.rivals.forEach(rival => {
                    if(!rival.finished) {
                        const dist = rival.pos - d.pos;
                        let targetSpeed = d.maxSpeed * 0.98; 
                        
                        // Personalidade
                        if(d.isLastLap) targetSpeed *= 1.05;
                        targetSpeed += (Math.random()-0.5) * 4; 
                        
                        // Rubber Banding (Mantém a corrida viva)
                        if(dist > 1200) targetSpeed *= 0.8;  // Espera
                        if(dist < -800) targetSpeed *= 1.2;  // Busca
                        
                        rival.speed += (targetSpeed - rival.speed) * rival.aggro;
                        rival.pos += rival.speed;
                        
                        // Curvas IA
                        const rSegIdx = Math.floor(rival.pos / SEGMENT_LENGTH) % segments.length;
                        const rSeg = segments[rSegIdx] || segments[0];
                        const line = -rSeg.curve * 0.5; // Linha ideal
                        
                        rival.offset += (Math.random() - 0.5) * 0.05;
                        rival.offset *= 0.96;
                        rival.x += (line + rival.offset - rival.x) * 0.05;
                        
                        // Loop
                        if(rival.pos >= trackLength) {
                            rival.pos -= trackLength;
                            rival.lap++;
                            if(rival.lap > d.totalLaps) rival.finished = true;
                        }
                        
                        if((rival.lap > d.lap) || (rival.lap === d.lap && rival.pos > d.pos)) playersAhead++;
                    } else {
                        playersAhead++;
                    }
                });
                d.rank = 1 + playersAhead;
            }

            // -----------------------------------------------------------------
            // 5. PROGRESSÃO
            // -----------------------------------------------------------------
            d.pos += d.speed;
            while (d.pos >= trackLength) {
                d.pos -= trackLength;
                if (d.state === 'race') {
                    d.lap++;
                    if (d.lap > d.totalLaps) {
                        d.state = 'finished';
                        const win = d.rank === 1;
                        window.System.msg(win ? "VENCEDOR!" : `POSIÇÃO ${d.rank}`);
                        if (win) { d.score += 5000; window.Sfx.play(1000, 'square', 0.5, 0.5); }
                        // Confetes
                        for(let i=0;i<80;i++) particles.push({x:cx, y:h*0.5, vx:(Math.random()-0.5)*20, vy:(Math.random()-0.5)*20, c:Math.random()<0.5?'#ff0':'#fff', l:100});
                    } else {
                        window.System.msg(d.lap === d.totalLaps ? "ÚLTIMA VOLTA!" : "VOLTA " + d.lap);
                        window.Sfx.coin();
                        if(d.lap === d.totalLaps) { d.skyColor = 1; window.Sfx.play(800, 'sawtooth', 0.8, 0.5); }
                    }
                }
            }
            while (d.pos < 0) d.pos += trackLength;

            if (d.state === 'finished') {
                d.speed *= 0.96;
                if (d.speed < 5 && d.finishTimer === 0) {
                    d.finishTimer = 1;
                    setTimeout(() => window.System.gameOver(d.score), 2500);
                }
            }

            // Animações Finais
            d.visualTilt += ((d.steer * 20) - d.visualTilt) * 0.1;
            d.bounce *= 0.85;
            if (isOffRoad) d.bounce = (Math.random() - 0.5) * (d.speed * 0.1);

            d.time++; d.score += (d.speed * 0.01);

            // -----------------------------------------------------------------
            // 6. RENDERIZAÇÃO
            // -----------------------------------------------------------------
            
            // Céu e Horizonte
            let topSky = d.skyColor === 0 ? "#3388ff" : "#663399";
            let botSky = d.skyColor === 0 ? "#88ccff" : "#ffaa00";
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, topSky); gradSky.addColorStop(1, botSky);
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

            // Montanhas Parallax
            const bgOffset = (currentSeg.curve * 30) + (d.steer * 20);
            ctx.fillStyle = d.skyColor === 0 ? '#44aa44' : '#331133';
            ctx.beginPath(); ctx.moveTo(0, horizon);
            for(let i=0; i<=12; i++) {
                const mx = (w/12 * i) - (bgOffset * 0.5);
                const my = horizon - 50 - Math.abs(Math.sin(i + d.pos*0.0001))*40;
                ctx.lineTo(mx, my);
            }
            ctx.lineTo(w, horizon); ctx.fill();

            // Chão
            ctx.fillStyle = isOffRoad ? '#336622' : '#448833';
            ctx.fillRect(0, horizon, w, h-horizon);

            // Z-Buffer / Painter's Algo
            let drawDistance = 60; // Mais longe para ver curvas
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

                // Desenha
                const grassColor = (seg.color === 'dark') ? (isOffRoad?'#336622':'#448833') : (isOffRoad?'#3a7528':'#55aa44');
                const roadColor = (seg.color === 'dark') ? '#666' : '#636363';
                const rumbleColor = (seg.color === 'dark') ? '#c00' : '#fff';

                ctx.fillStyle = grassColor; ctx.fillRect(0, screenYNext, w, screenY - screenYNext);
                
                // Rumble
                ctx.fillStyle = rumbleColor;
                ctx.beginPath(); ctx.moveTo(screenX - roadWidth/2 - roadWidth*0.1, screenY); ctx.lineTo(screenX + roadWidth/2 + roadWidth*0.1, screenY); ctx.lineTo(screenXNext + roadWidthNext/2 + roadWidthNext*0.1, screenYNext); ctx.lineTo(screenXNext - roadWidthNext/2 - roadWidthNext*0.1, screenYNext); ctx.fill();
                
                // Road
                ctx.fillStyle = roadColor;
                ctx.beginPath(); ctx.moveTo(screenX - roadWidth/2, screenY); ctx.lineTo(screenX + roadWidth/2, screenY); ctx.lineTo(screenXNext + roadWidthNext/2, screenYNext); ctx.lineTo(screenXNext - roadWidthNext/2, screenYNext); ctx.fill();
            }

            // Sprites (Renders)
            for(let n = drawDistance-1; n >= 0; n--) {
                const coord = segmentCoords[n];
                const seg = segments[coord.index];
                
                // Rivais
                d.rivals.forEach(r => {
                    let rRelPos = r.pos - d.pos;
                    if(rRelPos < -trackLength/2) rRelPos += trackLength;
                    if(rRelPos > trackLength/2) rRelPos -= trackLength;
                    
                    let distInSegs = Math.floor(rRelPos / SEGMENT_LENGTH);
                    if (Math.abs(distInSegs - n) < 1 && n > 2) {
                        const rScale = coord.scale;
                        const rX = coord.x + (r.x * (w * 3) * rScale / 2);
                        const rY = coord.y;
                        
                        ctx.save(); ctx.translate(rX, rY); ctx.scale(rScale * 12, rScale * 12);
                        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 3, 0, 0, Math.PI*2); ctx.fill();
                        ctx.fillStyle = r.color; ctx.fillRect(-6, -8, 12, 6);
                        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -12, 4, 0, Math.PI*2); ctx.fill();
                        ctx.restore();
                    }
                });

                // Obstáculos
                if(seg.obs.length > 0) {
                    seg.obs.forEach(o => {
                        const sScale = coord.scale;
                        const sX = coord.x + (o.x * (w * 3) * sScale / 2);
                        const sY = coord.y;
                        const size = (w * 0.22) * sScale;

                        if (o.type === 'cone') {
                            ctx.fillStyle = '#ff5500'; ctx.beginPath(); ctx.moveTo(sX, sY - size); ctx.lineTo(sX - size*0.3, sY); ctx.lineTo(sX + size*0.3, sY); ctx.fill();
                        } else {
                            ctx.fillStyle = '#f1c40f'; ctx.fillRect(sX - size/2, sY - size, size, size*0.6);
                            ctx.fillStyle = '#000'; ctx.textAlign='center'; ctx.font = `bold ${size*0.4}px Arial`;
                            ctx.fillText(seg.curve > 0 ? ">>>" : "<<<", sX, sY - size*0.2);
                        }

                        // Colisão
                        if (n < 3 && Math.abs(d.playerX - o.x) < 0.6) {
                            d.speed *= 0.5; d.stats.crashes++; d.score -= 200; o.x = 999; 
                            window.Gfx.shake(20); window.Sfx.crash(); window.System.msg("CRASH!");
                        }
                    });
                }
            }

            // 7. RENDER JOGADOR
            const carScale = w * 0.0055;
            ctx.save(); ctx.translate(cx, h * 0.85 + d.bounce); ctx.scale(carScale, carScale);
            
            let visualRotation = d.visualTilt * 0.02; 
            if (d.driftState === 1) visualRotation += (d.driftDir * 0.3);
            if (d.spinTimer > 0) visualRotation += (d.spinTimer * 0.6);
            ctx.rotate(visualRotation);

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 35, 60, 15, 0, 0, Math.PI*2); ctx.fill();

            // Chassi
            const gradBody = ctx.createLinearGradient(-30, 0, 30, 0);
            gradBody.addColorStop(0, '#cc0000'); gradBody.addColorStop(0.5, '#ff4444'); gradBody.addColorStop(1, '#cc0000');
            ctx.fillStyle = gradBody;
            ctx.beginPath(); ctx.moveTo(-25, -30); ctx.lineTo(25, -30); ctx.lineTo(40, 10); ctx.lineTo(10, 35); ctx.lineTo(-10, 35); ctx.lineTo(-40, 10); ctx.fill();

            // Turbo Flame
            if (d.isNitroActive || d.boostTimer > 0) {
                const fireSize = 10 + Math.random() * 15;
                ctx.fillStyle = (d.mtStage === 2 || d.isNitroActive) ? '#00ffff' : '#ffaa00';
                ctx.beginPath(); ctx.arc(-20, -30, fireSize, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(20, -30, fireSize, 0, Math.PI*2); ctx.fill();
            }

            // Rodas
            const wheelAngle = d.steer * 0.8;
            ctx.fillStyle = '#111';
            const drawWheel = (wx, wy) => {
                ctx.save(); ctx.translate(wx, wy); ctx.rotate(wheelAngle); ctx.fillRect(-12, -15, 24, 30); ctx.fillStyle = '#666'; ctx.fillRect(-5, -5, 10, 10); ctx.fillStyle = '#111'; ctx.restore();
            };
            drawWheel(-45, 15); drawWheel(45, 15); ctx.fillRect(-50, -25, 20, 30); ctx.fillRect(30, -25, 20, 30);

            // Piloto
            ctx.save(); ctx.translate(0, -10); ctx.rotate(d.steer * 0.3);
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -20, 18, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#333'; ctx.fillRect(-15, -25, 30, 8);
            ctx.fillStyle = 'red'; ctx.font='bold 12px Arial'; ctx.textAlign='center'; ctx.fillText('M', 0, -32);
            ctx.restore(); ctx.restore(); 

            // Partículas render
            particles.forEach((p, i) => { p.x += p.vx; p.y += p.vy; p.l--; if(p.l<=0) particles.splice(i,1); else { ctx.fillStyle=p.c; ctx.globalAlpha = p.l / 50; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1.0; } });

            // 8. HUD
            if(d.state === 'race') {
                const hudX = w - 80; const hudY = h - 60;
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(hudX, hudY, 55, 0, Math.PI*2); ctx.fill();
                
                // Velocímetro
                const rpm = Math.min(1, d.speed / CONF.TURBO_MAX_SPEED);
                ctx.beginPath(); ctx.arc(hudX, hudY, 50, Math.PI, Math.PI + (Math.PI * rpm));
                ctx.lineWidth = 6; ctx.strokeStyle = d.isNitroActive ? '#00ffff' : '#ff3300'; ctx.stroke();

                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; 
                ctx.font = "bold 36px 'Russo One'"; ctx.fillText(Math.floor(d.speed), hudX, hudY + 10);
                ctx.font = "10px Arial"; ctx.fillText(`POS ${d.rank}`, hudX, hudY + 25);

                // Barra Nitro
                const nW = 220;
                ctx.fillStyle = '#111'; ctx.fillRect(w/2 - nW/2, 20, nW, 20);
                // Cor do Nitro muda se estiver travado
                ctx.fillStyle = d.turboLock ? '#00ffff' : (d.nitro > 20 ? '#00aa00' : '#ff3300');
                ctx.fillRect(w/2 - nW/2 + 2, 22, (nW-4) * (d.nitro/CONF.NITRO_MAX), 16);
                
                ctx.font="bold 12px Arial"; ctx.fillStyle="#fff"; 
                const nitroText = d.turboLock ? "TURBO MAXIMO!" : (d.nitro < 100 ? "RECARREGANDO..." : "TURBO PRONTO (MÃOS P/ CIMA)");
                ctx.fillText(nitroText, w/2, 35);

                // Volante Virtual (Feedback Essencial)
                if (d.tracking.virtualWheel.opacity > 0.01) {
                    const vw = d.tracking.virtualWheel;
                    ctx.save(); 
                    ctx.globalAlpha = vw.opacity * 0.8;
                    ctx.translate(vw.x, vw.y);
                    
                    // Zona Turbo
                    const inZone = vw.y < h * CONF.TURBO_ZONE_Y;
                    ctx.strokeStyle = inZone ? '#00ffff' : '#ffffff'; 
                    ctx.lineWidth = inZone ? 10 : 6;
                    
                    ctx.beginPath(); ctx.arc(0,0, vw.r, 0, Math.PI*2); ctx.stroke();
                    ctx.rotate(d.steer * 1.5);
                    ctx.fillStyle = inZone ? '#00ffff' : '#3498db'; ctx.fillRect(-5, -vw.r, 10, 25);
                    ctx.restore();
                    ctx.globalAlpha = 1.0;
                }
            } 
            else {
                ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,w,h);
                ctx.fillStyle = "#fff"; ctx.textAlign="center"; 
                
                const title = d.rank === 1 ? "VITÓRIA!" : `${d.rank}º LUGAR`;
                const color = d.rank === 1 ? "#ffff00" : "#aaaaaa";
                
                ctx.font="bold 60px 'Russo One'"; ctx.fillStyle = color; ctx.fillText(title, cx, h*0.3);
                ctx.font="bold 24px Arial"; ctx.fillStyle = "#fff"; ctx.fillText(`SCORE FINAL: ${Math.floor(d.score)}`, cx, h*0.45);
                ctx.font="18px Arial"; ctx.fillStyle = "#ccc"; ctx.fillText(`DRIFTS: ${d.stats.drifts} | ULTRAPASSAGENS: ${d.stats.overtakes}`, cx, h*0.55);
            }

            return Math.floor(d.score);
        }
    };

    if(window.System) {
        window.System.registerGame('drive', 'Otto GP', '🏎️', Logic, {camOpacity: 0.4, showWheel: false});
    }
})();
