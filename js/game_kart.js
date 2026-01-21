// LÓGICA DO JOGO: KART DO OTTO (GOLD MASTER - FIXED INPUT STABILITY)
(function() {
    // =================================================================
    // 1. SISTEMAS GLOBAIS E UTILITÁRIOS
    // =================================================================
    let particles = [];
    let nitroBtn = null;
    
    // Configurações de Pista (Geometria)
    const SEGMENT_LENGTH = 200; 
    const RUMBLE_LENGTH = 3;    
    
    // Dados do Circuito (Memória)
    let segments = [];
    let trackLength = 0;

    // Constantes de Engenharia de Gameplay (Nintendo "Feel")
    const CONF = {
        MAX_SPEED: 260,
        OFFROAD_LIMIT: 60,     // Velocidade máxima na grama
        NITRO_MAX: 100,
        NITRO_DRAIN: 1.5,      // Custo por frame
        NITRO_RECHARGE: 0.12,  // Taxa de recarga passiva
        CENTRIFUGAL: 0.35,     // Força G nas curvas
        ACCEL: 2,              // Aceleração base
        FRICTION: 0.96,        // Resistência do ar/chão
        TURBO_BOOST: 8,        // Aceleração extra do Nitro
        TURBO_MAX_SPEED: 400,  // Velocidade terminal com Nitro
        TOTAL_LAPS: 3,
        
        // INPUT CONSTANTS (WII STYLE - ESTABILIDADE)
        INPUT_SMOOTHING: 0.15, // Fator LERP para direção (menor = mais pesado)
        POSE_GRACE_PERIOD: 45, // Frames para manter controle após perder tracking (~0.7s)
        DEADZONE: 0.05         // Zona morta para evitar drift do sensor
    };

    const Logic = {
        // --- ESTADO FÍSICO ---
        speed: 0, 
        maxSpeed: 260,
        pos: 0,           
        playerX: 0,       
        steer: 0,         // Valor atual suavizado (-1 a 1)
        rawSteer: 0,      // Valor bruto do input
        
        // --- SISTEMA DE RIVAL ---
        rival: {
            pos: 1000,
            x: 0.5,
            speed: 0,
            lap: 1,
            finished: false,
            aggressive: false,
            offset: 0, // Variação lateral da IA
            passedCheck: false
        },
        
        // --- NITRO SYSTEM (Sovereign Authority) ---
        nitro: 100,
        isNitroActive: false,
        btnNitroActive: false, // Input físico/touch (Prioridade 1)
        gestureNitro: false,   // Input gestual (Prioridade 2)
        
        // --- DRIFT SYSTEM (Mario Kart Style) ---
        driftState: 0,    // 0=Normal, 1=Drifting
        driftDir: 0,      // -1 ou 1
        driftCharge: 0,   // Acumulador de faíscas
        mtStage: 0,       // 0=None, 1=Blue, 2=Orange
        boostTimer: 0,    // Frames restantes de turbo pós-drift
        
        // --- GAME FLOW ---
        state: 'race', // 'race', 'finished'
        finishTimer: 0,
        isLastLap: false,
        
        // --- FÍSICA AMBIENTAL ---
        centrifugal: 0,   
        grip: 1.0,        
        
        // --- META DADOS ---
        score: 0,
        lap: 1,
        totalLaps: 3,
        time: 0,
        
        // --- ESTATÍSTICAS ---
        stats: { drifts: 0, overtakes: 0, crashes: 0 },
        
        // --- VISUAL ---
        visualTilt: 0,    
        bounce: 0,
        skyColor: 0, // 0=Blue, 1=Sunset
        
        // --- SISTEMA DE INPUT ROBUSTO (CORREÇÃO DE REGRESSÃO) ---
        inputState: 0, // 0=NoHands, 1=OneHand, 2=Steering
        
        // Variáveis de Estabilidade e Persistência
        tracking: {
            hands: { left: null, right: null }, // Posições atuais
            lastAngle: 0,                       // Último ângulo válido
            lossTimer: 0,                       // Contador de perda de tracking
            isTracking: false,                  // Flag de estado
            virtualWheel: { x:0, y:0, r:0, a:0, opacity:0 } // Visualização UI
        },
        
        // --- CONSTRUTOR DE PISTA (Procedural Segmentado) ---
        buildTrack: function() {
            segments = [];
            const addRoad = (enter, curve, y) => {
                const startIdx = segments.length;
                for(let i=0; i<enter; i++) {
                    const isDark = Math.floor(segments.length/RUMBLE_LENGTH)%2;
                    // Cores alternadas para sensação de velocidade
                    const colorScheme = isDark ? 'dark' : 'light';
                    
                    segments.push({
                        curve: curve,
                        y: y, // Suporte futuro para elevação
                        color: colorScheme,
                        obs: []
                    });
                }
                return startIdx;
            };

            const addProp = (index, type, offset) => {
                if(segments[index]) segments[index].obs.push({ type: type, x: offset });
            };

            // LAYOUT "OTTO SPEEDWAY" (Fixado para consistência)
            addRoad(50, 0, 0); 
            let sHook = addRoad(10, 0.5, 0); addProp(sHook, 'sign', -1.5);
            addRoad(20, 1.5, 0);             
            let sApex1 = addRoad(25, 3.5, 0); addProp(sApex1 + 5, 'cone', 0.9);
            addRoad(20, 1.0, 0);             
            addRoad(30, 0, 0);
            let sChicane = addRoad(10, 0, 0); addProp(sChicane, 'sign', 1.5); 
            addRoad(15, -2.0, 0); addProp(segments.length-5, 'cone', -0.9);
            addRoad(5, 0, 0);     
            addRoad(15, 2.0, 0); addProp(segments.length-5, 'cone', 0.9);
            addRoad(10, 0, 0);    
            let sLoop = addRoad(20, 0, 0); addProp(sLoop, 'sign', 1.5); addProp(sLoop+5, 'sign', 1.5);
            addRoad(10, -1.0, 0); 
            addRoad(50, -3.0, 0); 
            addRoad(10, -1.0, 0); 
            let sHazards = addRoad(60, 0, 0);
            addProp(sHazards + 10, 'cone', 0); addProp(sHazards + 30, 'cone', -0.5); addProp(sHazards + 50, 'cone', 0.5);
            addRoad(40, 1.2, 0);

            trackLength = segments.length * SEGMENT_LENGTH;
        },
        
        // --- UI E CONTROLES ---
        setupUI: function() {
            if(document.getElementById('nitro-btn')) document.getElementById('nitro-btn').remove();
            nitroBtn = document.createElement('div');
            nitroBtn.id = 'nitro-btn';
            nitroBtn.innerHTML = "NITRO";
            // Estilo Cyberpunk/Arcade
            Object.assign(nitroBtn.style, {
                position: 'absolute', top: '35%', right: '20px', width: '90px', height: '90px',
                borderRadius: '50%', background: 'radial-gradient(#ffaa00, #cc5500)', border: '4px solid #fff',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Russo One', sans-serif", fontSize: '18px', cursor: 'pointer',
                boxShadow: '0 0 25px rgba(255, 100, 0, 0.6)', zIndex: '100', userSelect: 'none', 
                transition: 'transform 0.1s, filter 0.1s', pointerEvents: 'auto'
            });

            // Handlers de Input (Touch/Mouse Unificados)
            const activate = (e) => { 
                if(e.cancelable) e.preventDefault(); 
                e.stopPropagation();
                this.btnNitroActive = true; 
                nitroBtn.style.transform = 'scale(0.9)'; 
                nitroBtn.style.filter = 'brightness(1.5)';
            };
            const deactivate = (e) => { 
                if(e.cancelable) e.preventDefault(); 
                e.stopPropagation();
                this.btnNitroActive = false; 
                nitroBtn.style.transform = 'scale(1.0)'; 
                nitroBtn.style.filter = 'brightness(1.0)';
            };
            
            nitroBtn.addEventListener('mousedown', activate);
            nitroBtn.addEventListener('touchstart', activate, {passive: false});
            nitroBtn.addEventListener('mouseup', deactivate);
            nitroBtn.addEventListener('touchend', deactivate);
            nitroBtn.addEventListener('mouseleave', deactivate);
            
            document.getElementById('game-ui').appendChild(nitroBtn);
        },

        // --- INICIALIZAÇÃO ---
        init: function() { 
            this.buildTrack();
            this.setupUI();
            
            // Resets de Estado
            this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0; this.rawSteer = 0;
            this.score = 0; this.lap = 1; this.time = 0; 
            this.state = 'race'; this.finishTimer = 0; this.isLastLap = false;
            this.skyColor = 0;
            particles = []; 
            
            // Reset de Input & Tracking
            this.inputState = 0;
            this.tracking = {
                hands: { left: null, right: null },
                lastAngle: 0,
                lossTimer: 0,
                isTracking: false,
                virtualWheel: { x:0, y:0, r:0, a:0, opacity:0 }
            };
            
            // Reset Drift & Nitro
            this.driftState = 0; this.driftCharge = 0; this.mtStage = 0; this.boostTimer = 0; this.grip = 1.0;
            this.nitro = 100; this.btnNitroActive = false; this.isNitroActive = false;

            // Reset Rival
            this.rival.pos = 1000; this.rival.x = 0.5; this.rival.speed = 0; 
            this.rival.lap = 1; this.rival.finished = false; this.rival.offset = 0;
            this.rival.passedCheck = false;
            
            // Sequência de Largada
            window.System.msg("LIGAR MOTORES"); 
            window.Sfx.play(100, 'sawtooth', 0.5, 0.2); 
            setTimeout(() => { window.System.msg("3..."); window.Sfx.play(200, 'square', 0.2, 0.1); }, 1000);
            setTimeout(() => { window.System.msg("2..."); window.Sfx.play(200, 'square', 0.2, 0.1); }, 2000);
            setTimeout(() => { window.System.msg("1..."); window.Sfx.play(200, 'square', 0.2, 0.1); }, 3000);
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
            // 1. PROCESSAMENTO DE INPUT (CAMADA DE ESTABILIDADE WII)
            // -----------------------------------------------------------------
            
            let detectedHands = 0;
            let currentLeft = null;
            let currentRight = null;
            let gestureTrigger = false;

            // Análise Bruta da Pose (Se existir)
            if(d.state === 'race' && pose && pose.keypoints) {
                const kp = pose.keypoints;
                const lw = kp.find(k => k.name === 'left_wrist' || k.name === 'leftWrist');
                const rw = kp.find(k => k.name === 'right_wrist' || k.name === 'rightWrist');
                
                // Score threshold ajustado para evitar falsos positivos
                const validL = lw && lw.score > 0.45;
                const validR = rw && rw.score > 0.45;

                if(validL) { currentLeft = window.Gfx.map(lw, w, h); detectedHands++; }
                if(validR) { currentRight = window.Gfx.map(rw, w, h); detectedHands++; }

                // Detecção de Gesto Nitro (Mão levantada alto)
                // Se apenas uma mão é detectada e está na parte superior da tela (30%)
                if(detectedHands === 1) {
                    const activeHand = validL ? currentLeft : currentRight;
                    if(activeHand && activeHand.y < h * 0.3) {
                        gestureTrigger = true;
                    }
                }
            }

            // Lógica de Persistência de Estado (Anti-Jitter / Grace Period)
            if (detectedHands === 2) {
                // TRACKING PERFEITO: Atualiza dados
                d.tracking.isTracking = true;
                d.tracking.lossTimer = 0;
                d.tracking.hands.left = currentLeft;
                d.tracking.hands.right = currentRight;
                d.inputState = 2; // Direção Ativa

                // Cálculo do Ângulo do Volante Virtual
                const dx = currentRight.x - currentLeft.x;
                const dy = currentRight.y - currentLeft.y;
                const angle = Math.atan2(dy, dx);
                
                // Zona Morta e Sensibilidade
                if(Math.abs(angle) > CONF.DEADZONE) {
                    d.tracking.lastAngle = angle * window.System.sens * 2.5; 
                } else {
                    d.tracking.lastAngle = 0;
                }

                // Atualiza UI Volante
                const midX = (currentLeft.x + currentRight.x) / 2;
                const midY = (currentLeft.y + currentRight.y) / 2;
                const dist = Math.hypot(dx, dy);
                
                d.tracking.virtualWheel.x += (midX - d.tracking.virtualWheel.x) * 0.2;
                d.tracking.virtualWheel.y += (midY - d.tracking.virtualWheel.y) * 0.2;
                d.tracking.virtualWheel.r += ((dist/2) - d.tracking.virtualWheel.r) * 0.1;
                d.tracking.virtualWheel.opacity = Math.min(1, d.tracking.virtualWheel.opacity + 0.1);

            } else if (detectedHands === 1) {
                // TRACKING PARCIAL: Mantém input de direção anterior se recente, senão decai
                d.tracking.lossTimer++;
                d.inputState = 1;
                
                // Se perdemos a direção, o volante desvanece
                d.tracking.virtualWheel.opacity *= 0.9;
                
                // Auto-center lento
                d.tracking.lastAngle *= 0.92;

            } else {
                // PERDA TOTAL: Entra no Grace Period
                d.tracking.lossTimer++;
                d.inputState = 0;
                d.tracking.virtualWheel.opacity *= 0.8;

                if (d.tracking.lossTimer < CONF.POSE_GRACE_PERIOD) {
                    // MANTÉM O ÚLTIMO INPUT VÁLIDO (Inércia Mental)
                    // Isso permite piscar ou mover rápido sem o carro perder controle
                } else {
                    // Perda definitiva: Auto-center rápido
                    d.tracking.lastAngle *= 0.85;
                }
            }

            // Define o alvo de direção baseado no estado processado
            let targetSteer = 0;
            if(d.inputState === 2 || d.tracking.lossTimer < CONF.POSE_GRACE_PERIOD) {
                targetSteer = d.tracking.lastAngle;
            }

            // Suavização Final (Lerp) para evitar movimentos robóticos
            d.steer += (targetSteer - d.steer) * CONF.INPUT_SMOOTHING;
            
            // Clamp rigoroso para evitar NaN ou valores infinitos
            d.steer = Math.max(-1.5, Math.min(1.5, d.steer));

            // -----------------------------------------------------------------
            // 2. LÓGICA DE AÇÃO E ESTADO (TURBO / ACELERAÇÃO)
            // -----------------------------------------------------------------
            
            // Determina intenção de Nitro (Físico OU Gesto)
            const requestNitro = d.btnNitroActive || gestureTrigger;
            
            if (requestNitro && d.nitro > 0) {
                d.isNitroActive = true;
                d.nitro = Math.max(0, d.nitro - CONF.NITRO_DRAIN);
                // Feedback visual de input
                if(d.nitro % 10 < 5) window.Gfx.shake(1);
            } else {
                d.isNitroActive = false;
                if (!requestNitro && d.nitro < CONF.NITRO_MAX) {
                    d.nitro = Math.min(CONF.NITRO_MAX, d.nitro + CONF.NITRO_RECHARGE);
                }
            }

            // Acelerador Automático Inteligente
            // O carro anda se: Tem controle (mãos) OU Nitro ativo OU está no Grace Period
            const isGasPressed = (d.inputState >= 1) || d.isNitroActive || (d.tracking.lossTimer < CONF.POSE_GRACE_PERIOD);

            // -----------------------------------------------------------------
            // 3. FÍSICA E DINÂMICA DE MOVIMENTO
            // -----------------------------------------------------------------
            
            // Define limites baseados no terreno e estado
            let activeMaxSpeed = CONF.MAX_SPEED;
            let activeAccel = CONF.ACCEL;

            // Modificadores de Estado
            if (d.isNitroActive) {
                activeMaxSpeed = CONF.TURBO_MAX_SPEED;
                activeAccel = CONF.TURBO_BOOST;
            } else if (d.boostTimer > 0) {
                // Boost de Drift
                activeMaxSpeed = CONF.MAX_SPEED + 80;
                activeAccel = CONF.ACCEL * 3;
                d.boostTimer--;
            }

            // Física Offroad (Grama)
            const isOffRoad = Math.abs(d.playerX) > 2.2;
            if (isOffRoad && !d.isNitroActive && d.boostTimer <= 0) {
                activeMaxSpeed = CONF.OFFROAD_LIMIT;
                // Se estiver muito rápido na grama, freia forte
                if(d.speed > activeMaxSpeed) d.speed *= 0.90;
            }

            // Integração da Velocidade
            if (isGasPressed && d.state === 'race') {
                if (d.speed < activeMaxSpeed) {
                    d.speed += activeAccel;
                } else {
                    // Decaimento natural
                    d.speed += (activeMaxSpeed - d.speed) * 0.05;
                }
            } else {
                // Freio motor / Atrito
                d.speed *= (isOffRoad ? 0.90 : CONF.FRICTION);
            }
            
            // Prevenção de valores negativos
            if(d.speed < 0) d.speed = 0;

            // Lógica de Curva e Força Centrifuga
            const currentSegIndex = Math.floor(d.pos / SEGMENT_LENGTH) % segments.length;
            const currentSeg = segments[currentSegIndex];
            const speedRatio = d.speed / CONF.MAX_SPEED;

            // DRIFT MECHANIC (Mario Kart Style)
            // Entrada: Curva forte + Velocidade + Input Direcional
            if (d.driftState === 0) {
                if (Math.abs(d.steer) > 0.8 && speedRatio > 0.6 && d.inputState === 2) {
                    d.driftState = 1; 
                    d.driftDir = Math.sign(d.steer);
                    d.driftCharge = 0; 
                    d.mtStage = 0; 
                    d.bounce = -10; // Pulo do kart
                    window.Sfx.skid();
                }
            } 
            else if (d.driftState === 1) {
                // Manutenção: O jogador deve "segurar" a curva
                // Saída: Soltou o volante ou velocidade caiu
                if (Math.abs(d.steer) < 0.2 || speedRatio < 0.3) {
                    // Liberação do Mini-Turbo
                    if (d.mtStage > 0) {
                        const boostLevels = [0, 40, 90]; // Frames de boost
                        d.boostTimer = boostLevels[d.mtStage];
                        d.nitro = Math.min(CONF.NITRO_MAX, d.nitro + (d.mtStage * 15));
                        window.System.msg(d.mtStage === 2 ? "SUPER TURBO!" : "TURBO!");
                        window.Sfx.play(600 + (d.mtStage*200), 'square', 0.3, 0.2);
                        d.stats.drifts++;
                    }
                    d.driftState = 0;
                } else {
                    // Acumulando Carga
                    d.driftCharge += 1 + (Math.abs(d.steer) * 0.5);
                    
                    if (d.driftCharge > 180) d.mtStage = 2; // Laranja
                    else if (d.driftCharge > 80) d.mtStage = 1; // Azul
                    else d.mtStage = 0;

                    // Partículas do Drift
                    if (d.time % 5 === 0) {
                        const color = d.mtStage === 2 ? '#ff6600' : (d.mtStage === 1 ? '#00ffff' : '#ffffaa');
                        const pX = cx + (d.playerX * w * 0.4) + (d.driftDir * 60);
                        particles.push({
                            x: pX, y: h * 0.88, 
                            vx: -d.driftDir * (Math.random()*5), vy: -Math.random()*5, 
                            c: color, l: 20
                        });
                    }
                }
            }

            // Aplicação Lateral (Grip vs Centrifuga)
            d.grip = d.driftState === 1 ? 0.95 : 1.0; 
            
            const turnForce = d.steer * (d.driftState === 1 ? 0.09 : 0.07);
            d.centrifugal = (currentSeg.curve * (speedRatio * speedRatio)) * CONF.CENTRIFUGAL;
            
            d.playerX += (turnForce * d.grip) - d.centrifugal;

            // Limites da Pista
            if(d.playerX > 3.0) d.playerX = 3.0; 
            if(d.playerX < -3.0) d.playerX = -3.0;

            // -----------------------------------------------------------------
            // 4. LÓGICA DO RIVAL (IA)
            // -----------------------------------------------------------------
            if(!d.rival.finished) {
                const dist = d.rival.pos - d.pos; 
                let targetAISpeed = d.maxSpeed * 0.96;

                if (d.isLastLap) targetAISpeed *= 1.08; 
                
                // Rubber Banding
                if (dist > 800) targetAISpeed *= 0.8; 
                if (dist < -500) targetAISpeed *= 1.2; 
                if (dist < 200 && dist > -200) targetAISpeed = d.speed * 1.02;

                // Física da IA
                d.rival.speed += (targetAISpeed - d.rival.speed) * 0.05;
                d.rival.pos += d.rival.speed;
                
                // IA faz curvas
                const rivalSegIdx = Math.floor(d.rival.pos / SEGMENT_LENGTH) % segments.length;
                const rivalSeg = segments[rivalSegIdx];
                const perfectLine = -rivalSeg.curve * 0.5;
                
                d.rival.offset += (Math.random() - 0.5) * 0.05;
                d.rival.offset *= 0.98;
                d.rival.x += (perfectLine + d.rival.offset - d.rival.x) * 0.05;

                // Loop de Volta Rival
                if (d.rival.pos >= trackLength) {
                    d.rival.pos -= trackLength;
                    d.rival.lap++;
                    if (d.rival.lap > d.totalLaps) d.rival.finished = true;
                }

                // Detecção de Ultrapassagem
                const rawDist = d.rival.pos - d.pos;
                let normalizedDist = rawDist;
                if (normalizedDist > trackLength/2) normalizedDist -= trackLength;
                if (normalizedDist < -trackLength/2) normalizedDist += trackLength;

                if (Math.abs(normalizedDist) < 100 && d.speed > d.rival.speed && !d.rival.passedCheck) {
                    if(normalizedDist < 0) { // Rival ficou pra trás
                        d.stats.overtakes++;
                        window.System.msg("ULTRAPASSAGEM!");
                        d.nitro = Math.min(CONF.NITRO_MAX, d.nitro + 25);
                        d.rival.passedCheck = true; 
                    }
                }
                if (Math.abs(normalizedDist) > 500) d.rival.passedCheck = false;
            }

            // -----------------------------------------------------------------
            // 5. PROGRESSÃO E MUNDO
            // -----------------------------------------------------------------
            d.pos += d.speed;
            
            while (d.pos >= trackLength) {
                d.pos -= trackLength;
                if (d.state === 'race') {
                    d.lap++;
                    if (d.lap > d.totalLaps) {
                        d.state = 'finished';
                        const win = !d.rival.finished;
                        window.System.msg(win ? "VENCEDOR!" : "FINALIZADO!");
                        if (win) { d.score += 10000; window.Sfx.play(1000, 'square', 0.5, 0.5); }
                        for(let i=0;i<60;i++) particles.push({x:cx, y:h*0.5, vx:(Math.random()-0.5)*20, vy:(Math.random()-0.5)*20, c:Math.random()<0.5?'#ff0':'#fff', l:80});
                    } else {
                        window.System.msg(d.lap === d.totalLaps ? "ÚLTIMA VOLTA!" : "VOLTA " + d.lap);
                        window.Sfx.coin();
                        if(d.lap === d.totalLaps) {
                            d.skyColor = 1; 
                            window.Sfx.play(800, 'sawtooth', 0.8, 0.5);
                        }
                    }
                }
            }
            while (d.pos < 0) d.pos += trackLength;

            if (d.state === 'finished') {
                d.speed *= 0.95;
                if (d.speed < 5 && d.finishTimer === 0) {
                    d.finishTimer = 1;
                    setTimeout(() => window.System.gameOver(d.score), 2500);
                }
            }

            // Efeitos Visuais
            d.visualTilt += ((d.steer * 25) - d.visualTilt) * 0.15;
            d.bounce *= 0.8;
            if (isOffRoad) d.bounce = (Math.random() - 0.5) * (d.speed * 0.1);

            d.time++;
            d.score += (d.speed * 0.01);

            // -----------------------------------------------------------------
            // 6. RENDERIZAÇÃO (ENGINE GRÁFICA PSEUDO-3D)
            // -----------------------------------------------------------------
            
            // Céu
            let topSky = d.skyColor === 0 ? "#00aaff" : "#663399";
            let botSky = d.skyColor === 0 ? "#cceeff" : "#ffaa00";
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, topSky); gradSky.addColorStop(1, botSky);
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

            // Montanhas
            const bgOffset = (currentSeg.curve * 50) + (d.steer * 30);
            ctx.fillStyle = d.skyColor === 0 ? '#65a65a' : '#442244';
            ctx.beginPath(); ctx.moveTo(0, horizon);
            for(let i=0; i<=10; i++) {
                const mx = (w/10 * i) - (bgOffset * 0.5);
                const my = horizon - 40 - Math.sin(i + d.pos*0.0005)*30;
                ctx.lineTo(mx, my);
            }
            ctx.lineTo(w, horizon); ctx.fill();

            // Chão Base
            ctx.fillStyle = isOffRoad ? '#4a7c30' : '#5cab40';
            ctx.fillRect(0, horizon, w, h-horizon);

            // Pista (Z-Buffer Painter's Algorithm)
            let drawDistance = 50;
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

                const grassColor = (seg.color === 'dark') ? '#5cab40' : '#65bd48';
                const roadColor = (seg.color === 'dark') ? '#666666' : '#636363';
                const rumbleColor = (seg.color === 'dark') ? '#cc0000' : '#ffffff';

                ctx.fillStyle = grassColor; 
                ctx.fillRect(0, screenYNext, w, screenY - screenYNext);

                ctx.fillStyle = rumbleColor;
                ctx.beginPath(); 
                ctx.moveTo(screenX - roadWidth/2 - roadWidth*0.1, screenY); 
                ctx.lineTo(screenX + roadWidth/2 + roadWidth*0.1, screenY);
                ctx.lineTo(screenXNext + roadWidthNext/2 + roadWidthNext*0.1, screenYNext); 
                ctx.lineTo(screenXNext - roadWidthNext/2 - roadWidthNext*0.1, screenYNext); 
                ctx.fill();

                ctx.fillStyle = roadColor;
                ctx.beginPath(); 
                ctx.moveTo(screenX - roadWidth/2, screenY); 
                ctx.lineTo(screenX + roadWidth/2, screenY);
                ctx.lineTo(screenXNext + roadWidthNext/2, screenYNext); 
                ctx.lineTo(screenXNext - roadWidthNext/2, screenYNext); 
                ctx.fill();
            }

            // Sprites (Trás para Frente)
            for(let n = drawDistance-1; n >= 0; n--) {
                const coord = segmentCoords[n];
                const seg = segments[coord.index];
                
                // Rival
                let rivalRelPos = d.rival.pos - d.pos;
                if(rivalRelPos < -trackLength/2) rivalRelPos += trackLength;
                if(rivalRelPos > trackLength/2) rivalRelPos -= trackLength;
                
                let distInSegs = Math.floor(rivalRelPos / SEGMENT_LENGTH);
                if (Math.abs(distInSegs - n) < 1 && n > 2) {
                    const rScale = coord.scale;
                    const rX = coord.x + (d.rival.x * (w * 3) * rScale / 2);
                    const rY = coord.y;
                    
                    ctx.save(); ctx.translate(rX, rY); ctx.scale(rScale * 10, rScale * 10);
                    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 3, 0, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = '#00aa00'; ctx.fillRect(-6, -8, 12, 6);
                    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -12, 4, 0, Math.PI*2); ctx.fill();
                    ctx.restore();
                }

                // Obstáculos
                if(seg.obs.length > 0) {
                    seg.obs.forEach(o => {
                        const sScale = coord.scale;
                        const sX = coord.x + (o.x * (w * 3) * sScale / 2);
                        const sY = coord.y;
                        const size = (w * 0.2) * sScale;

                        if (o.type === 'cone') {
                            ctx.fillStyle = '#ff5500'; 
                            ctx.beginPath(); ctx.moveTo(sX, sY - size); 
                            ctx.lineTo(sX - size*0.25, sY); ctx.lineTo(sX + size*0.25, sY); ctx.fill();
                        } else {
                            ctx.fillStyle = '#f1c40f'; 
                            ctx.fillRect(sX - size/2, sY - size, size, size*0.6);
                            ctx.fillStyle = '#000'; ctx.textAlign='center'; 
                            ctx.font = `bold ${size*0.4}px Arial`;
                            ctx.fillText(seg.curve > 0 ? ">>>" : "<<<", sX, sY - size*0.2);
                        }

                        if (n < 3 && Math.abs(d.playerX - o.x) < 0.6) {
                            d.speed *= 0.6; 
                            d.stats.crashes++;
                            d.score -= 100;
                            o.x = 999; 
                            window.Gfx.shake(15); 
                            window.Sfx.crash();
                            window.System.msg("CRASH!");
                        }
                    });
                }
            }

            // 7. RENDERIZAÇÃO DO JOGADOR
            const carScale = w * 0.0055;
            ctx.save(); 
            ctx.translate(cx, h * 0.85 + d.bounce); 
            ctx.scale(carScale, carScale);
            
            let visualRotation = d.visualTilt * 0.02; 
            if (d.driftState === 1) visualRotation += (d.driftDir * 0.3);
            ctx.rotate(visualRotation);

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; 
            ctx.beginPath(); ctx.ellipse(0, 35, 60, 15, 0, 0, Math.PI*2); ctx.fill();

            // Chassi
            const gradBody = ctx.createLinearGradient(-30, 0, 30, 0);
            gradBody.addColorStop(0, '#aa0000'); gradBody.addColorStop(0.5, '#ff4444'); gradBody.addColorStop(1, '#aa0000');
            ctx.fillStyle = gradBody;
            
            ctx.beginPath(); 
            ctx.moveTo(-25, -30); ctx.lineTo(25, -30);
            ctx.lineTo(40, 10); ctx.lineTo(10, 35);
            ctx.lineTo(-10, 35); ctx.lineTo(-40, 10);
            ctx.fill();

            // Fogo
            if (d.isNitroActive || d.boostTimer > 0) {
                const fireSize = 10 + Math.random() * 10;
                ctx.fillStyle = (d.mtStage === 2 || d.isNitroActive) ? '#00ffff' : '#ffff00';
                ctx.beginPath(); ctx.arc(-20, -30, fireSize, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(20, -30, fireSize, 0, Math.PI*2); ctx.fill();
            }

            // Rodas
            const wheelAngle = d.steer * 0.8;
            ctx.fillStyle = '#222';
            const drawWheel = (wx, wy) => {
                ctx.save(); ctx.translate(wx, wy); ctx.rotate(wheelAngle);
                ctx.fillRect(-12, -15, 24, 30);
                ctx.fillStyle = '#888'; ctx.fillRect(-5, -5, 10, 10); ctx.fillStyle = '#222';
                ctx.restore();
            };
            drawWheel(-45, 15); drawWheel(45, 15);
            ctx.fillRect(-50, -25, 20, 30); ctx.fillRect(30, -25, 20, 30);

            // Piloto
            ctx.save(); 
            ctx.translate(0, -10);
            ctx.rotate(d.steer * 0.4);
            ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, -20, 18, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#333'; ctx.fillRect(-15, -25, 30, 8);
            ctx.fillStyle = 'red'; ctx.font='bold 12px Arial'; ctx.textAlign='center'; ctx.fillText('M', 0, -32);
            ctx.restore();

            ctx.restore(); 

            // Partículas
            particles.forEach((p, i) => { 
                p.x += p.vx; p.y += p.vy; p.l--; 
                if(p.l<=0) particles.splice(i,1); 
                else { 
                    ctx.fillStyle=p.c; 
                    ctx.globalAlpha = p.l / 50;
                    ctx.beginPath(); ctx.arc(p.x, p.y, Math.random()*5, 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1.0;
                } 
            });

            // 8. HUD & INTERFACE
            if(d.state === 'race') {
                const hudX = w - 80; const hudY = h - 60;
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; 
                ctx.beginPath(); ctx.arc(hudX, hudY, 55, 0, Math.PI*2); ctx.fill();
                
                ctx.beginPath(); ctx.arc(hudX, hudY, 50, Math.PI, Math.PI + (Math.PI * (d.speed/CONF.MAX_SPEED)));
                ctx.lineWidth = 6; ctx.strokeStyle = d.isNitroActive ? '#00ffff' : '#ff0000'; ctx.stroke();

                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; 
                ctx.font = "bold 36px 'Russo One'"; ctx.fillText(Math.floor(d.speed), hudX, hudY + 10);
                ctx.font = "10px Arial"; ctx.fillText("KM/H", hudX, hudY + 25);

                const nW = 200;
                ctx.fillStyle = '#222'; ctx.fillRect(w/2 - nW/2, 20, nW, 15);
                ctx.fillStyle = d.nitro > 30 ? '#00ffff' : '#ff3333';
                ctx.fillRect(w/2 - nW/2 + 2, 22, (nW-4) * (d.nitro/CONF.NITRO_MAX), 11);
                ctx.font="bold 12px Arial"; ctx.fillStyle="#fff"; ctx.fillText("NITRO", w/2, 15);

                if (d.tracking.virtualWheel.opacity > 0.01) {
                    const vw = d.tracking.virtualWheel;
                    ctx.save(); 
                    ctx.globalAlpha = vw.opacity * 0.7;
                    ctx.translate(vw.x, vw.y);
                    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 8;
                    ctx.beginPath(); ctx.arc(0,0, vw.r, 0, Math.PI*2); ctx.stroke();
                    ctx.rotate(d.steer * 2.0);
                    ctx.fillStyle = '#3498db'; ctx.fillRect(-5, -vw.r, 10, 20);
                    ctx.restore();
                    ctx.globalAlpha = 1.0;
                }
            } 
            else {
                ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,w,h);
                ctx.fillStyle = "#fff"; ctx.textAlign="center"; 
                
                const title = (!d.rival.finished) ? "VITÓRIA!" : "2º LUGAR";
                const color = (!d.rival.finished) ? "#ffff00" : "#aaaaaa";
                
                ctx.font="bold 60px 'Russo One'"; ctx.fillStyle = color;
                ctx.fillText(title, cx, h*0.3);

                ctx.font="bold 24px Arial"; ctx.fillStyle = "#fff";
                ctx.fillText(`SCORE FINAL: ${Math.floor(d.score)}`, cx, h*0.45);
                
                ctx.font="18px Arial"; ctx.fillStyle = "#ccc";
                ctx.fillText(`DRIFTS: ${d.stats.drifts} | CRASHES: ${d.stats.crashes}`, cx, h*0.55);
            }

            return Math.floor(d.score);
        }
    };

    if(window.System) {
        window.System.registerGame('drive', 'Otto GP', '🏎️', Logic, {camOpacity: 0.4, showWheel: false});
    }
})();
