// =====================================================
// KART DO OTTO – GOLD MASTER (FINAL COMMERCIAL V3)
// STATUS: PHYSICS TUNED & BALANCED
// ENGINEER: CODE 177
// =====================================================

(function() {
    // -----------------------------------------------------------------
    // CONFIGURAÇÃO DE TUNING (FEEL & BALANCE)
    // -----------------------------------------------------------------
    const CONF = {
        // Velocidade "Jogável" (Menor número, mesma sensação visual)
        MAX_SPEED: 240,
        TURBO_MAX_SPEED: 410,
        ACCEL: 1.6,
        FRICTION: 0.96, // Um pouco mais de arrasto para controle
        OFFROAD_DECEL: 0.90, // Punição offroad mais suave
        
        // FÍSICA DE CURVA (ZERO AUTO-PILOT)
        CENTRIFUGAL_FORCE: 0.35, // Reduzido: Pista empurra menos
        STEER_AUTHORITY: 0.11,   // Aumentado: Jogador manda mais
        GRIP_CARVING: 1.2,       // Bônus se virar para o lado certo
        GRIP_DRIFT: 0.92,

        // COLISÃO & UX
        HITBOX_WIDTH: 0.35,      // Tolerância maior (perdoa raspão)
        CRASH_PENALTY: 0.6,      // Mantém 60% da velocidade após batida
        
        // INPUT
        DEADZONE: 0.04,
        INPUT_SMOOTHING: 0.15,
        TURBO_ZONE_Y: 0.35
    };

    // -----------------------------------------------------------------
    // VARIÁVEIS DE ESTADO
    // -----------------------------------------------------------------
    let particles = [];
    let nitroBtn = null;
    
    // Pista
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
        driftState: 0,    
        driftDir: 0,      
        driftCharge: 0,   
        mtStage: 0,       
        boostTimer: 0,    
        
        // Corrida
        state: 'race', 
        finishTimer: 0,
        lap: 1,
        totalLaps: 3,
        time: 0,
        rank: 1, 
        score: 0,
        
        // Visuais
        visualTilt: 0,    
        bounce: 0,
        skyColor: 0, 
        stats: { drifts: 0, overtakes: 0, crashes: 0 },
        
        // Input System
        inputState: 0, 
        gestureTimer: 0,
        virtualWheel: { x:0, y:0, r:0, opacity:0 },
        
        rivals: [],

        // -------------------------------------------------------------
        // CONSTRUÇÃO DE PISTA (OTTO GP)
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

            // Layout Otimizado para Drift
            addRoad(50, 0, 0); 
            let s1 = addRoad(40, 0.7, 0); addProp(s1+15, 'sign', -1.6);
            addRoad(20, 0, 0);
            let s2 = addRoad(30, -1.1, 0); addProp(s2+10, 'cone', 0.9);
            addRoad(40, 0, 0);
            let s3 = addRoad(50, 2.2, 0); addProp(s3+25, 'sign', -1.6);
            addRoad(30, -2.0, 0);
            let s4 = addRoad(60, 0, 0); 
            addProp(s4+15, 'cone', -0.6); addProp(s4+35, 'cone', 0.6);
            addRoad(20, 0.5, 0);

            trackLength = segments.length * SEGMENT_LENGTH;
        },

        // -------------------------------------------------------------
        // UI & CONTROLES
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
                boxShadow: '0 0 20px rgba(255, 100, 0, 0.5)', cursor: 'pointer', transition: '0.15s'
            });

            const toggle = (e) => {
                if(e) { e.preventDefault(); e.stopPropagation(); }
                if(this.nitro > 5) {
                    this.turboLock = !this.turboLock;
                    nitroBtn.style.transform = this.turboLock ? 'scale(0.95)' : 'scale(1)';
                    nitroBtn.style.filter = this.turboLock ? 'brightness(1.4)' : 'brightness(1)';
                    if(this.turboLock) window.Sfx.play(600, 'square', 0.1, 0.1);
                }
            };
            nitroBtn.addEventListener('touchstart', toggle, {passive:false});
            nitroBtn.addEventListener('mousedown', toggle);
            
            document.getElementById('game-ui').appendChild(nitroBtn);
        },

        // -------------------------------------------------------------
        // INICIALIZAÇÃO
        // -------------------------------------------------------------
        init: function() { 
            this.buildTrack();
            this.setupUI();
            
            this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0; this.targetSteer = 0;
            this.score = 0; this.lap = 1; this.time = 0; this.state = 'race';
            this.finishTimer = 0; this.skyColor = 0; particles = [];
            
            this.driftState = 0; this.boostTimer = 0; this.nitro = 100; this.turboLock = false;
            
            // Rivais Balanceados (Erro Humano)
            this.rivals = [
                { pos: 1000, x: -0.4, speed: 0, color: '#2ecc71', name: 'Luigi', aggro: 0.05, mistakeProb: 0.01 },
                { pos: 800,  x: 0.4,  speed: 0, color: '#3498db', name: 'Toad',  aggro: 0.04, mistakeProb: 0.005 },
                { pos: 1200, x: 0,    speed: 0, color: '#e74c3c', name: 'Bowser', aggro: 0.07, mistakeProb: 0.02 }
            ];

            window.System.msg("LARGADA!"); 
        },

        // -------------------------------------------------------------
        // CORE LOOP (UPDATE)
        // -------------------------------------------------------------
        update: function(ctx, w, h, pose) {
            const d = Logic; 
            const cx = w / 2;
            const horizon = h * 0.40;

            // --- 1. INPUT SYSTEM ---
            let detected = 0;
            let pLeft = null, pRight = null;

            if (d.state === 'race' && pose && pose.keypoints) {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                
                if (lw && lw.score > 0.3) { pLeft = window.Gfx.map(lw, w, h); detected++; }
                if (rw && rw.score > 0.3) { pRight = window.Gfx.map(rw, w, h); detected++; }

                // Detecção Turbo por Gesto
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

            // Cálculo Direção
            if (detected === 2) {
                d.inputState = 2;
                const dx = pRight.x - pLeft.x;
                const dy = pRight.y - pLeft.y;
                const rawAngle = Math.atan2(dy, dx);
                
                if (Math.abs(rawAngle) > CONF.DEADZONE) {
                    d.targetSteer = rawAngle * 2.3; // Multiplicador ajustado para conforto
                } else {
                    d.targetSteer = 0;
                }

                d.virtualWheel.x = (pLeft.x + pRight.x) / 2;
                d.virtualWheel.y = (pLeft.y + pRight.y) / 2;
                d.virtualWheel.r = Math.hypot(dx, dy) / 2;
                d.virtualWheel.opacity = 1;
            } else {
                d.inputState = 0;
                d.targetSteer = 0;
                d.virtualWheel.opacity *= 0.9;
            }

            // Suavização Fina
            d.steer += (d.targetSteer - d.steer) * CONF.INPUT_SMOOTHING;
            d.steer = Math.max(-1.5, Math.min(1.5, d.steer));

            if(nitroBtn) nitroBtn.style.opacity = (detected > 0) ? 0.3 : 1.0;

            // --- 2. FÍSICA PRO (FEEL V3) ---
            
            // Velocidade
            let currentMax = CONF.MAX_SPEED;
            let currentAccel = CONF.ACCEL;

            if (d.turboLock && d.nitro > 0) {
                currentMax = CONF.TURBO_MAX_SPEED;
                currentAccel = CONF.ACCEL * 3.0;
                d.nitro -= 0.6;
                if(d.nitro <= 0) { d.nitro = 0; d.turboLock = false; }
                if(d.time % 3 === 0) window.Gfx.shake(2);
            } else {
                d.turboLock = false;
                d.nitro = Math.min(100, d.nitro + 0.15);
            }

            if (d.boostTimer > 0) {
                currentMax += 80;
                d.boostTimer--;
            }

            // Aceleração e Atrito
            if ((d.inputState > 0 || d.turboLock) && d.state === 'race') {
                d.speed += (currentMax - d.speed) * 0.05;
            } else {
                d.speed *= CONF.FRICTION;
            }

            // Colisão com bordas
            const isOffRoad = Math.abs(d.playerX) > 2.2;
            if (isOffRoad) {
                d.speed *= CONF.OFFROAD_DECEL;
                window.Gfx.shake(2);
            }

            // --- LÓGICA DE CURVA "CARVE & GRIP" ---
            const segIdx = Math.floor(d.pos / SEGMENT_LENGTH) % segments.length;
            const seg = segments[segIdx] || segments[0];
            const speedRatio = d.speed / CONF.MAX_SPEED;

            // 1. Centrífuga (Empurra para fora)
            const centrifugal = -seg.curve * (speedRatio * speedRatio) * CONF.CENTRIFUGAL_FORCE;
            
            // 2. Tração Dinâmica
            // Se o jogador vira para o mesmo lado da curva, ganha tração (Grip)
            // Se vira contra ou não vira, perde tração
            let dynamicGrip = CONF.GRIP_NORMAL;
            if (Math.abs(d.steer) > 0.2) {
                if (Math.sign(d.steer) === Math.sign(seg.curve)) {
                    dynamicGrip = CONF.GRIP_CARVING; // Recompensa por pilotar bem
                }
            } else if (d.driftState === 1) {
                dynamicGrip = CONF.GRIP_DRIFT;
            }

            const playerForce = d.steer * CONF.STEER_AUTHORITY * dynamicGrip * speedRatio;

            // Soma
            d.playerX += playerForce + centrifugal;

            // Clamp
            if(d.playerX < -4.5) { d.playerX = -4.5; d.speed *= 0.95; }
            if(d.playerX > 4.5)  { d.playerX = 4.5;  d.speed *= 0.95; }

            // Drift
            if (d.driftState === 0) {
                if (Math.abs(d.steer) > 0.9 && speedRatio > 0.6 && !isOffRoad) {
                    d.driftState = 1; d.driftDir = Math.sign(d.steer);
                    d.driftCharge = 0; d.bounce = -8;
                    window.Sfx.skid();
                }
            } else {
                if (Math.abs(d.steer) < 0.2 || speedRatio < 0.3 || isOffRoad) {
                    if (d.mtStage > 0) {
                        d.boostTimer = d.mtStage * 35;
                        window.System.msg("BOOST!");
                        window.Sfx.play(800, 'square', 0.2, 0.2);
                        d.stats.drifts++;
                    }
                    d.driftState = 0; d.mtStage = 0;
                } else {
                    d.driftCharge++;
                    if(d.driftCharge > 80) d.mtStage = 2;
                    else if(d.driftCharge > 35) d.mtStage = 1;
                    
                    if(d.time % 4 === 0) {
                        const c = d.mtStage===2?'#f00':(d.mtStage===1?'#0ff':'#ff0');
                        particles.push({
                            x: cx + (d.playerX * w * 0.4) + (d.driftDir * 40), 
                            y: h * 0.9, 
                            vx: -d.driftDir * Math.random()*5, vy: -Math.random()*5, 
                            c: c, l: 15 
                        });
                    }
                }
            }

            // --- 3. JOGABILIDADE ---
            d.pos += d.speed;
            while (d.pos >= trackLength) {
                d.pos -= trackLength;
                d.lap++;
                if (d.lap > d.totalLaps && d.state === 'race') {
                    d.state = 'finished';
                    window.System.msg(d.rank === 1 ? "VITORIA!" : "FIM!");
                    if(d.rank === 1) window.Sfx.play(1000, 'square', 0.5, 1.0);
                } else if(d.state === 'race') {
                    window.Sfx.coin();
                }
            }
            while(d.pos < 0) d.pos += trackLength;

            // IA (Com Erros Humanos)
            let pAhead = 0;
            d.rivals.forEach(r => {
                const dist = r.pos - d.pos; 
                
                // Rubber banding
                let targetS = CONF.MAX_SPEED * 0.96;
                if(dist > 1200) targetS *= 0.8; 
                if(dist < -1200) targetS *= 1.2; 
                
                r.speed += (targetS - r.speed) * r.aggro;
                r.pos += r.speed;
                if(r.pos >= trackLength) r.pos -= trackLength;
                
                const rSeg = segments[Math.floor(r.pos/SEGMENT_LENGTH)%segments.length];
                
                // Erro Humano
                let idealLine = -(rSeg.curve * 0.6);
                if (Math.random() < r.mistakeProb) {
                     // IA erra a curva momentaneamente
                     idealLine = -(rSeg.curve * -0.5); 
                }
                
                r.x += (idealLine - r.x) * 0.05;

                // Rank
                let rTotalPos = r.pos + ((d.lap-1)*trackLength); 
                if(rTotalPos > d.pos + ((d.lap-1)*trackLength)) pAhead++;
            });
            d.rank = 1 + pAhead;

            d.time++;
            d.score += d.speed * 0.01;
            d.bounce *= 0.8;
            d.visualTilt += (d.steer * 15 - d.visualTilt) * 0.1;

            if (d.state === 'finished') {
                d.speed *= 0.95;
                if(d.speed < 2 && d.finishTimer === 0) {
                    d.finishTimer = 1;
                    setTimeout(()=> window.System.gameOver(Math.floor(d.score)), 2000);
                }
            }

            // --- 4. RENDERIZAÇÃO ---
            
            const grad = ctx.createLinearGradient(0,0,0,horizon);
            grad.addColorStop(0, '#0099ff'); grad.addColorStop(1, '#88ccff');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,horizon);

            // Parallax Aumentado (Sensação de Velocidade)
            ctx.fillStyle = '#228822';
            const bgX = (seg.curve * 60) + (d.steer * 40); // Multiplicadores maiores
            ctx.beginPath(); ctx.moveTo(0, horizon);
            for(let i=0; i<=10; i++) ctx.lineTo((w/10)*i - bgX, horizon - 40 + Math.random()*10);
            ctx.lineTo(w, horizon); ctx.fill();

            // Chão
            ctx.fillStyle = isOffRoad ? '#336622' : '#448833';
            ctx.fillRect(0, horizon, w, h-horizon);

            // Estrada
            let dx = 0;
            let camX = d.playerX * w * 0.35;
            let renderList = [];
            const drawDist = 45;

            for(let n=0; n<drawDist; n++) {
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

                const cRoad = s.color === 'dark' ? '#666' : '#636363';
                const cRumble = s.color === 'dark' ? '#c00' : '#fff';
                const cGrass = s.color === 'dark' ? (isOffRoad?'#3a7528':'#448833') : (isOffRoad?'#2d5e1e':'#55aa44');

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

            // Sprites
            for(let n=drawDist-1; n>=0; n--) {
                const r = renderList[n];
                
                // Rivais
                d.rivals.forEach(rival => {
                    let rel = rival.pos - d.pos;
                    if(rel < -trackLength/2) rel += trackLength;
                    if(rel > trackLength/2) rel -= trackLength;
                    
                    const segDist = Math.floor(rel / SEGMENT_LENGTH);
                    if(segDist === n) {
                        const rx = r.x + (rival.x * w * 1.2 * r.sc);
                        const size = w * 0.3 * r.sc;
                        ctx.fillStyle = rival.color;
                        ctx.fillRect(rx - size/2, r.y - size, size, size*0.7);
                        ctx.fillStyle = '#000'; ctx.fillRect(rx-size/2, r.y-size*0.3, size/4, size/4);
                        ctx.fillRect(rx+size/4, r.y-size*0.3, size/4, size/4);
                    }
                });

                // Obstaculos
                r.s.obs.forEach(o => {
                    const ox = r.x + (o.x * w * 1.5 * r.sc);
                    const os = w * 0.25 * r.sc;
                    if(o.type === 'cone') {
                        ctx.fillStyle = '#ff6600';
                        ctx.beginPath(); ctx.moveTo(ox, r.y-os); 
                        ctx.lineTo(ox-os*0.3, r.y); ctx.lineTo(ox+os*0.3, r.y); ctx.fill();
                    } else if (o.type === 'sign') {
                        ctx.fillStyle = '#f1c40f';
                        ctx.fillRect(ox-os/2, r.y-os, os, os*0.6);
                        ctx.fillStyle='#000'; ctx.font=`${Math.floor(os*0.4)}px Arial`; ctx.textAlign='center';
                        ctx.fillText(r.s.curve>0?">>>":"<<<", ox, r.y-os*0.2);
                    }
                    
                    // Colisão JUSTA (Hitbox menor, punição menor)
                    if(n < 2 && Math.abs(d.playerX - o.x) < CONF.HITBOX_WIDTH) {
                        d.speed *= CONF.CRASH_PENALTY; 
                        d.stats.crashes++; 
                        o.x=999;
                        d.bounce = -15; // Feedback visual forte, punição mecânica fraca
                        window.Gfx.shake(15); window.Sfx.crash();
                    }
                });
            }

            // Player Car
            const carSize = w * 0.15;
            ctx.save();
            ctx.translate(cx, h*0.85 + d.bounce);
            ctx.rotate(d.visualTilt * 0.02);
            
            ctx.fillStyle = '#d00';
            ctx.beginPath(); ctx.moveTo(-carSize/2, 0); ctx.lineTo(carSize/2, 0);
            ctx.lineTo(carSize*0.4, -carSize*0.6); ctx.lineTo(-carSize*0.4, -carSize*0.6); ctx.fill();
            
            ctx.fillStyle = '#111';
            const wheelY = -carSize * 0.1;
            ctx.save(); ctx.translate(-carSize*0.5, wheelY); ctx.rotate(d.steer*0.5); ctx.fillRect(-10,-15,20,30); ctx.restore();
            ctx.save(); ctx.translate(carSize*0.5, wheelY); ctx.rotate(d.steer*0.5); ctx.fillRect(-10,-15,20,30); ctx.restore();

            if(d.turboLock || d.boostTimer > 0) {
                const fSz = 10 + Math.random()*20;
                ctx.fillStyle = (d.mtStage===2)?'#f00':'#0ff';
                ctx.beginPath(); ctx.arc(-carSize*0.3, -carSize*0.4, fSz, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(carSize*0.3, -carSize*0.4, fSz, 0, Math.PI*2); ctx.fill();
            }
            ctx.restore();

            particles.forEach((p,i) => {
                p.x += p.vx; p.y += p.vy; p.l--;
                ctx.globalAlpha = p.l/20; ctx.fillStyle=p.c; 
                ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill();
                if(p.l<=0) particles.splice(i,1);
            });
            ctx.globalAlpha = 1;

            // HUD
            const barW = 200;
            const barH = 15;
            const bx = w/2 - barW/2;
            const by = 20;
            
            ctx.fillStyle = '#222'; ctx.fillRect(bx, by, barW, barH);
            const nColor = d.turboLock ? '#0ff' : (d.nitro>30 ? '#0d0' : '#d00');
            ctx.fillStyle = nColor; ctx.fillRect(bx+2, by+2, (barW-4)*(d.nitro/100), barH-4);
            
            ctx.font="bold 20px Arial"; ctx.fillStyle="#fff"; ctx.textAlign="right";
            ctx.fillText(Math.floor(d.speed) + " KM/H", w-20, 40);
            ctx.textAlign="left"; ctx.fillText("POS " + d.rank + "/" + (d.rivals.length+1), 20, 40);

            if(d.virtualWheel.opacity > 0) {
                ctx.strokeStyle = `rgba(255,255,255,${d.virtualWheel.opacity})`;
                ctx.lineWidth = 5;
                ctx.beginPath(); ctx.arc(d.virtualWheel.x, d.virtualWheel.y, d.virtualWheel.r, 0, Math.PI*2); ctx.stroke();
                const wx = d.virtualWheel.x + Math.cos(d.steer - Math.PI/2)*d.virtualWheel.r;
                const wy = d.virtualWheel.y + Math.sin(d.steer - Math.PI/2)*d.virtualWheel.r;
                ctx.fillStyle='#0ff'; ctx.beginPath(); ctx.arc(wx, wy, 8, 0, Math.PI*2); ctx.fill();
            }

            return Math.floor(d.score);
        }
    };

    if(window.System) {
        window.System.registerGame('drive', 'Otto Kart', '🏎️', Logic, {
            camOpacity: 0.4, 
            showWheel: false
        });
    }
})();
