// =====================================================
// KART DO OTTO – GOLD MASTER (FREEZE BUILD FINAL)
// STATUS: COMMERCIAL RELEASE CANDIDATE
// MODULE: GAME_KART.JS
// ENGINEER: CODE 177
// =====================================================

(function() {
    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÃO DE ENGENHARIA (TUNING FINAL)
    // -----------------------------------------------------------------
    const CONF = {
        // Física de Velocidade
        MAX_SPEED: 235,         // Velocidade base (controlável)
        TURBO_MAX_SPEED: 420,   // Velocidade turbo (adrenalina)
        ACCEL: 1.5,
        FRICTION: 0.97,
        OFFROAD_DECEL: 0.88,
        
        // Física de Curva (Determinística)
        CENTRIFUGAL_FORCE: 0.38, // Força inercial (joga para fora)
        STEER_AUTHORITY: 0.12,   // Autoridade do volante
        GRIP_CARVING: 1.25,      // Bônus de tração ao fazer a curva certa
        GRIP_DRIFT: 0.94,        // Tração durante drift
        
        // Colisão & Gameplay
        HITBOX_WIDTH: 0.4,       // Largura de colisão justa
        CRASH_PENALTY: 0.55,     // Perda de velocidade ao bater
        
        // Input & UX
        DEADZONE: 0.05,
        INPUT_SMOOTHING: 0.12,
        TURBO_ZONE_Y: 0.35,      // Área superior da tela para gesto
        
        // Render
        DRAW_DISTANCE: 55,       // Distância de renderização (segmentos)
        FOV: 100
    };

    // -----------------------------------------------------------------
    // 2. VARIÁVEIS DE ESTADO (MEMORY SAFE)
    // -----------------------------------------------------------------
    let particles = [];
    let nitroBtn = null;
    
    // Dados da Pista
    const SEGMENT_LENGTH = 200; 
    const RUMBLE_LENGTH = 3;    
    let segments = [];
    let trackLength = 0;

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
        driftState: 0, driftDir: 0, driftCharge: 0, mtStage: 0, boostTimer: 0,    
        
        // Corrida
        state: 'race', 
        finishTimer: 0,
        lap: 1, totalLaps: 3,
        time: 0, rank: 1, score: 0,
        
        // Visuais
        visualTilt: 0,    
        bounce: 0,
        skyColor: 0, 
        stats: { drifts: 0, overtakes: 0, crashes: 0 },
        
        // Input
        inputState: 0, 
        gestureTimer: 0,
        virtualWheel: { x:0, y:0, r:0, opacity:0 },
        
        rivals: [],

        // -------------------------------------------------------------
        // CONSTRUÇÃO DE PISTA (OTTO GP - LAYOUT FINAL)
        // -------------------------------------------------------------
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

            // Traçado Profissional
            addRoad(50, 0, 0); 
            let s1 = addRoad(40, 0.8, 0); addProp(s1+15, 'sign', -1.6);
            addRoad(20, 0, 0);
            let s2 = addRoad(30, -1.2, 0); addProp(s2+10, 'cone', 0.9);
            addRoad(40, 0, 0);
            let s3 = addRoad(50, 2.3, 0); addProp(s3+25, 'sign', -1.6);
            addRoad(30, -2.1, 0);
            let s4 = addRoad(60, 0, 0); 
            addProp(s4+15, 'cone', -0.6); addProp(s4+35, 'cone', 0.6);
            addRoad(20, 0.5, 0);

            trackLength = segments.length * SEGMENT_LENGTH;
        },

        // -------------------------------------------------------------
        // SETUP DE UI (TURBO ISOLADO)
        // -------------------------------------------------------------
        setupUI: function() {
            // Remove instâncias antigas para evitar vazamento
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
                boxShadow: '0 0 20px rgba(255, 100, 0, 0.5)', cursor: 'pointer', transition: 'transform 0.1s, filter 0.1s',
                userSelect: 'none', touchAction: 'manipulation'
            });

            // Lógica Touch/Click Robusta
            const toggleTurbo = (e) => {
                if(e) { e.preventDefault(); e.stopPropagation(); }
                if(this.nitro > 5) {
                    this.turboLock = !this.turboLock;
                    nitroBtn.style.transform = this.turboLock ? 'scale(0.95)' : 'scale(1)';
                    nitroBtn.style.filter = this.turboLock ? 'brightness(1.5)' : 'brightness(1)';
                    if(this.turboLock) window.Sfx.play(600, 'square', 0.1, 0.1);
                }
            };
            nitroBtn.addEventListener('touchstart', toggleTurbo, {passive:false});
            nitroBtn.addEventListener('mousedown', toggleTurbo);
            
            document.getElementById('game-ui').appendChild(nitroBtn);
        },

        init: function() { 
            this.buildTrack();
            this.setupUI();
            
            this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0;
            this.state = 'race'; this.lap = 1; this.score = 0;
            this.driftState = 0; this.nitro = 100;
            
            // Rivais com IA Humanizada
            this.rivals = [
                { pos: 1000, x: -0.4, speed: 0, color: '#2ecc71', name: 'Luigi', aggro: 0.05, mistakeProb: 0.01 },
                { pos: 800,  x: 0.4,  speed: 0, color: '#3498db', name: 'Toad',  aggro: 0.04, mistakeProb: 0.005 },
                { pos: 1200, x: 0,    speed: 0, color: '#e74c3c', name: 'Bowser', aggro: 0.07, mistakeProb: 0.02 }
            ];

            window.System.msg("LARGADA!"); 
        },

        // =============================================================
        // GAME LOOP PRINCIPAL (SEPARAÇÃO PHYSICS / RENDER)
        // =============================================================
        update: function(ctx, w, h, pose) {
            
            // 1. UPDATE DETERMINÍSTICO (Física e Lógica)
            this.updatePhysics(w, h, pose);
            
            // 2. RENDER VISUAL (Sem alteração de estado)
            this.renderWorld(ctx, w, h);
            
            // 3. RENDER UI
            this.renderUI(ctx, w, h);

            return Math.floor(this.score);
        },

        // -------------------------------------------------------------
        // ENGINE DE FÍSICA (UPDATE)
        // -------------------------------------------------------------
        updatePhysics: function(w, h, pose) {
            const d = Logic;
            
            // --- A. INPUT SYSTEM ---
            let detected = 0;
            let pLeft = null, pRight = null;

            // Leitura de Pose (Vision)
            if (d.state === 'race' && pose && pose.keypoints) {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                
                if (lw && lw.score > 0.3) { pLeft = window.Gfx.map(lw, w, h); detected++; }
                if (rw && rw.score > 0.3) { pRight = window.Gfx.map(rw, w, h); detected++; }

                // Gesto Turbo (Mãos para cima)
                let avgY = h;
                if (detected === 2) avgY = (pLeft.y + pRight.y) / 2;
                else if (detected === 1) avgY = (pLeft ? pLeft.y : pRight.y);

                if (avgY < h * CONF.TURBO_ZONE_Y) {
                    d.gestureTimer++;
                    if (d.gestureTimer === 12 && d.nitro > 5) { 
                        d.turboLock = !d.turboLock; 
                        window.System.msg(d.turboLock ? "TURBO ON" : "TURBO OFF");
                    }
                } else {
                    d.gestureTimer = 0;
                }
            }

            // Cálculo do Volante
            if (detected === 2) {
                d.inputState = 2;
                const dx = pRight.x - pLeft.x;
                const dy = pRight.y - pLeft.y;
                const rawAngle = Math.atan2(dy, dx);
                d.targetSteer = (Math.abs(rawAngle) > CONF.DEADZONE) ? rawAngle * 2.3 : 0;
                
                // Feedback UI
                d.virtualWheel.x = (pLeft.x + pRight.x) / 2;
                d.virtualWheel.y = (pLeft.y + pRight.y) / 2;
                d.virtualWheel.r = Math.hypot(dx, dy) / 2;
                d.virtualWheel.opacity = 1;
            } else {
                d.inputState = 0;
                d.targetSteer = 0;
                d.virtualWheel.opacity *= 0.9;
            }
            
            // Suavização Input
            d.steer += (d.targetSteer - d.steer) * CONF.INPUT_SMOOTHING;
            d.steer = Math.max(-1.5, Math.min(1.5, d.steer));

            if(nitroBtn) nitroBtn.style.opacity = (detected > 0) ? 0.3 : 1.0;

            // --- B. FÍSICA DE VEÍCULO ---
            let currentMax = CONF.MAX_SPEED;
            
            // Gestão de Turbo
            if (d.turboLock && d.nitro > 0) {
                currentMax = CONF.TURBO_MAX_SPEED;
                d.nitro -= 0.6;
                if(d.nitro <= 0) { d.nitro = 0; d.turboLock = false; }
            } else {
                d.turboLock = false;
                d.nitro = Math.min(100, d.nitro + 0.15); // Recarga passiva
            }
            if(d.boostTimer > 0) { currentMax += 80; d.boostTimer--; }

            // Aceleração
            const hasGas = (d.inputState > 0 || d.turboLock);
            if (hasGas && d.state === 'race') {
                d.speed += (currentMax - d.speed) * 0.05;
            } else {
                d.speed *= CONF.FRICTION; // Desaceleração natural
            }

            // Punição Offroad
            const isOffRoad = Math.abs(d.playerX) > 2.2;
            if (isOffRoad) d.speed *= CONF.OFFROAD_DECEL;

            // --- C. DINÂMICA DE CURVA (CORE) ---
            const segIdx = Math.floor(d.pos / SEGMENT_LENGTH) % segments.length;
            const seg = segments[segIdx] || segments[0];
            const speedRatio = d.speed / CONF.MAX_SPEED;

            // 1. Inércia (Centrífuga): Sempre ativa, empurra para fora
            const centrifugal = -seg.curve * (speedRatio * speedRatio) * CONF.CENTRIFUGAL_FORCE;
            
            // 2. Tração (Grip): Só existe se houver input de direção
            let dynamicGrip = CONF.GRIP_CARVING; 
            if(d.driftState === 1) dynamicGrip = CONF.GRIP_DRIFT;
            
            // Se jogador não vira, playerForce = 0. Inércia vence.
            const playerForce = d.steer * CONF.STEER_AUTHORITY * dynamicGrip * speedRatio;
            
            d.playerX += playerForce + centrifugal;

            // Limites da Pista
            if(d.playerX < -4.5) { d.playerX = -4.5; d.speed *= 0.95; }
            if(d.playerX > 4.5)  { d.playerX = 4.5;  d.speed *= 0.95; }

            // Mecânica de Drift
            if (d.driftState === 0) {
                // Entrada no Drift (Hard Turn + Speed)
                if (Math.abs(d.steer) > 0.9 && speedRatio > 0.6 && !isOffRoad) {
                    d.driftState = 1; d.driftDir = Math.sign(d.steer);
                    d.driftCharge = 0; d.bounce = -8; window.Sfx.skid();
                }
            } else {
                // Manutenção do Drift
                if (Math.abs(d.steer) < 0.2 || speedRatio < 0.3 || isOffRoad) {
                    // Saída (Boost se carregado)
                    if (d.mtStage > 0) {
                        d.boostTimer = d.mtStage * 35;
                        window.System.msg("BOOST!");
                        window.Sfx.play(800, 'square', 0.2, 0.2);
                        d.stats.drifts++;
                    }
                    d.driftState = 0; d.mtStage = 0;
                } else {
                    // Carregamento
                    d.driftCharge++;
                    if(d.driftCharge > 80) d.mtStage = 2; else if(d.driftCharge > 35) d.mtStage = 1;
                }
            }

            // --- D. COLISÃO DETERMINÍSTICA ---
            // Verifica obstáculos no segmento atual e no próximo (Lookahead curto)
            for(let i=0; i<2; i++) {
                const checkIdx = (segIdx + i) % segments.length;
                const checkSeg = segments[checkIdx];
                if(checkSeg.obs.length > 0) {
                    checkSeg.obs.forEach(o => {
                        // Colisão simples por caixa
                        if(Math.abs(d.playerX - o.x) < CONF.HITBOX_WIDTH) {
                             d.speed *= CONF.CRASH_PENALTY;
                             d.stats.crashes++;
                             o.x = 999; // Remove obstáculo (State Change)
                             d.bounce = -15; // Visual Feedback
                             window.Sfx.crash();
                             window.Gfx.shake(15);
                        }
                    });
                }
            }

            // --- E. LOOP & RIVAIS ---
            d.pos += d.speed;
            while (d.pos >= trackLength) {
                d.pos -= trackLength;
                d.lap++;
                if(d.lap > d.totalLaps && d.state === 'race') {
                    d.state = 'finished';
                    window.System.msg(d.rank === 1 ? "VITORIA!" : "FIM!");
                    if(d.rank===1) window.Sfx.play(1000,'square',0.5,1);
                }
            }
            while(d.pos < 0) d.pos += trackLength;

            // Atualiza Rivais
            let pAhead = 0;
            d.rivals.forEach(r => {
                let dist = r.pos - d.pos;
                if(dist > trackLength/2) dist -= trackLength;
                if(dist < -trackLength/2) dist += trackLength;

                let targetS = CONF.MAX_SPEED * 0.96;
                // Rubber Banding
                if(dist > 1200) targetS *= 0.8;
                if(dist < -1200) targetS *= 1.2;
                
                r.speed += (targetS - r.speed) * r.aggro;
                r.pos += r.speed;
                if(r.pos >= trackLength) r.pos -= trackLength;

                const rSeg = segments[Math.floor(r.pos/SEGMENT_LENGTH)%segments.length];
                let idealLine = -(rSeg.curve * 0.6);
                if (Math.random() < r.mistakeProb) idealLine = -(rSeg.curve * -0.5); // Erro humano
                r.x += (idealLine - r.x) * 0.05;

                let rTotalPos = r.pos + ((d.lap-1)*trackLength);
                if(rTotalPos > d.pos + ((d.lap-1)*trackLength)) pAhead++;
            });
            d.rank = 1 + pAhead;

            // Timers & Score
            d.time++;
            d.score += d.speed * 0.01;
            d.bounce *= 0.8;
            if(isOffRoad) { d.bounce = Math.sin(d.time)*5; window.Gfx.shake(2); }
            d.visualTilt += (d.steer * 15 - d.visualTilt) * 0.1;
            
            if (d.state === 'finished') {
                d.speed *= 0.95;
                if(d.speed < 2 && d.finishTimer === 0) {
                    d.finishTimer = 1;
                    setTimeout(()=> window.System.gameOver(Math.floor(d.score)), 2000);
                }
            }
        },

        // -------------------------------------------------------------
        // RENDER: VISUAL PURO (SEM LÓGICA DE JOGO)
        // -------------------------------------------------------------
        renderWorld: function(ctx, w, h) {
            const d = Logic;
            const cx = w / 2;
            const horizon = h * 0.40;

            // 1. CÉU E PARALLAX
            const grad = ctx.createLinearGradient(0,0,0,horizon);
            grad.addColorStop(0, '#0099ff'); grad.addColorStop(1, '#88ccff');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,horizon);

            const segIdx = Math.floor(d.pos / SEGMENT_LENGTH) % segments.length;
            const seg = segments[segIdx] || segments[0];

            // Montanhas
            ctx.fillStyle = '#228822';
            const bgX = (seg.curve * 60) + (d.steer * 40); 
            ctx.beginPath(); ctx.moveTo(0, horizon);
            for(let i=0; i<=12; i++) {
                const mx = (w/12)*i - (bgX % (w/4));
                ctx.lineTo(mx, horizon - 40 + Math.sin(i)*15);
            }
            ctx.lineTo(w, horizon); ctx.fill();

            // 2. ESTRADA (PSEUDO-3D)
            ctx.fillStyle = '#336622'; // Offroad
            ctx.fillRect(0, horizon, w, h-horizon);

            let dx = 0;
            let camX = d.playerX * w * 0.35;
            let renderList = [];

            for(let n=0; n<CONF.DRAW_DISTANCE; n++) {
                const idx = (segIdx + n) % segments.length;
                const s = segments[idx];
                dx += s.curve;
                const z = n * 25; 
                
                const scale = 1 / (1 + (z*0.04));
                const scaleN = 1 / (1 + ((z+25)*0.04));
                
                const y1 = horizon + ((h-horizon)*scale);
                const y2 = horizon + ((h-horizon)*scaleN);
                
                const curveOff = dx * z * 0.01; 
                const curveOffN = (dx + s.curve) * (z+25) * 0.01;
                
                const x1 = cx - (camX * scale) - (curveOff * w * scale);
                const x2 = cx - (camX * scaleN) - (curveOffN * w * scaleN);
                
                const w1 = w * 2.5 * scale;
                const w2 = w * 2.5 * scaleN;

                renderList.push({s:s, x:x1, y:y1, sc:scale, idx:idx});

                // Desenha Trapézios
                const cGrass = s.color === 'dark' ? '#2d5e1e' : '#55aa44';
                const cRumble = s.color === 'dark' ? '#c00' : '#fff';
                const cRoad = s.color === 'dark' ? '#666' : '#777';

                ctx.fillStyle = cGrass; ctx.fillRect(0, y2, w, y1-y2);

                ctx.fillStyle = cRumble;
                ctx.beginPath();
                ctx.moveTo(x1-w1/2-w1*0.1, y1); ctx.lineTo(x1+w1/2+w1*0.1, y1);
                ctx.lineTo(x2+w2/2+w2*0.1, y2); ctx.lineTo(x2-w2/2-w2*0.1, y2);
                ctx.fill();

                ctx.fillStyle = cRoad;
                ctx.beginPath();
                ctx.moveTo(x1-w1/2, y1); ctx.lineTo(x1+w1/2, y1);
                ctx.lineTo(x2+w2/2, y2); ctx.lineTo(x2-w2/2, y2);
                ctx.fill();
            }

            // 3. SPRITES (Painter's Algorithm)
            for(let n=CONF.DRAW_DISTANCE-1; n>=0; n--) {
                const r = renderList[n];
                
                // Rivais
                d.rivals.forEach(rival => {
                    let rel = rival.pos - d.pos;
                    if(rel < -trackLength/2) rel += trackLength;
                    if(rel > trackLength/2) rel -= trackLength;
                    
                    const segDist = Math.floor(rel / SEGMENT_LENGTH);
                    if(segDist === n) {
                        const rx = r.x + (rival.x * w * 1.5 * r.sc);
                        const scale = r.sc;
                        this.drawKartSprite(ctx, rx, r.y, scale, rival.color, 0, 0);
                    }
                });

                // Obstáculos
                r.s.obs.forEach(o => {
                    if(o.x > 500) return; // Se foi "removido", não desenha
                    const ox = r.x + (o.x * w * 1.5 * r.sc);
                    const os = w * 0.25 * r.sc;
                    
                    if(o.type === 'cone') {
                        ctx.fillStyle = '#ff6600';
                        ctx.beginPath(); ctx.moveTo(ox, r.y-os); 
                        ctx.lineTo(ox-os*0.3, r.y); ctx.lineTo(ox+os*0.3, r.y); ctx.fill();
                    } else if (o.type === 'sign') {
                        ctx.fillStyle = '#f1c40f';
                        ctx.fillRect(ox-os/2, r.y-os, os, os*0.6);
                        ctx.fillStyle='#000'; ctx.textAlign='center'; ctx.font=`bold ${Math.ceil(os*0.4)}px Arial`;
                        ctx.fillText(r.s.curve>0?">>>":"<<<", ox, r.y-os*0.2);
                    }
                });
            }

            // 4. JOGADOR
            const carScale = w * 0.0008; 
            this.drawKartSprite(ctx, cx, h*0.85 + d.bounce, 1.0, '#d00', d.steer, d.visualTilt);
            
            // Partículas
            particles.forEach((p,i) => {
                p.x += p.vx; p.y += p.vy; p.l--;
                ctx.globalAlpha = p.l/20; ctx.fillStyle=p.c; 
                ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill();
                if(p.l<=0) particles.splice(i,1);
            });
            ctx.globalAlpha = 1;
        },

        // HELPER: Desenha Sprite do Kart
        drawKartSprite: function(ctx, x, y, scale, color, steer, tilt) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(tilt * 0.02);
            ctx.scale(scale, scale);

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.ellipse(0, 10, 50, 15, 0, 0, Math.PI*2); ctx.fill();

            // Chassi
            ctx.fillStyle = color;
            ctx.beginPath(); 
            ctx.moveTo(-30, -10); ctx.lineTo(30, -10); 
            ctx.lineTo(40, 20); ctx.lineTo(-40, 20); ctx.fill();
            
            // Spoiler
            ctx.fillStyle = '#880000'; ctx.fillRect(-35, -15, 70, 8);

            // Rodas
            ctx.fillStyle = '#111';
            const drawWheel = (wx, wy) => {
                ctx.save(); ctx.translate(wx, wy); ctx.rotate(steer * 0.5); 
                ctx.fillRect(-8, -12, 16, 24); ctx.restore();
            };
            drawWheel(-45, 15); drawWheel(45, 15); 
            drawWheel(-35, -5); drawWheel(35, -5); 

            // Piloto
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -15, 14, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#222'; ctx.fillRect(-10, -18, 20, 6);

            // Fogo Turbo
            const d = Logic;
            if(d && (d.turboLock || d.boostTimer > 0)) {
                ctx.fillStyle = (d.mtStage===2 || d.turboLock) ? '#0ff' : '#ff0';
                const f = Math.random()*15;
                ctx.beginPath(); ctx.arc(-20, 15, 8+f, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(20, 15, 8+f, 0, Math.PI*2); ctx.fill();
            }

            ctx.restore();
        },

        renderUI: function(ctx, w, h) {
            const d = Logic;
            const hudY = 30;
            const barW = 200;
            
            // Background
            ctx.fillStyle = '#222'; ctx.fillRect(w/2 - barW/2, hudY, barW, 20);
            
            // Barra Nitro
            const nColor = d.turboLock ? '#0ff' : (d.nitro>30 ? '#0d0' : '#d00');
            ctx.fillStyle = nColor; 
            ctx.fillRect(w/2 - barW/2 + 2, hudY + 2, (barW-4)*(d.nitro/100), 16);
            
            // Textos
            ctx.font="bold 20px Arial"; ctx.fillStyle="#fff"; 
            ctx.textAlign="right"; ctx.fillText(Math.floor(d.speed) + " KM/H", w-20, hudY+15);
            ctx.textAlign="left"; ctx.fillText("POS " + d.rank + "/4", 20, hudY+15);

            // Volante Virtual (Debug Visual)
            if(d.virtualWheel.opacity > 0) {
                const vw = d.virtualWheel;
                ctx.strokeStyle = `rgba(255,255,255,${vw.opacity})`;
                ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(vw.x, vw.y, vw.r, 0, Math.PI*2); ctx.stroke();
                
                const ix = vw.x + Math.cos(d.steer - Math.PI/2) * vw.r;
                const iy = vw.y + Math.sin(d.steer - Math.PI/2) * vw.r;
                ctx.fillStyle = '#0ff'; ctx.beginPath(); ctx.arc(ix, iy, 6, 0, Math.PI*2); ctx.fill();
            }
        }
    };

    if(window.System) {
        window.System.registerGame('drive', 'Otto Kart', '🏎️', Logic, {
            camOpacity: 0.4, 
            showWheel: false
        });
    }
})();
