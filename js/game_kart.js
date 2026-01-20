// LÓGICA DO JOGO: KART DO OTTO (CIRCUITO FIXO - GRAND PRIX EDITION)
(function() {
    // Sistema de partículas
    let particles = [];
    
    // Configurações de Pista (Geometria Fixa)
    const SEGMENT_LENGTH = 200; // Tamanho de cada "pedaço" da pista
    const RUMBLE_LENGTH = 3;    // Frequência das zebras
    
    // Dados do Circuito (Mapa)
    let segments = [];
    let trackLength = 0;

    const Logic = {
        // --- FÍSICA E ESTADO ---
        speed: 0, 
        maxSpeed: 260,
        pos: 0,           // Posição Z absoluta na pista
        playerX: 0,       // Posição lateral (-1 a 1 normais)
        steer: 0,         // Volante virtual input (-1.6 a 1.6)
        
        // --- DRIFT SYSTEM (ETAPA 2) ---
        driftState: 0,    // 0=Nenhum, 1=Drifting
        driftDir: 0,      // -1 ou 1
        driftCharge: 0,   // Acumulador de Mini-Turbo
        mtStage: 0,       // 0=Neutro, 1=Azul, 2=Laranja
        boostTimer: 0,    // Duração do boost de velocidade
        
        // --- FÍSICA DE CORRIDA ---
        centrifugal: 0,   
        grip: 1.0,        
        
        // --- ATRIBUTOS DE JOGO ---
        health: 100, 
        score: 0,
        lap: 1,
        totalLaps: 3,
        time: 0,
        finished: false,
        
        // --- VISUAL ---
        visualTilt: 0,    
        bounce: 0,
        
        // --- INPUT (MÃOS) ---
        inputState: 0,
        hands: { left: null, right: null },
        wheel: { radius: 0, x: 0, y: 0, opacity: 0, angle: 0 },
        
        // --- OBJETOS ---
        obs: [], 
        
        // --- FUNÇÕES DE PISTA ---
        buildTrack: function() {
            segments = [];
            const addRoad = (enter, curve, y) => {
                for(let i=0; i<enter; i++) {
                    segments.push({
                        curve: curve,
                        y: 0,
                        color: Math.floor(segments.length/RUMBLE_LENGTH)%2 ? 'dark' : 'light',
                        obs: []
                    });
                }
            };

            // LEIAUTE DO CIRCUITO "OTTO GP"
            addRoad(20, 0, 0);      // Reta de Largada
            addRoad(30, 1.5, 0);    // Curva Suave Direita
            addRoad(20, 0, 0);      // Reta
            addRoad(25, -2, 0);     // Curva Média Esquerda
            addRoad(40, -0.5, 0);   // Curva Longa Esquerda
            addRoad(50, 0, 0);      // Reta Grande (Speed)
            addRoad(30, 2.5, 0);    // Curva Fechada Direita (Drift!)
            addRoad(10, 0, 0);      // Reta Curta
            addRoad(30, -3, 0);     // Hairpin Esquerda (Drift Pesado!)
            addRoad(20, 1, 0);      // S-Bend
            addRoad(20, -1, 0);     // S-Bend
            addRoad(50, 0, 0);      // Reta Final

            trackLength = segments.length * SEGMENT_LENGTH;
            
            // Obstáculos
            segments.forEach((seg, i) => {
                if (i > 30 && i % 15 === 0 && Math.random() > 0.3) {
                    seg.obs.push({ type: Math.random() < 0.3 ? 'sign' : 'cone', x: (Math.random()*2 - 1) * 0.8 });
                }
            });
        },
        
        init: function() { 
            this.buildTrack();
            this.speed = 0; 
            this.pos = 0; 
            this.playerX = 0; 
            this.steer = 0;
            this.health = 100; 
            this.score = 0;
            this.lap = 1;
            this.time = 0;
            this.finished = false;
            particles = [];
            this.inputState = 0;
            
            // Reset Drift
            this.driftState = 0;
            this.driftCharge = 0;
            this.mtStage = 0;
            this.boostTimer = 0;
            this.grip = 1.0;
            
            // Som de partida
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
            // 1. INPUT (VOLANTE VIRTUAL DE DUAS MÃOS)
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
                    d.inputState = 2; // Volante Ativo
                    const p1 = d.hands.left;
                    const p2 = d.hands.right;

                    // UI Volante
                    const centerX = (p1.x + p2.x) / 2;
                    const centerY = (p1.y + p2.y) / 2;
                    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                    
                    d.wheel.x += (centerX - d.wheel.x) * 0.2;
                    d.wheel.y += (centerY - d.wheel.y) * 0.2;
                    d.wheel.radius += ((dist/2) - d.wheel.radius) * 0.1;
                    d.wheel.opacity = Math.min(1, d.wheel.opacity + 0.1);

                    // Cálculo do Ângulo Real
                    const rawAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                    
                    let steerInput = rawAngle;
                    if(Math.abs(steerInput) < 0.08) steerInput = 0; 
                    
                    targetAngle = Math.sign(steerInput) * Math.pow(Math.abs(steerInput), 1.6) * 2.8 * window.System.sens;
                    
                    // Aceleração (Sem boost)
                    const targetSpeed = d.maxSpeed + (d.boostTimer > 0 ? 60 : 0);
                    if(d.speed < targetSpeed) d.speed += 1.5;
                    else d.speed *= 0.99; // Decaimento natural do boost

                } else {
                    d.wheel.opacity *= 0.8;
                    d.speed *= 0.98;
                    targetAngle = 0;
                }
            }

            // Suavização com peso
            d.steer += (targetAngle - d.steer) * 0.10;
            d.steer = Math.max(-1.5, Math.min(1.5, d.steer));

            // Decremento Timer Boost
            if(d.boostTimer > 0) d.boostTimer--;

            // Atualiza UI Volante
            d.wheel.angle = d.steer;
            const uiWheel = document.getElementById('visual-wheel');
            if(uiWheel) uiWheel.style.opacity = '0'; 

            // =================================================================
            // 2. FÍSICA AVANÇADA (DRIFT + MINI-TURBO)
            // =================================================================
            
            d.pos += d.speed;
            while(d.pos >= trackLength) {
                d.pos -= trackLength;
                d.lap++;
                if(d.lap > d.totalLaps) {
                    d.finished = true;
                    window.System.gameOver("VENCEDOR! " + d.score + " PTS");
                } else {
                    window.System.msg("VOLTA " + d.lap);
                    window.Sfx.coin();
                }
            }
            while(d.pos < 0) d.pos += trackLength;

            const currentSegIndex = Math.floor(d.pos / SEGMENT_LENGTH) % segments.length;
            const currentSeg = segments[currentSegIndex];
            const trackCurve = currentSeg.curve;
            const speedRatio = d.speed / d.maxSpeed;
            
            // --- DRIFT LOGIC ---
            
            // Gatilho de Entrada: Volante > 0.9 e Velocidade > 60%
            if(d.driftState === 0) {
                if(d.inputState === 2 && Math.abs(d.steer) > 0.9 && speedRatio > 0.6) {
                    d.driftState = 1;
                    d.driftDir = Math.sign(d.steer);
                    d.driftCharge = 0;
                    d.mtStage = 0;
                    d.bounce = -12; // Hop inicial
                    window.Sfx.skid();
                }
            }
            // Sustentação do Drift
            else if (d.driftState === 1) {
                // Se soltar o volante (centro), dispara o Boost
                if(Math.abs(d.steer) < 0.4) {
                    // DISPARAR MINI-TURBO
                    if(d.mtStage === 1) {
                        d.speed += 30; // Boost Azul
                        d.boostTimer = 40;
                        window.System.msg("BOOST!");
                        window.Sfx.play(600, 'square', 0.2, 0.1);
                        particles.push({x:cx, y:h*0.8, vx:0, vy:-10, c:'#00ffff', l:20, s:20}); // Efeito
                    } 
                    else if (d.mtStage === 2) {
                        d.speed += 50; // Boost Laranja
                        d.boostTimer = 80;
                        window.System.msg("SUPER TURBO!");
                        window.Sfx.play(800, 'sawtooth', 0.4, 0.2);
                        window.Gfx.shake(15);
                        particles.push({x:cx, y:h*0.8, vx:0, vy:-15, c:'#ff8800', l:30, s:30}); // Efeito
                    }
                    d.driftState = 0; // Fim do drift
                } 
                // Se velocidade cair muito, cancela sem boost
                else if (speedRatio < 0.3) {
                    d.driftState = 0;
                }
                // Manutenção: Acumula Carga
                else {
                    d.driftCharge++;
                    
                    // Cálculo de Estágios
                    if(d.driftCharge > 150) d.mtStage = 2;      // Laranja
                    else if(d.driftCharge > 60) d.mtStage = 1;  // Azul
                    else d.mtStage = 0;                         // Neutro

                    // Partículas de Faísca (Cor baseada no estágio)
                    if(d.driftCharge % 6 === 0) {
                        let sparkColor = '#ffff00'; // Amarelo (Base)
                        if(d.mtStage === 1) sparkColor = '#00ffff'; // Azul
                        if(d.mtStage === 2) sparkColor = '#ff6600'; // Laranja
                        
                        const carXScreen = cx + (d.playerX * w * 0.4);
                        const carYScreen = h * 0.85;
                        // Faíscas saem das rodas traseiras
                        for(let i=0;i<2;i++) particles.push({
                            x: carXScreen + (d.driftDir * 45), 
                            y: carYScreen + 25, 
                            vx: -d.driftDir * (2 + Math.random()*6), 
                            vy: -Math.random()*5, 
                            c: sparkColor, 
                            l: 12 + Math.random()*10
                        });
                    }
                }
            }

            // --- CÁLCULO FÍSICO ---
            
            // Grip Factor
            d.grip = 1.0;
            if(d.driftState === 1) {
                d.grip = 0.94; // Escorrega lateralmente
            }
            
            // Turn Rate
            let turnEffectiveness = (speedRatio > 0.8 && d.driftState === 0) ? 0.85 : 1.0;
            let turnRate = d.steer * 0.06 * turnEffectiveness;

            if(d.driftState === 1) {
                // No drift, o carro gira mais (aponta), mas move menos para o lado
                turnRate = d.steer * 0.085; 
            }

            // Força Centrífuga (Punição da Etapa 1 mantida)
            d.centrifugal = (trackCurve * (speedRatio * speedRatio)) * 0.085;

            // Aplicação Final
            d.playerX += (turnRate * d.grip) - d.centrifugal;

            // Colisão Bordas
            let isOffRoad = false;
            if(d.playerX > 2.2 || d.playerX < -2.2) {
                isOffRoad = true;
                d.speed *= 0.92; 
                if(d.speed > 60) window.Gfx.shake(3);
                d.driftState = 0; // Grama cancela drift imediatamente
                d.mtStage = 0;
            }
            
            if(d.playerX > 3.5) d.playerX = 3.5;
            if(d.playerX < -3.5) d.playerX = -3.5;

            // Visual
            d.visualTilt += ((d.steer * 20) - d.visualTilt) * 0.1;
            d.visualTilt = Math.max(-45, Math.min(45, d.visualTilt));

            d.bounce *= 0.8;
            if(isOffRoad) d.bounce = (Math.random()-0.5) * 12;

            // =================================================================
            // 3. RENDERIZAÇÃO
            // =================================================================
            
            const bgOffset = (currentSeg.curve * 100) + (d.steer * 50);
            
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, "#00aaff"); gradSky.addColorStop(1, "#cceeff");
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

            // Montanhas
            ctx.fillStyle = '#65a65a';
            ctx.beginPath();
            ctx.moveTo(0, horizon);
            for(let i=0; i<=10; i++) {
                const mx = (w/10 * i) - (bgOffset * 0.2); 
                const my = horizon - 30 - Math.sin(i + d.pos*0.001)*20;
                ctx.lineTo(mx, my);
            }
            ctx.lineTo(w, horizon);
            ctx.fill();

            // Grama
            ctx.fillStyle = isOffRoad ? '#4a7c30' : '#5cab40'; 
            ctx.fillRect(0, horizon, w, h-horizon);

            // Estrada
            let drawDistance = 40; 
            let dx = 0; 
            let camX = d.playerX * (w * 0.35); 
            let segmentCoords = [];

            for(let n = 0; n < drawDistance; n++) {
                const segIdx = (currentSegIndex + n) % segments.length;
                const seg = segments[segIdx];
                
                dx += (seg.curve * 0.5); 
                
                const z = n * 20; 
                const scale = 1 / (1 + (z * 0.05)); 
                const scaleNext = 1 / (1 + ((z+20) * 0.05));
                
                const screenY = horizon + ((h - horizon) * scale);
                const screenYNext = horizon + ((h - horizon) * scaleNext);
                
                const screenX = cx - (camX * scale) - (dx * z * scale * 2);
                const screenXNext = cx - (camX * scaleNext) - ((dx + seg.curve*0.5) * (z+20) * scaleNext * 2);
                
                const roadWidth = (w * 3) * scale;
                const roadWidthNext = (w * 3) * scaleNext;

                segmentCoords.push({ x: screenX, y: screenY, scale: scale, index: segIdx, z: z });

                const grassColor = (seg.color === 'dark') ? '#5cab40' : '#65bd48';
                const rumbleColor = (seg.color === 'dark') ? '#cc0000' : '#ffffff';
                const roadColor = (seg.color === 'dark') ? '#666666' : '#636363';

                ctx.fillStyle = grassColor;
                ctx.fillRect(0, screenYNext, w, screenY - screenYNext);

                ctx.fillStyle = rumbleColor;
                ctx.beginPath();
                ctx.moveTo(screenX - roadWidth/2 - (roadWidth*0.1), screenY);
                ctx.lineTo(screenX + roadWidth/2 + (roadWidth*0.1), screenY);
                ctx.lineTo(screenXNext + roadWidthNext/2 + (roadWidthNext*0.1), screenYNext);
                ctx.lineTo(screenXNext - roadWidthNext/2 - (roadWidthNext*0.1), screenYNext);
                ctx.fill();

                ctx.fillStyle = roadColor;
                ctx.beginPath();
                ctx.moveTo(screenX - roadWidth/2, screenY);
                ctx.lineTo(screenX + roadWidth/2, screenY);
                ctx.lineTo(screenXNext + roadWidthNext/2, screenYNext);
                ctx.lineTo(screenXNext - roadWidthNext/2, screenYNext);
                ctx.fill();
            }

            // Objetos
            for(let n = drawDistance-1; n >= 0; n--) {
                const coord = segmentCoords[n];
                const seg = segments[coord.index];
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
                            ctx.fillStyle = '#f1c40f'; 
                            ctx.save(); ctx.translate(spriteX, spriteY);
                            ctx.rotate(Math.sin(d.time*0.1)*0.1); 
                            ctx.fillRect(-size/2, -size, size, size);
                            ctx.fillStyle = '#000'; ctx.font="bold "+(size*0.5)+"px Arial"; ctx.textAlign="center"; ctx.fillText("<<<", 0, -size*0.4);
                            ctx.restore();
                        }
                        if(n < 2) {
                            if(Math.abs(d.playerX - o.x) < 0.5) {
                                d.speed *= 0.8;
                                window.Gfx.shake(10);
                                window.Sfx.crash();
                                o.x = 999; 
                            }
                        }
                    });
                }
            }

            // =================================================================
            // 4. PLAYER KART
            // =================================================================
            const carScale = w * 0.0055;
            const carScreenX = cx; 
            const carScreenY = h * 0.85 + d.bounce;
            
            ctx.save();
            ctx.translate(carScreenX, carScreenY);
            ctx.scale(carScale, carScale);
            
            let visualRotation = d.visualTilt * 0.015; 
            if(d.driftState === 1) visualRotation += (d.driftDir * 0.4); // Angulo agressivo no drift
            ctx.rotate(visualRotation);

            // Chassi
            ctx.fillStyle = '#cc0000'; 
            ctx.globalAlpha = 0.5; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 30, 55, 15, 0, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1.0;

            const bodyGrad = ctx.createLinearGradient(-30, -20, 30, 20); bodyGrad.addColorStop(0, '#ff3333'); bodyGrad.addColorStop(1, '#aa0000');
            ctx.fillStyle = bodyGrad; 
            ctx.beginPath(); ctx.moveTo(-25, -40); ctx.lineTo(25, -40); ctx.lineTo(45, 10); ctx.lineTo(50, 25); ctx.lineTo(-50, 25); ctx.lineTo(-45, 10); ctx.fill();
            
            ctx.fillStyle = '#333'; ctx.fillRect(-30, 25, 60, 15);
            
            // Fogo do Escape (Boost)
            if(d.boostTimer > 0) {
                 const fireScale = Math.random() + 1;
                 ctx.fillStyle = (d.boostTimer > 40) ? '#ffaa00' : '#00aaff'; // Laranja ou Azul
                 ctx.beginPath(); ctx.arc(-20, 35, 10*fireScale, 0, Math.PI*2); ctx.fill();
                 ctx.beginPath(); ctx.arc(20, 35, 10*fireScale, 0, Math.PI*2); ctx.fill();
            } else {
                 ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(-20, 35, 8, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(20, 35, 8, 0, Math.PI*2); ctx.fill();
            }

            const wheelAngle = d.steer * 0.8;
            ctx.fillStyle = '#111';
            ctx.save(); ctx.translate(-40, -30); ctx.rotate(wheelAngle); ctx.fillRect(-10, -15, 20, 30); ctx.restore();
            ctx.save(); ctx.translate(40, -30); ctx.rotate(wheelAngle); ctx.fillRect(-10, -15, 20, 30); ctx.restore();
            ctx.fillRect(-55, 10, 20, 30); ctx.fillRect(35, 10, 20, 30);

            // Piloto
            ctx.save(); 
            ctx.rotate(d.steer * 0.3);
            ctx.fillStyle = '#ffe0bd'; ctx.beginPath(); ctx.arc(0, -30, 18, 0, Math.PI*2); ctx.fill(); 
            ctx.fillStyle = '#ff0000'; ctx.beginPath(); ctx.arc(0, -35, 19, Math.PI, 0); ctx.fill(); 
            ctx.fillRect(-20, -35, 40, 5); 
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -42, 8, 0, Math.PI*2); ctx.fill(); 
            ctx.fillStyle = '#ff0000'; ctx.font="bold 10px Arial"; ctx.textAlign="center"; ctx.fillText("M", 0, -39);
            ctx.restore();

            ctx.fillStyle = '#333'; ctx.fillRect(-12, -20, 24, 6);
            ctx.restore();

            particles.forEach((p, i) => { 
                p.x += p.vx; p.y += p.vy; p.l--; 
                if(p.l <= 0) particles.splice(i, 1); 
                else { 
                    ctx.fillStyle = p.c; 
                    if(p.s) { ctx.beginPath(); ctx.arc(p.x, p.y, p.s*(p.l/20), 0, Math.PI*2); ctx.fill(); }
                    else ctx.fillRect(p.x, p.y, 4, 4); 
                } 
            });

            // =================================================================
            // 5. HUD
            // =================================================================
            const hudX = w - 80; const hudY = h - 60;
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(hudX, hudY, 55, 0, Math.PI*2); ctx.fill();
            
            // Cor do aro muda com o turbo pronto
            ctx.lineWidth = 4;
            if(d.mtStage === 1) ctx.strokeStyle = '#00ffff';
            else if (d.mtStage === 2) ctx.strokeStyle = '#ff6600';
            else ctx.strokeStyle = '#fff';
            
            ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = "bold 36px 'Russo One'"; 
            ctx.fillText(Math.floor(d.speed), hudX, hudY + 10);
            ctx.font = "12px Arial"; ctx.fillText("KM/H", hudX, hudY + 30);

            ctx.fillStyle = '#fff'; ctx.font = "bold 30px 'Russo One'"; ctx.textAlign = "left";
            ctx.fillText("VOLTA " + d.lap + "/" + d.totalLaps, 20, 50);

            if(d.inputState === 1) {
                ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, h*0.4, w, h*0.2);
                ctx.fillStyle = "#fff"; ctx.textAlign="center"; ctx.font="bold 24px Arial";
                ctx.fillText("SEGURE O VOLANTE COM AS DUAS MÃOS!", cx, h*0.5);
            }
            if(d.inputState === 2 && d.wheel.opacity > 0.05) {
                ctx.save();
                ctx.globalAlpha = d.wheel.opacity * 0.6; 
                ctx.translate(d.wheel.x, d.wheel.y);
                ctx.rotate(d.wheel.angle);
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
