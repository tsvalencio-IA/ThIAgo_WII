// LÓGICA DO JOGO: KART DO OTTO (NINTENDO STYLE PHYSICS & VIRTUAL WHEEL 1:1)
(function() {
    // Sistema de partículas para fumaça, terra e "speed lines"
    let particles = [];
    
    const Logic = {
        // --- FÍSICA E ESTADO ---
        speed: 0, 
        pos: 0, 
        x: 0,           // Posição lateral (-1.5 a 1.5)
        steer: 0,       // Valor suavizado do volante
        curve: 0,       // Curvatura da pista
        
        // --- ATRIBUTOS DE JOGO ---
        health: 100, 
        score: 0, 
        
        // --- EFEITOS VISUAIS ---
        visualTilt: 0,  // Inclinação do chassi (Body Roll)
        bounce: 0,      // Vibração do motor
        
        // --- ESTADO DO VOLANTE VIRTUAL ---
        wheel: {
            radius: 0,
            x: 0,
            y: 0,
            opacity: 0
        },
        
        // --- OBJETOS DO MUNDO ---
        obs: [], 
        enemies: [],
        
        init: function() { 
            this.speed = 0; 
            this.pos = 0; 
            this.x = 0; 
            this.steer = 0;
            this.health = 100; 
            this.score = 0;
            this.obs = []; 
            this.enemies = [];
            particles = [];
            
            // Som de partida clássico
            window.System.msg("LIGUEM OS MOTORES!"); 
            window.Sfx.play(150, 'sawtooth', 0.8, 0.2); 
            setTimeout(() => window.Sfx.play(300, 'square', 1.0, 0.1), 1000);
        },
        
        update: function(ctx, w, h, pose) {
            const d = Logic; 
            const cx = w / 2;
            const horizon = h * 0.35; // Horizonte estilo Mario Kart

            // =================================================================
            // 1. INPUT E FÍSICA "PESADA" (Nintendo Feel)
            // =================================================================
            let targetAngle = 0;
            
            // Input de Pose (Mãos)
            if(pose) {
                const kp = pose.keypoints;
                const lw = kp.find(k=>k.name==='left_wrist');
                const rw = kp.find(k=>k.name==='right_wrist');
                
                if(lw && rw && lw.score > 0.4 && rw.score > 0.4) {
                    // Mapeia coordenadas para tela para cálculo visual correto
                    const p1 = window.Gfx.map(lw, w, h);
                    const p2 = window.Gfx.map(rw, w, h);

                    // Cálculo do centro e distância para o Volante Virtual
                    const centerX = (p1.x + p2.x) / 2;
                    const centerY = (p1.y + p2.y) / 2;
                    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                    
                    // Suavização da posição do volante (Lerp) para evitar jitter
                    d.wheel.x += (centerX - d.wheel.x) * 0.2;
                    d.wheel.y += (centerY - d.wheel.y) * 0.2;
                    
                    // O raio é metade da distância, com limites para não ficar gigante/minúsculo
                    let targetRadius = Math.max(w * 0.08, Math.min(w * 0.25, dist / 2));
                    d.wheel.radius += (targetRadius - d.wheel.radius) * 0.1;
                    d.wheel.opacity = Math.min(1, d.wheel.opacity + 0.1);

                    // Cálculo do Ângulo Físico
                    // Invertemos Y porque no canvas Y cresce para baixo
                    const dy = p2.y - p1.y; 
                    const dx = p2.x - p1.x;
                    let rawAngle = Math.atan2(dy, dx);
                    
                    // Deadzone
                    if(Math.abs(rawAngle) < 0.05) rawAngle = 0;
                    
                    // Curva de resposta
                    targetAngle = Math.sign(rawAngle) * Math.pow(Math.abs(rawAngle), 1.3) * 2.2 * window.System.sens;
                    
                    // Auto-Gas
                    if(d.speed < h * 0.075) d.speed += h * 0.0006; 
                } else { 
                    d.wheel.opacity *= 0.9; // Volante desaparece suavemente se perder tracking
                    d.speed *= 0.95; 
                }
            }
            
            // FÍSICA DE INÉRCIA (PESO DO CARRO)
            const speedRatio = d.speed / (h * 0.075);
            const inertia = 0.08 + (0.12 * (1 - speedRatio)); 
            
            d.steer += (targetAngle - d.steer) * inertia;
            d.steer = Math.max(-1.6, Math.min(1.6, d.steer)); 

            // Atualiza volante DOM (fallback)
            const uiWheel = document.getElementById('visual-wheel');
            if(uiWheel) uiWheel.style.opacity = '0'; // Esconde o volante antigo da UI pois desenharemos um novo

            // Física do Carro
            d.pos += d.speed;
            d.score += Math.floor(d.speed * 0.2);
            d.curve = Math.sin(d.pos * 0.002) * 2.2; 
            const grip = 1.0 - (speedRatio * 0.15); 
            d.x += (d.steer * grip * 0.07) - (d.curve * (d.speed/h) * 0.85);
            
            // Colisão Bordas
            let isOffRoad = false;
            if(Math.abs(d.x) > 1.3) { 
                d.speed *= 0.92; isOffRoad = true; d.x = d.x > 0 ? 1.3 : -1.3;
                if(d.speed > 2) { window.Gfx.shake(Math.random()*4); if(Math.random()<0.3) window.Sfx.play(100,'noise',0.1,0.05); }
            }

            d.bounce = Math.sin(Date.now() / 30) * (1 + speedRatio * 2);
            if(isOffRoad) d.bounce = (Math.random() - 0.5) * 12;
            d.visualTilt += (d.steer - d.visualTilt) * 0.2;

            // =================================================================
            // 2. OBJETOS DO MUNDO
            // =================================================================
            // Obstáculos
            if(Math.random() < 0.025 && d.speed > 5) {
                const type = Math.random() < 0.3 ? 'sign' : 'cone';
                let obsX = (Math.random() * 2.2) - 1.1;
                if(type === 'sign') obsX = (Math.random() < 0.5 ? -1.6 : 1.6);
                d.obs.push({ x: obsX, z: 2000, type: type, hit: false });
            }
            // Inimigos
            if(Math.random() < 0.012 && d.speed > 8) {
                d.enemies.push({
                    x: (Math.random() * 1.5) - 0.75, z: 2000, 
                    speed: d.speed * (0.6 + Math.random()*0.35),
                    color: Math.random() < 0.5 ? '#e67e22' : '#2980b9',
                    laneChange: (Math.random() - 0.5) * 0.02
                });
            }

            // =================================================================
            // 3. RENDERIZAÇÃO: CENÁRIO (VIBRANTE & LIMPO)
            // =================================================================
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, "#0099ff"); gradSky.addColorStop(1, "#87CEEB");
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

            // Nuvens e Fundo
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            const bgX = d.steer * 80 + (d.curve * 150);
            const drawCloud = (cx, cy, s) => { ctx.beginPath(); ctx.arc(cx, cy, 30*s, 0, Math.PI*2); ctx.arc(cx+25*s, cy-10*s, 35*s, 0, Math.PI*2); ctx.arc(cx+50*s, cy, 30*s, 0, Math.PI*2); ctx.fill(); };
            drawCloud(w*0.2 - bgX, horizon*0.6, 1.2); drawCloud(w*0.8 - bgX, horizon*0.4, 0.8);

            ctx.fillStyle = '#2ecc71'; ctx.beginPath(); ctx.moveTo(0, horizon);
            ctx.quadraticCurveTo(w*0.3, horizon - 50, w*0.6, horizon);
            ctx.quadraticCurveTo(w*0.8, horizon - 80, w, horizon);
            ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();

            const grassColor1 = '#32cd32'; ctx.fillStyle = grassColor1; ctx.fillRect(0, horizon, w, h);

            // PISTA
            const roadW_Far = w * 0.01; const roadW_Near = w * 2.2;
            const roadCurveVis = d.curve * (w * 0.7);

            // Zebras
            const zebraSize = w * 0.35; const segmentSize = 40; const segmentPhase = Math.floor(d.pos / segmentSize) % 2;
            ctx.fillStyle = (segmentPhase === 0) ? '#ff0000' : '#ffffff';
            ctx.beginPath();
            ctx.moveTo(cx + roadCurveVis - roadW_Far - (zebraSize*0.05), horizon);
            ctx.lineTo(cx + roadCurveVis + roadW_Far + (zebraSize*0.05), horizon);
            ctx.lineTo(cx + roadW_Near + zebraSize, h);
            ctx.lineTo(cx - roadW_Near - zebraSize, h);
            ctx.fill();

            // Asfalto
            ctx.fillStyle = '#555'; 
            ctx.beginPath();
            ctx.moveTo(cx + roadCurveVis - roadW_Far, horizon);
            ctx.lineTo(cx + roadCurveVis + roadW_Far, horizon);
            ctx.lineTo(cx + roadW_Near, h);
            ctx.lineTo(cx - roadW_Near, h);
            ctx.fill();

            // Speed Lines
            if(d.speed > 1) {
                ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 4;
                ctx.beginPath();
                const lines = 4; const offset = (d.pos % 100) / 100;
                for(let i=0; i<lines; i++) {
                    const depth = (i + offset) / lines; 
                    const y = horizon + (h-horizon) * (depth*depth); 
                    const widthAtY = roadW_Far + (roadW_Near-roadW_Far) * (depth*depth);
                    const centerAtY = cx + roadCurveVis * (1-depth);
                    ctx.moveTo(centerAtY - widthAtY, y); ctx.lineTo(centerAtY + widthAtY, y);
                }
                ctx.stroke();
            }

            // Faixa Central
            ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = w * 0.015;
            ctx.setLineDash([h * 0.1, h * 0.15]); ctx.lineDashOffset = -d.pos * 1.5;
            ctx.beginPath();
            ctx.moveTo(cx + roadCurveVis, horizon);
            ctx.quadraticCurveTo(cx + (roadCurveVis * 0.3), h * 0.7, cx, h);
            ctx.stroke(); ctx.setLineDash([]);

            // =================================================================
            // 4. OBJETOS (Z-SORTING)
            // =================================================================
            let drawQueue = [];
            d.obs.forEach((o, i) => {
                o.z -= d.speed * 2.0; if(o.z < -300) { d.obs.splice(i,1); return; }
                drawQueue.push({ type: o.type, obj: o, z: o.z });
            });
            d.enemies.forEach((e, i) => {
                e.z -= (d.speed - e.speed) * 2.0; e.x += e.laneChange;
                if(e.x > 0.8) e.laneChange = -0.015; if(e.x < -0.8) e.laneChange = 0.015;
                if(e.z < -500 || e.z > 3000) { d.enemies.splice(i,1); return; }
                drawQueue.push({ type: 'kart', obj: e, z: e.z });
            });
            drawQueue.sort((a, b) => b.z - a.z);

            drawQueue.forEach(item => {
                const o = item.obj; const scale = 500 / (o.z + 500);
                if(scale > 0 && o.z < 2500) {
                    const screenX = cx + (d.curve * w * 0.8 * (o.z/2500)) + (o.x * w * 0.7 * scale);
                    const screenY = horizon + (30 * scale);
                    const size = (w * 0.18) * scale;
                    let hit = false;
                    if(o.z < 100 && o.z > -100 && Math.abs(d.x - o.x) < 0.45 && !o.hit) hit = true;

                    if(item.type === 'cone') {
                        ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.moveTo(screenX, screenY - size);
                        ctx.lineTo(screenX - size*0.3, screenY); ctx.lineTo(screenX + size*0.3, screenY); ctx.fill();
                        ctx.fillStyle = '#fff'; ctx.fillRect(screenX - size*0.3, screenY-4*scale, size*0.6, 4*scale);
                        if(hit) { o.hit = true; d.speed *= 0.8; d.health -= 5; window.Sfx.crash(); window.Gfx.shake(10); d.obs.splice(d.obs.indexOf(o), 1); }
                    } 
                    else if(item.type === 'kart') {
                        const kScale = scale * w * 0.005;
                        ctx.save(); ctx.translate(screenX, screenY); ctx.scale(kScale, kScale);
                        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 10, 30, 8, 0, 0, Math.PI*2); ctx.fill();
                        ctx.fillStyle = o.color; ctx.fillRect(-20, -15, 40, 20);
                        ctx.fillStyle = '#222'; ctx.fillRect(-22, -5, 8, 15); ctx.fillRect(14, -5, 8, 15);
                        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -20, 12, 0, Math.PI*2); ctx.fill();
                        ctx.restore();
                        if(hit) { o.hit = true; d.speed = 0; d.health -= 20; window.Sfx.crash(); window.Gfx.shake(30); o.z -= 500; }
                    }
                    else if(item.type === 'sign') {
                        const hSign = size * 2;
                        ctx.fillStyle = '#555'; ctx.fillRect(screenX-2*scale, screenY-hSign, 4*scale, hSign);
                        ctx.fillStyle = '#f1c40f'; ctx.beginPath(); 
                        ctx.moveTo(screenX - size*0.8, screenY - hSign); ctx.lineTo(screenX + size*0.8, screenY - hSign); ctx.lineTo(screenX, screenY - hSign - size); ctx.fill();
                        if(hit) { o.hit = true; d.speed *= 0.5; d.health -= 15; window.Sfx.crash(); window.Gfx.shake(20); d.obs.splice(d.obs.indexOf(o), 1); }
                    }
                }
            });

            // =================================================================
            // 5. PLAYER KART
            // =================================================================
            const carScale = w * 0.0055;
            const carX = cx + (d.x * w * 0.3);
            const carY = h * 0.88 + d.bounce;
            
            ctx.save(); ctx.translate(carX, carY); ctx.scale(carScale, carScale); ctx.rotate(d.visualTilt * 0.15);

            // Partículas
            if(Math.abs(d.steer) > 0.8 && d.speed > 5) {
                const color = (Math.floor(Date.now()/100)%2===0) ? '#ffcc00' : '#ff3300';
                if(Math.random()<0.5) { particles.push({x: carX - 30, y: carY+20, vx: -2, vy: 2, s: 5, c: color, l: 20}); particles.push({x: carX + 30, y: carY+20, vx: 2, vy: 2, s: 5, c: color, l: 20}); }
            }
            if(isOffRoad) particles.push({x: carX, y: carY+10, vx: (Math.random()-0.5)*5, vy: 5, s: 8, c: '#8B4513', l: 30});

            // Kart Model
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 25, 50, 15, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#111'; ctx.fillRect(-50, 5, 25, 25); ctx.fillRect(25, 5, 25, 25);
            ctx.fillStyle = '#ddd'; ctx.fillRect(-45, 10, 15, 15); ctx.fillRect(30, 10, 15, 15);
            ctx.fillStyle = '#333'; ctx.fillRect(-25, 20, 50, 15);
            ctx.fillStyle = '#777'; ctx.beginPath(); ctx.arc(-15, 30, 6, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(15, 30, 6, 0, Math.PI*2); ctx.fill(); 
            const bodyGrad = ctx.createLinearGradient(-30, -20, 30, 20); bodyGrad.addColorStop(0, '#ff0000'); bodyGrad.addColorStop(1, '#cc0000');
            ctx.fillStyle = bodyGrad; ctx.beginPath(); ctx.moveTo(-20, -50); ctx.lineTo(20, -50); ctx.lineTo(35, 10); ctx.lineTo(40, 25); ctx.lineTo(-40, 25); ctx.lineTo(-35, 10); ctx.fill();
            ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 15, 0, 0, Math.PI*2); ctx.fill();

            // Cockpit e Piloto
            ctx.save(); ctx.rotate(d.steer * 0.5); 
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -25, 18, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#ff0000'; ctx.font="bold 12px Arial"; ctx.textAlign="center"; ctx.fillText("M", 0, -32);
            ctx.fillStyle = '#333'; ctx.fillRect(-12, -28, 24, 8);
            ctx.restore();

            // Rodas Frente
            ctx.fillStyle = '#111';
            ctx.save(); ctx.translate(-35, -35); ctx.rotate(d.steer * 0.6); ctx.fillRect(-8, -10, 16, 20); ctx.restore();
            ctx.save(); ctx.translate(35, -35); ctx.rotate(d.steer * 0.6); ctx.fillRect(-8, -10, 16, 20); ctx.restore();
            ctx.restore();

            particles.forEach((p, i) => { p.x += p.vx; p.y += p.vy; p.l--; if(p.l <= 0) particles.splice(i, 1); else { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI*2); ctx.fill(); } });

            // =================================================================
            // 6. HUD E INTERFACE
            // =================================================================
            const hudX = w - 80; const hudY = h - 60;
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(hudX, hudY, 50, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = "bold 36px 'Russo One'"; ctx.fillText(Math.floor(d.speed * 20), hudX, hudY + 10);
            ctx.font = "12px Arial"; ctx.fillText("KM/H", hudX, hudY + 30);
            
            const hpW = w * 0.3;
            ctx.fillStyle = '#333'; ctx.fillRect(cx - hpW/2, 20, hpW, 10);
            const hpColor = d.health > 50 ? '#2ecc71' : '#e74c3c';
            ctx.fillStyle = hpColor; ctx.fillRect(cx - hpW/2 + 2, 22, (hpW-4) * (d.health/100), 6);

            // =================================================================
            // 7. VOLANTE VIRTUAL 1:1 (SUBSTITUI MÃOS FANTASMAS)
            // =================================================================
            // Desenhado por último para prioridade total na tela
            if(d.wheel.opacity > 0.05) {
                ctx.save();
                ctx.globalAlpha = d.wheel.opacity;
                
                // Posiciona no centro calculado entre as mãos
                ctx.translate(d.wheel.x, d.wheel.y);
                
                // Rotação exata da física (1:1 com o controle)
                ctx.rotate(d.steer); 
                
                const r = d.wheel.radius;

                // Sombra do Volante (Profundidade)
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 20;
                ctx.shadowOffsetY = 10;

                // Aro do Volante (Branco Lustroso Wii)
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI*2); // Círculo externo
                ctx.arc(0, 0, r * 0.75, 0, Math.PI*2, true); // Círculo interno (cutout)
                ctx.fillStyle = '#f0f0f0';
                ctx.fill();
                
                // Borda externa
                ctx.strokeStyle = '#ddd';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.stroke();
                
                // Centro do Volante (Miolo)
                ctx.shadowBlur = 0; // Remove sombra para detalhes internos
                ctx.shadowOffsetY = 0;
                ctx.fillStyle = '#f0f0f0';
                ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI*2); ctx.fill();
                
                // Hastes do Volante (Spokes) - Esquerda, Direita, Baixo
                ctx.fillStyle = '#e0e0e0';
                ctx.fillRect(-r*0.8, -r*0.1, r*0.8, r*0.2); // Esq
                ctx.fillRect(0, -r*0.1, r*0.8, r*0.2);      // Dir
                ctx.beginPath(); ctx.moveTo(-r*0.15, 0); ctx.lineTo(r*0.15, 0); ctx.lineTo(0, r*0.8); ctx.fill(); // Baixo

                // Grip Azul (Onde as mãos seguram) - Feedback de posição 3h e 9h
                // Como o context já está rotacionado, desenhamos fixo em X
                ctx.fillStyle = '#3498db';
                // Grip Esquerdo
                ctx.beginPath(); 
                ctx.ellipse(-r*0.9, 0, r*0.1, r*0.25, 0, 0, Math.PI*2); 
                ctx.fill();
                // Grip Direito
                ctx.beginPath(); 
                ctx.ellipse(r*0.9, 0, r*0.1, r*0.25, 0, 0, Math.PI*2); 
                ctx.fill();

                // Logo Central "Wii/Otto"
                ctx.fillStyle = '#ccc';
                ctx.beginPath(); ctx.arc(0, 0, r*0.15, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#555';
                ctx.font = `bold ${r*0.15}px Arial`;
                ctx.textBaseline = 'middle';
                ctx.fillText("Wii", 0, 2);

                // Marcador de Topo (Faixa Vermelha)
                ctx.fillStyle = '#e74c3c';
                ctx.fillRect(-r*0.05, -r, r*0.1, r*0.15);

                ctx.restore();
            }

            if(d.health <= 0) window.System.gameOver("MOTOR QUEBROU!");

            return d.score;
        }
    };

    if(window.System) {
        window.System.registerGame('drive', 'Otto Kart', '🏎️', Logic, {camOpacity: 0.4, showWheel: false}); // showWheel false pois desenhamos o nosso
    }
})();