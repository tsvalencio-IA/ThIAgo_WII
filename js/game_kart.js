// LÓGICA DO JOGO: KART DO OTTO (CIRCUITO FIXO - RIVAL & NITRO EDITION)
(function() {
    // Sistema de partículas e Elementos DOM
    let particles = [];
    let nitroBtn = null;
    
    // Configurações de Pista
    const SEGMENT_LENGTH = 200; 
    const RUMBLE_LENGTH = 3;    
    
    // Dados do Circuito
    let segments = [];
    let trackLength = 0;

    const Logic = {
        // --- FÍSICA E ESTADO ---
        speed: 0, 
        maxSpeed: 260,
        pos: 0,           
        playerX: 0,       
        steer: 0,         
        
        // --- RIVAL SYSTEM (ETAPA 4) ---
        rival: {
            pos: 1000,    // Começa um pouco a frente
            x: 0.5,
            speed: 0,
            lap: 1,
            finished: false,
            drift: 0
        },
        
        // --- NITRO SYSTEM (ETAPA 4) ---
        nitro: 0,         // 0 a 100
        maxNitro: 100,
        isNitroActive: false,
        
        // --- DRIFT SYSTEM ---
        driftState: 0,    
        driftDir: 0,      
        driftCharge: 0,   
        mtStage: 0,       
        boostTimer: 0,    
        
        // --- FÍSICA DE CORRIDA ---
        centrifugal: 0,   
        grip: 1.0,        
        
        // --- ATRIBUTOS ---
        health: 100, 
        score: 0,
        lap: 1,
        totalLaps: 3,
        time: 0,
        finished: false,
        
        // --- VISUAL ---
        visualTilt: 0,    
        bounce: 0,
        
        // --- INPUT ---
        inputState: 0,
        hands: { left: null, right: null },
        wheel: { radius: 0, x: 0, y: 0, opacity: 0, angle: 0 },
        
        // --- FUNÇÕES DE PISTA ---
        buildTrack: function() {
            segments = [];
            const addRoad = (enter, curve, y) => {
                const startIdx = segments.length;
                for(let i=0; i<enter; i++) {
                    segments.push({
                        curve: curve,
                        y: 0,
                        color: Math.floor(segments.length/RUMBLE_LENGTH)%2 ? 'dark' : 'light',
                        obs: []
                    });
                }
                return startIdx;
            };

            const addProp = (index, type, offset) => {
                if(segments[index]) segments[index].obs.push({ type: type, x: offset });
            };

            // LAYOUT "OTTO SPEEDWAY"
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
        
        setupUI: function() {
            // Remove botão antigo se existir
            if(document.getElementById('nitro-btn')) document.getElementById('nitro-btn').remove();

            // Cria Botão Nitro
            nitroBtn = document.createElement('div');
            nitroBtn.id = 'nitro-btn';
            nitroBtn.innerHTML = "NITRO";
            Object.assign(nitroBtn.style, {
                position: 'absolute', top: '20px', right: '20px', width: '90px', height: '90px',
                borderRadius: '50%', background: 'radial-gradient(#ffaa00, #cc5500)', border: '4px solid #fff',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Russo One', sans-serif", fontSize: '18px', cursor: 'pointer',
                boxShadow: '0 0 20px rgba(255, 100, 0, 0.5)', zIndex: '100', userSelect: 'none'
            });

            // Eventos Touch/Mouse
            const activate = (e) => { e.preventDefault(); this.isNitroActive = true; nitroBtn.style.transform = 'scale(0.9)'; };
            const deactivate = (e) => { e.preventDefault(); this.isNitroActive = false; nitroBtn.style.transform = 'scale(1.0)'; };
            
            nitroBtn.addEventListener('mousedown', activate);
            nitroBtn.addEventListener('touchstart', activate);
            nitroBtn.addEventListener('mouseup', deactivate);
            nitroBtn.addEventListener('touchend', deactivate);
            nitroBtn.addEventListener('mouseleave', deactivate);

            document.getElementById('game-ui').appendChild(nitroBtn);
        },

        init: function() { 
            this.buildTrack();
            this.setupUI();
            
            // Resets
            this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0;
            this.health = 100; this.score = 0; this.lap = 1; this.time = 0; this.finished = false;
            particles = []; this.inputState = 0;
            
            // Drift & Nitro
            this.driftState = 0; this.driftCharge = 0; this.mtStage = 0; this.boostTimer = 0; this.grip = 1.0;
            this.nitro = 50; // Começa com metade

            // Rival Reset
            this.rival.pos = 1000; this.rival.x = 0.5; this.rival.speed = 0; this.rival.lap = 1;
            
            // Som
            window.System.msg("LIGAR MOTORES"); 
            window.Sfx.play(100, 'sawtooth', 0.5, 0.2); 
            setTimeout(() => { window.System.msg("3..."); window.Sfx.play(200, 'square', 0.2, 0.1); }, 1000);
            setTimeout(() => { window.System.msg("2..."); window.Sfx.play(200, 'square', 0.2, 0.1); }, 2000);
            setTimeout(() => { window.System.msg("1..."); window.Sfx.play(200, 'square', 0.2, 0.1); }, 3000);
            setTimeout(() => { window.System.msg("VAI!"); window.Sfx.play(600, 'square', 1.0, 0.3); }, 4000);
        },
        
        update: function(ctx, w, h, pose) {
            const d = Logic; 
            if(d.finished) return;

            const cx = w / 2;
            const horizon = h * 0.40;

            // =================================================================
            // 1. INPUT & CONTROLES
            // =================================================================
            d.inputState = 0;
            let targetAngle = 0;

            if(pose) {
                const kp = pose.keypoints;
                const lw = kp.find(k=>k.name==='left_wrist');
                const rw = kp.find(k=>k.name==='right_wrist');
                
                if(lw && lw.score > 0.4) d.hands.left = window.Gfx.map(lw, w, h); else d.hands.left = null;
                if(rw && rw.score > 0.4) d.hands.right = window.Gfx.map(rw, w, h); else d.hands.right = null;

                if(d.hands.left && d.hands.right) {
                    d.inputState = 2; 
                    const p1 = d.hands.left; const p2 = d.hands.right;
                    const centerX = (p1.x + p2.x) / 2; const centerY = (p1.y + p2.y) / 2;
                    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                    
                    d.wheel.x += (centerX - d.wheel.x) * 0.2; d.wheel.y += (centerY - d.wheel.y) * 0.2;
                    d.wheel.radius += ((dist/2) - d.wheel.radius) * 0.1; d.wheel.opacity = Math.min(1, d.wheel.opacity + 0.1);

                    const rawAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                    let steerInput = Math.abs(rawAngle) < 0.08 ? 0 : rawAngle;
                    targetAngle = Math.sign(steerInput) * Math.pow(Math.abs(steerInput), 1.6) * 2.8 * window.System.sens;
                    
                    // Aceleração Base
                    let topSpeed = d.maxSpeed;
                    if(d.boostTimer > 0) topSpeed += 60;
                    
                    // Lógica Nitro
                    if(d.isNitroActive && d.nitro > 0) {
                        topSpeed += 100;
                        d.nitro -= 1; // Consumo
                        if(Math.random() > 0.5) particles.push({x:cx, y:h*0.85, vx:(Math.random()-0.5)*10, vy:10, c:'#ffaa00', l:10, s:10});
                        window.Gfx.shake(2);
                    }

                    if(d.speed < topSpeed) d.speed += 2;
                    else d.speed *= 0.99; 

                } else {
                    d.wheel.opacity *= 0.8; d.speed *= 0.98; targetAngle = 0;
                }
            }
            d.steer += (targetAngle - d.steer) * 0.10;
            d.steer = Math.max(-1.5, Math.min(1.5, d.steer));
            if(d.boostTimer > 0) d.boostTimer--;

            d.wheel.angle = d.steer;
            if(document.getElementById('visual-wheel')) document.getElementById('visual-wheel').style.opacity = '0'; 

            // =================================================================
            // 2. IA RIVAL (RUBBER BAND)
            // =================================================================
            // Avança o Rival
            let rivalSegIdx = Math.floor(d.rival.pos / SEGMENT_LENGTH) % segments.length;
            let rivalSeg = segments[rivalSegIdx];
            
            // IA Velocidade (Elástico)
            let distToPlayer = d.rival.pos - d.pos;
            // Corrige wrap-around do circuito
            if(distToPlayer > trackLength/2) distToPlayer -= trackLength;
            if(distToPlayer < -trackLength/2) distToPlayer += trackLength;

            let targetRivalSpeed = d.maxSpeed * 0.98;
            if(distToPlayer < -500) targetRivalSpeed = d.maxSpeed * 1.15; // Player fugiu -> Acelera muito
            else if (distToPlayer > 500) targetRivalSpeed = d.maxSpeed * 0.85; // Player para trás -> Espera
            
            d.rival.speed += (targetRivalSpeed - d.rival.speed) * 0.05;
            d.rival.pos += d.rival.speed;
            
            // Loop Pista Rival
            while(d.rival.pos >= trackLength) { d.rival.pos -= trackLength; d.rival.lap++; }

            // IA Direção (Segue a curva com atraso)
            let rivalTargetX = -rivalSeg.curve * 0.4; // Tenta fazer tangência
            // Erra se curva for difícil
            if(Math.abs(rivalSeg.curve) > 2.0 && Math.random() < 0.02) rivalTargetX = rivalSeg.curve * 1.5; // Erro!
            d.rival.x += (rivalTargetX - d.rival.x) * 0.05;

            // Ultrapassagem (Score)
            if(d.rival.pos > d.pos && d.rival.pos < d.pos + 100) {
                 // Rival acabou de passar?
            }

            // =================================================================
            // 3. FÍSICA JOGADOR
            // =================================================================
            d.pos += d.speed;
            while(d.pos >= trackLength) {
                d.pos -= trackLength; d.lap++;
                if(d.lap > d.totalLaps) { d.finished = true; window.System.gameOver("FIM! SCORE: " + d.score); } 
                else { window.System.msg("VOLTA " + d.lap); window.Sfx.coin(); }
            }
            while(d.pos < 0) d.pos += trackLength;

            const currentSegIndex = Math.floor(d.pos / SEGMENT_LENGTH) % segments.length;
            const currentSeg = segments[currentSegIndex];
            const speedRatio = d.speed / d.maxSpeed;
            
            // Drift Logic
            if(d.driftState === 0) {
                if(d.inputState === 2 && Math.abs(d.steer) > 0.9 && speedRatio > 0.6) {
                    d.driftState = 1; d.driftDir = Math.sign(d.steer);
                    d.driftCharge = 0; d.mtStage = 0; d.bounce = -12; window.Sfx.skid();
                }
            } else if (d.driftState === 1) {
                if(Math.abs(d.steer) < 0.4) {
                    if(d.mtStage > 0) {
                        let boost = d.mtStage === 2 ? 50 : 30;
                        d.speed += boost; d.boostTimer = d.mtStage === 2 ? 80 : 40;
                        d.nitro = Math.min(100, d.nitro + (d.mtStage*10)); // Recarrega Nitro
                        window.System.msg("TURBO!"); window.Sfx.play(600, 'square', 0.2, 0.1);
                    }
                    d.driftState = 0; 
                } else if (speedRatio < 0.3) { d.driftState = 0; }
                else {
                    d.driftCharge++;
                    if(d.driftCharge > 150) d.mtStage = 2; else if(d.driftCharge > 60) d.mtStage = 1; else d.mtStage = 0;
                    if(d.driftCharge % 6 === 0) {
                        let c = d.mtStage === 2 ? '#ff6600' : (d.mtStage === 1 ? '#00ffff' : '#ffff00');
                        particles.push({x:cx+(d.playerX*w*0.4)+(d.driftDir*45), y:h*0.85+25, vx:-d.driftDir*5, vy:-5, c:c, l:15});
                    }
                }
            }

            d.grip = d.driftState === 1 ? 0.94 : 1.0;
            let tr = d.steer * 0.06 * (d.driftState===0 && speedRatio>0.8 ? 0.85 : 1.0);
            if(d.driftState===1) tr = d.steer * 0.085;
            
            d.centrifugal = (currentSeg.curve * speedRatio * speedRatio) * 0.085;
            d.playerX += (tr * d.grip) - d.centrifugal;

            // Offroad
            let isOffRoad = false;
            if(d.playerX > 2.2 || d.playerX < -2.2) {
                isOffRoad = true;
                d.speed *= 0.92; d.driftState = 0; d.mtStage = 0;
                if(d.speed > 60) window.Gfx.shake(3);
            }
            if(d.playerX > 3.5) d.playerX = 3.5; if(d.playerX < -3.5) d.playerX = -3.5;

            // Visual Tilt
            d.visualTilt += ((d.steer * 20) - d.visualTilt) * 0.1;
            d.visualTilt = Math.max(-45, Math.min(45, d.visualTilt));
            d.bounce *= 0.8; if(isOffRoad) d.bounce = (Math.random()-0.5) * 12;

            // =================================================================
            // 4. RENDERIZAÇÃO
            // =================================================================
            const bgOffset = (currentSeg.curve * 100) + (d.steer * 50);
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, "#00aaff"); gradSky.addColorStop(1, "#cceeff");
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

            // Montanhas
            ctx.fillStyle = '#65a65a'; ctx.beginPath(); ctx.moveTo(0, horizon);
            for(let i=0; i<=10; i++) ctx.lineTo((w/10 * i) - (bgOffset * 0.2), horizon - 30 - Math.sin(i + d.pos*0.001)*20);
            ctx.lineTo(w, horizon); ctx.fill();

            // Pista
            ctx.fillStyle = isOffRoad ? '#4a7c30' : '#5cab40'; ctx.fillRect(0, horizon, w, h-horizon);

            let drawDistance = 40; 
            let dx = 0; 
            let camX = d.playerX * (w * 0.35); 
            let segmentCoords = [];

            // 4.1 Loop de Segmentos (Pista)
            for(let n = 0; n < drawDistance; n++) {
                const segIdx = (currentSegIndex + n) % segments.length;
                const seg = segments[segIdx];
                dx += (seg.curve * 0.5); 
                const z = n * 20; const scale = 1 / (1 + (z * 0.05)); const scaleNext = 1 / (1 + ((z+20) * 0.05));
                const screenY = horizon + ((h - horizon) * scale); const screenYNext = horizon + ((h - horizon) * scaleNext);
                const screenX = cx - (camX * scale) - (dx * z * scale * 2);
                const screenXNext = cx - (camX * scaleNext) - ((dx + seg.curve*0.5) * (z+20) * scaleNext * 2);
                const roadWidth = (w * 3) * scale; const roadWidthNext = (w * 3) * scaleNext;
                
                segmentCoords.push({ x: screenX, y: screenY, scale: scale, index: segIdx, z: z, curveDX: dx }); // Guarda curveDX para projetar objetos

                ctx.fillStyle = (seg.color === 'dark') ? '#5cab40' : '#65bd48'; ctx.fillRect(0, screenYNext, w, screenY - screenYNext); // Grama
                ctx.fillStyle = (seg.color === 'dark') ? '#cc0000' : '#ffffff'; // Zebra
                ctx.beginPath(); ctx.moveTo(screenX - roadWidth/2 - roadWidth*0.1, screenY); ctx.lineTo(screenX + roadWidth/2 + roadWidth*0.1, screenY);
                ctx.lineTo(screenXNext + roadWidthNext/2 + roadWidthNext*0.1, screenYNext); ctx.lineTo(screenXNext - roadWidthNext/2 - roadWidthNext*0.1, screenYNext); ctx.fill();
                ctx.fillStyle = (seg.color === 'dark') ? '#666666' : '#636363'; // Asfalto
                ctx.beginPath(); ctx.moveTo(screenX - roadWidth/2, screenY); ctx.lineTo(screenX + roadWidth/2, screenY);
                ctx.lineTo(screenXNext + roadWidthNext/2, screenYNext); ctx.lineTo(screenXNext - roadWidthNext/2, screenYNext); ctx.fill();
            }

            // 4.2 Loop de Objetos & Rival (Trás para Frente)
            for(let n = drawDistance-1; n >= 0; n--) {
                const coord = segmentCoords[n];
                const seg = segments[coord.index];

                // Desenhar Rival?
                // Rival Z relativo = RivalPos - PlayerPos. 
                // Se Rival está neste segmento (aprox)
                let rivalRelPos = d.rival.pos - d.pos;
                if(rivalRelPos < -trackLength/2) rivalRelPos += trackLength;
                if(rivalRelPos > trackLength/2) rivalRelPos -= trackLength;
                
                // Se rival está dentro deste slice de Z
                let segZStart = n * SEGMENT_LENGTH; 
                // A lógica de segmentos aqui é index baseada, então:
                // Distancia em segmentos
                let distSegs = (coord.index - currentSegIndex + segments.length) % segments.length;
                let rivalDistSegs = Math.floor(rivalRelPos / SEGMENT_LENGTH);
                
                // Ajuste fino para desenhar o rival no segmento certo
                if(Math.abs(rivalDistSegs - distSegs) < 1 && rivalRelPos > 0) {
                     const rScale = coord.scale;
                     // X do Rival projetado na curva
                     // Posição X da tela = Centro - CamX - CurvaOffset + RivalWorldX
                     // Rival X precisa ser afetado pela curva acumulada (coord.curveDX)
                     const rScreenX = coord.x + (d.rival.x * (w * 3) * rScale / 2);
                     const rScreenY = coord.y;
                     
                     // Desenha Sprite Rival (Verde)
                     const kSize = (w * 0.0055) / (rScale * 0.05); // Ajuste de escala tosco mas funcional
                     ctx.save(); ctx.translate(rScreenX, rScreenY); ctx.scale(rScale * 8, rScale * 8); // Scale relativa
                     ctx.fillStyle = '#00aa00'; ctx.beginPath(); ctx.ellipse(0, -5, 20, 10, 0, 0, Math.PI*2); ctx.fill();
                     ctx.fillStyle = '#111'; ctx.fillRect(-15, -10, 8, 10); ctx.fillRect(7, -10, 8, 10);
                     ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -20, 8, 0, Math.PI*2); ctx.fill(); // Cabeca
                     ctx.fillStyle = '#00aa00'; ctx.beginPath(); ctx.arc(0, -22, 8, Math.PI, 0); ctx.fill(); // Boné
                     ctx.restore();
                }

                // Desenhar Obstáculos
                if(seg.obs.length > 0) {
                    seg.obs.forEach(o => {
                        const spriteScale = coord.scale * 1.5;
                        const spriteX = coord.x + (o.x * (w * 3) * coord.scale / 2);
                        const spriteY = coord.y;
                        const size = (w * 0.15) * spriteScale;

                        if(o.type === 'cone') {
                            ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.moveTo(spriteX, spriteY - size);
                            ctx.lineTo(spriteX - size*0.3, spriteY); ctx.lineTo(spriteX + size*0.3, spriteY); ctx.fill();
                        } else {
                            ctx.fillStyle = '#f1c40f'; ctx.save(); ctx.translate(spriteX, spriteY);
                            ctx.rotate(Math.sin(d.time*0.1)*0.1); ctx.fillRect(-size/2, -size, size, size);
                            ctx.fillStyle = '#000'; ctx.font="bold "+(size*0.5)+"px Arial"; ctx.textAlign="center"; 
                            ctx.fillText(seg.curve < 0 ? "<<<" : ">>>", 0, -size*0.4); ctx.restore();
                        }
                        // Colisão
                        if(n < 2 && Math.abs(d.playerX - o.x) < 0.5) {
                            d.speed *= 0.8; d.score -= 50; d.nitro = Math.max(0, d.nitro - 20); // Perde Nitro
                            window.Gfx.shake(10); window.Sfx.crash(); o.x = 999; 
                            window.System.msg("DANO!");
                        }
                    });
                }
            }

            // 5. PLAYER
            const carScale = w * 0.0055;
            ctx.save(); ctx.translate(cx, h * 0.85 + d.bounce); ctx.scale(carScale, carScale);
            let visualRotation = d.visualTilt * 0.015; 
            if(d.driftState === 1) visualRotation += (d.driftDir * 0.4); 
            ctx.rotate(visualRotation);

            // Carro Vermelho
            ctx.fillStyle = '#cc0000'; ctx.globalAlpha = 0.5; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 30, 55, 15, 0, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1.0;
            const bodyGrad = ctx.createLinearGradient(-30, -20, 30, 20); bodyGrad.addColorStop(0, '#ff3333'); bodyGrad.addColorStop(1, '#aa0000');
            ctx.fillStyle = bodyGrad; ctx.beginPath(); ctx.moveTo(-25, -40); ctx.lineTo(25, -40); ctx.lineTo(45, 10); ctx.lineTo(50, 25); ctx.lineTo(-50, 25); ctx.lineTo(-45, 10); ctx.fill();
            ctx.fillStyle = '#333'; ctx.fillRect(-30, 25, 60, 15);
            
            // Fogo Nitro
            if(d.isNitroActive || d.boostTimer > 0) {
                 const fireScale = Math.random() + 1.2;
                 ctx.fillStyle = '#00ffff'; 
                 ctx.beginPath(); ctx.arc(-20, 35, 10*fireScale, 0, Math.PI*2); ctx.fill();
                 ctx.beginPath(); ctx.arc(20, 35, 10*fireScale, 0, Math.PI*2); ctx.fill();
            } else {
                 ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(-20, 35, 8, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(20, 35, 8, 0, Math.PI*2); ctx.fill();
            }
            
            // Rodas e Piloto
            const wheelAngle = d.steer * 0.8;
            ctx.fillStyle = '#111';
            ctx.save(); ctx.translate(-40, -30); ctx.rotate(wheelAngle); ctx.fillRect(-10, -15, 20, 30); ctx.restore();
            ctx.save(); ctx.translate(40, -30); ctx.rotate(wheelAngle); ctx.fillRect(-10, -15, 20, 30); ctx.restore();
            ctx.fillRect(-55, 10, 20, 30); ctx.fillRect(35, 10, 20, 30);
            
            ctx.save(); ctx.rotate(d.steer * 0.3);
            ctx.fillStyle = '#ffe0bd'; ctx.beginPath(); ctx.arc(0, -30, 18, 0, Math.PI*2); ctx.fill(); 
            ctx.fillStyle = '#ff0000'; ctx.beginPath(); ctx.arc(0, -35, 19, Math.PI, 0); ctx.fill(); ctx.fillRect(-20, -35, 40, 5); 
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -42, 8, 0, Math.PI*2); ctx.fill(); 
            ctx.fillStyle = '#ff0000'; ctx.font="bold 10px Arial"; ctx.textAlign="center"; ctx.fillText("M", 0, -39);
            ctx.restore();
            ctx.fillStyle = '#333'; ctx.fillRect(-12, -20, 24, 6); ctx.restore();

            particles.forEach((p, i) => { p.x += p.vx; p.y += p.vy; p.l--; if(p.l<=0) particles.splice(i,1); else { ctx.fillStyle=p.c; if(p.s) {ctx.beginPath();ctx.arc(p.x,p.y,p.s,0,Math.PI*2);ctx.fill();} else ctx.fillRect(p.x,p.y,4,4); } });

            // 6. HUD
            const hudX = w - 80; const hudY = h - 60;
            // Velocímetro
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(hudX, hudY, 55, 0, Math.PI*2); ctx.fill();
            ctx.lineWidth = 4; ctx.strokeStyle = d.isNitroActive ? '#00ffff' : (d.mtStage > 0 ? '#ffaa00' : '#fff'); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = "bold 36px 'Russo One'"; ctx.fillText(Math.floor(d.speed), hudX, hudY + 10);
            ctx.font = "12px Arial"; ctx.fillText("KM/H", hudX, hudY + 30);

            // Barra de Nitro
            ctx.fillStyle = '#333'; ctx.fillRect(w - 160, h - 140, 140, 15);
            ctx.fillStyle = '#00ffff'; ctx.fillRect(w - 158, h - 138, 136 * (d.nitro/100), 11);
            ctx.font = "10px Arial"; ctx.fillText("NITRO", w - 90, h - 145);

            // Score e Voltas
            ctx.fillStyle = '#fff'; ctx.font = "bold 30px 'Russo One'"; ctx.textAlign = "left";
            ctx.fillText("VOLTA " + d.lap + "/" + d.totalLaps, 20, 50);
            ctx.font = "20px Arial"; ctx.fillStyle = "#ffff00";
            ctx.fillText("SCORE: " + d.score, 20, 80);

            // Aviso Volante
            if(d.inputState === 1) {
                ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, h*0.4, w, h*0.2);
                ctx.fillStyle = "#fff"; ctx.textAlign="center"; ctx.font="bold 24px Arial"; ctx.fillText("SEGURE O VOLANTE COM AS DUAS MÃOS!", cx, h*0.5);
            }

            // Render Volante HUD
            if(d.inputState === 2 && d.wheel.opacity > 0.05) {
                ctx.save(); ctx.globalAlpha = d.wheel.opacity * 0.6; ctx.translate(d.wheel.x, d.wheel.y); ctx.rotate(d.wheel.angle);
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(0,0, d.wheel.radius, 0, Math.PI*2); ctx.stroke();
                ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(0,0, 10, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = '#ff3333'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, -d.wheel.radius); ctx.stroke();
                ctx.restore();
            }

            d.time++;
            return d.score;
        }
    };

    if(window.System) {
        window.System.registerGame('drive', 'Otto GP', '🏎️', Logic, {camOpacity: 0.4, showWheel: false});
    }
})();
