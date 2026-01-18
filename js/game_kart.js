// LÓGICA DO JOGO: KART DO OTTO (NINTENDO STYLE PHYSICS & VISUALS)
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
        driftColor: 0,  // Cor da fumaça do drift
        
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
            const horizon = h * 0.35; // Horizonte estilo Mario Kart (mais baixo para ver mais céu)

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
                    const dy = rw.y - lw.y; 
                    const dx = rw.x - lw.x;
                    let rawAngle = Math.atan2(dy, dx);
                    
                    // Deadzone para evitar tremedeira nas retas
                    if(Math.abs(rawAngle) < 0.05) rawAngle = 0;
                    
                    // Curva de resposta exponencial (mais precisão no centro, mais rápido nas pontas)
                    targetAngle = Math.sign(rawAngle) * Math.pow(Math.abs(rawAngle), 1.3) * 2.2 * window.System.sens;
                    
                    // Aceleração automática (Auto-Gas)
                    if(d.speed < h * 0.075) d.speed += h * 0.0006; 
                } else { 
                    // Freio motor se soltar o volante
                    d.speed *= 0.95; 
                }
            }
            
            // FÍSICA DE INÉRCIA (PESO DO CARRO)
            // Quanto mais rápido, mais "duro" o volante fica (Dynamic Steering)
            const speedRatio = d.speed / (h * 0.075);
            const inertia = 0.08 + (0.12 * (1 - speedRatio)); // Ajuste fino de resposta
            
            d.steer += (targetAngle - d.steer) * inertia;
            d.steer = Math.max(-1.6, Math.min(1.6, d.steer)); // Trava física do volante

            // Atualiza volante da UI (Elemento DOM) se existir
            const uiWheel = document.getElementById('visual-wheel');
            if(uiWheel) uiWheel.style.transform = `rotate(${d.steer * 100}deg)`;

            // Atualização de Posição
            d.pos += d.speed;
            d.score += Math.floor(d.speed * 0.2);
            
            // Curvas Procedurais
            d.curve = Math.sin(d.pos * 0.002) * 2.2; // Curvas largas e suaves
            
            // Força Centrífuga e Direção
            const grip = 1.0 - (speedRatio * 0.15); // Perde aderência em alta velocidade
            d.x += (d.steer * grip * 0.07) - (d.curve * (d.speed/h) * 0.85);
            
            // Colisão com Bordas (Grama/Areia)
            let isOffRoad = false;
            if(Math.abs(d.x) > 1.3) { 
                d.speed *= 0.92; // Atrito da grama
                isOffRoad = true;
                d.x = d.x > 0 ? 1.3 : -1.3; // Parede invisível suave
                if(d.speed > 2) {
                    window.Gfx.shake(Math.random() * 4); // Shake suave
                    if(Math.random()<0.3) window.Sfx.play(100, 'noise', 0.1, 0.05); // Som de terra
                }
            }

            // Animação do Chassi (Visual Tilt & Bounce)
            d.bounce = Math.sin(Date.now() / 30) * (1 + speedRatio * 2);
            if(isOffRoad) d.bounce = (Math.random() - 0.5) * 12;
            
            // O carro inclina para DENTRO da curva (estilo Kart)
            d.visualTilt += (d.steer - d.visualTilt) * 0.2;

            // =================================================================
            // 2. LOGICA DE OBJETOS (SPAWN)
            // =================================================================
            // Obstáculos
            if(Math.random() < 0.025 && d.speed > 5) {
                const type = Math.random() < 0.3 ? 'sign' : 'cone';
                let obsX = (Math.random() * 2.2) - 1.1;
                // Placas sempre nas bordas
                if(type === 'sign') obsX = (Math.random() < 0.5 ? -1.6 : 1.6);
                d.obs.push({ x: obsX, z: 2000, type: type, hit: false });
            }
            
            // Inimigos (Karts Rivais)
            if(Math.random() < 0.012 && d.speed > 8) {
                d.enemies.push({
                    x: (Math.random() * 1.5) - 0.75, z: 2000, 
                    speed: d.speed * (0.6 + Math.random()*0.35),
                    color: Math.random() < 0.5 ? '#e67e22' : '#2980b9', // Cores vibrantes
                    laneChange: (Math.random() - 0.5) * 0.02
                });
            }

            // =================================================================
            // 3. RENDERIZAÇÃO: CENÁRIO (VIBRANTE & LIMPO)
            // =================================================================
            
            // Céu Azul Nintendo
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, "#0099ff"); 
            gradSky.addColorStop(1, "#87CEEB");
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

            // Nuvens "Fofas" (Parallax)
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            const bgX = d.steer * 80 + (d.curve * 150);
            const drawCloud = (cx, cy, s) => {
                ctx.beginPath(); ctx.arc(cx, cy, 30*s, 0, Math.PI*2); ctx.arc(cx+25*s, cy-10*s, 35*s, 0, Math.PI*2); ctx.arc(cx+50*s, cy, 30*s, 0, Math.PI*2); ctx.fill();
            };
            drawCloud(w*0.2 - bgX, horizon*0.6, 1.2);
            drawCloud(w*0.8 - bgX, horizon*0.4, 0.8);

            // Colinas ao fundo (Silhueta verde)
            ctx.fillStyle = '#2ecc71';
            ctx.beginPath(); ctx.moveTo(0, horizon);
            ctx.quadraticCurveTo(w*0.3, horizon - 50, w*0.6, horizon);
            ctx.quadraticCurveTo(w*0.8, horizon - 80, w, horizon);
            ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();

            // Gramado (Padrão Xadrez sutil)
            const grassColor1 = '#32cd32'; // Lime Green
            const grassColor2 = '#2eb82e';
            ctx.fillStyle = grassColor1; ctx.fillRect(0, horizon, w, h);

            // PISTA (PROJEÇÃO)
            const roadW_Far = w * 0.01;
            const roadW_Near = w * 2.2;
            const roadCurveVis = d.curve * (w * 0.7);

            // Zebras (Curbs) - Vermelho e Branco Clássico
            const zebraSize = w * 0.35;
            const segmentSize = 40;
            const segmentPhase = Math.floor(d.pos / segmentSize) % 2;
            
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

            // Linhas de Velocidade (Asfalto texturizado)
            if(d.speed > 1) {
                ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 4;
                ctx.beginPath();
                const lines = 4;
                const offset = (d.pos % 100) / 100;
                for(let i=0; i<lines; i++) {
                    const depth = (i + offset) / lines; // 0 a 1
                    const y = horizon + (h-horizon) * (depth*depth); // Perspectiva não-linear
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
            // 4. OBJETOS 3D (Z-SORTING)
            // =================================================================
            let drawQueue = [];

            // Processa Obstáculos
            d.obs.forEach((o, i) => {
                o.z -= d.speed * 2.0;
                if(o.z < -300) { d.obs.splice(i,1); return; }
                drawQueue.push({ type: o.type, obj: o, z: o.z });
            });

            // Processa Inimigos
            d.enemies.forEach((e, i) => {
                e.z -= (d.speed - e.speed) * 2.0;
                e.x += e.laneChange;
                // IA Básica de Manter na Pista
                if(e.x > 0.8) e.laneChange = -0.015;
                if(e.x < -0.8) e.laneChange = 0.015;
                if(e.z < -500 || e.z > 3000) { d.enemies.splice(i,1); return; }
                drawQueue.push({ type: 'kart', obj: e, z: e.z });
            });

            // Ordena do fundo para frente
            drawQueue.sort((a, b) => b.z - a.z);

            drawQueue.forEach(item => {
                const o = item.obj;
                const scale = 500 / (o.z + 500);
                
                if(scale > 0 && o.z < 2500) {
                    const screenX = cx + (d.curve * w * 0.8 * (o.z/2500)) + (o.x * w * 0.7 * scale);
                    const screenY = horizon + (30 * scale);
                    const size = (w * 0.18) * scale;
                    
                    // Colisão Simples
                    let hit = false;
                    if(o.z < 100 && o.z > -100 && Math.abs(d.x - o.x) < 0.45 && !o.hit) hit = true;

                    if(item.type === 'cone') {
                        ctx.fillStyle = '#ff6b6b';
                        ctx.beginPath(); ctx.moveTo(screenX, screenY - size);
                        ctx.lineTo(screenX - size*0.3, screenY); ctx.lineTo(screenX + size*0.3, screenY); ctx.fill();
                        ctx.fillStyle = '#fff'; ctx.fillRect(screenX - size*0.3, screenY-4*scale, size*0.6, 4*scale);
                        
                        if(hit) {
                            o.hit = true; d.speed *= 0.8; d.health -= 5;
                            window.Sfx.crash(); window.Gfx.shake(10);
                            // Efeito visual de batida
                            d.obs.splice(d.obs.indexOf(o), 1);
                        }
                    } 
                    else if(item.type === 'kart') {
                        // Kart Rival (Low Poly Style)
                        const kScale = scale * w * 0.005;
                        ctx.save(); ctx.translate(screenX, screenY); ctx.scale(kScale, kScale);
                        
                        // Sombra
                        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 10, 30, 8, 0, 0, Math.PI*2); ctx.fill();
                        
                        // Chassi
                        ctx.fillStyle = o.color; ctx.fillRect(-20, -15, 40, 20);
                        // Rodas
                        ctx.fillStyle = '#222'; 
                        ctx.fillRect(-22, -5, 8, 15); ctx.fillRect(14, -5, 8, 15);
                        // Capacete Rival
                        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -20, 12, 0, Math.PI*2); ctx.fill();
                        
                        ctx.restore();
                        
                        if(hit) {
                            o.hit = true; d.speed = 0; d.health -= 20;
                            window.Sfx.crash(); window.Gfx.shake(30);
                            o.z -= 500; // Empurra rival pra frente
                        }
                    }
                    else if(item.type === 'sign') {
                        const hSign = size * 2;
                        ctx.fillStyle = '#555'; ctx.fillRect(screenX-2*scale, screenY-hSign, 4*scale, hSign);
                        ctx.fillStyle = '#f1c40f'; 
                        ctx.beginPath(); 
                        ctx.moveTo(screenX - size*0.8, screenY - hSign);
                        ctx.lineTo(screenX + size*0.8, screenY - hSign);
                        ctx.lineTo(screenX, screenY - hSign - size); 
                        ctx.fill(); // Seta pra cima/lado
                        if(hit) {
                            o.hit = true; d.speed *= 0.5; d.health -= 15;
                            window.Sfx.crash(); window.Gfx.shake(20);
                            d.obs.splice(d.obs.indexOf(o), 1);
                        }
                    }
                }
            });

            // =================================================================
            // 5. PLAYER KART (VISUAL ESTILO WII)
            // =================================================================
            const carScale = w * 0.0055;
            const carX = cx + (d.x * w * 0.3);
            const carY = h * 0.88 + d.bounce;
            
            ctx.save();
            ctx.translate(carX, carY);
            ctx.scale(carScale, carScale);
            
            // Inclinação do corpo (Simula suspensão)
            ctx.rotate(d.visualTilt * 0.15);

            // 5.1 Fumaça de Drift/Terra (Partículas Traseiras)
            if(Math.abs(d.steer) > 0.8 && d.speed > 5) {
                // Drift Sparks
                const color = (Math.floor(Date.now()/100)%2===0) ? '#ffcc00' : '#ff3300';
                if(Math.random()<0.5) {
                    particles.push({x: carX - 30, y: carY+20, vx: -2, vy: 2, s: 5, c: color, l: 20});
                    particles.push({x: carX + 30, y: carY+20, vx: 2, vy: 2, s: 5, c: color, l: 20});
                }
            }
            if(isOffRoad) {
                // Terra
                particles.push({x: carX, y: carY+10, vx: (Math.random()-0.5)*5, vy: 5, s: 8, c: '#8B4513', l: 30});
            }

            // 5.2 Desenho do Kart
            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 25, 50, 15, 0, 0, Math.PI*2); ctx.fill();

            // Rodas Traseiras (Gordas)
            ctx.fillStyle = '#111';
            ctx.fillRect(-50, 5, 25, 25); ctx.fillRect(25, 5, 25, 25);
            // Calotas
            ctx.fillStyle = '#ddd'; ctx.fillRect(-45, 10, 15, 15); ctx.fillRect(30, 10, 15, 15);

            // Motor / Escapamento
            ctx.fillStyle = '#333'; ctx.fillRect(-25, 20, 50, 15);
            ctx.fillStyle = '#777'; ctx.beginPath(); ctx.arc(-15, 30, 6, 0, Math.PI*2); ctx.fill(); 
            ctx.beginPath(); ctx.arc(15, 30, 6, 0, Math.PI*2); ctx.fill(); 

            // Corpo Principal (Gradiente Vermelho Mario)
            const bodyGrad = ctx.createLinearGradient(-30, -20, 30, 20);
            bodyGrad.addColorStop(0, '#ff0000'); bodyGrad.addColorStop(1, '#cc0000');
            ctx.fillStyle = bodyGrad;
            ctx.beginPath();
            ctx.moveTo(-20, -50); ctx.lineTo(20, -50); // Bico
            ctx.lineTo(35, 10); ctx.lineTo(40, 25); // Lado Dir
            ctx.lineTo(-40, 25); ctx.lineTo(-35, 10); // Lado Esq
            ctx.fill();

            // Assento
            ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 15, 0, 0, Math.PI*2); ctx.fill();

            // Volante (Gira com o input)
            ctx.save();
            ctx.translate(0, -10);
            ctx.rotate(d.steer * 1.5); // Volante gira visualmente
            ctx.fillStyle = '#333'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 10, 0, 0, Math.PI*2); ctx.fill(); // Aro
            ctx.fillStyle = '#888'; ctx.fillRect(-2, -10, 4, 20); // Raio
            ctx.restore();

            // Cabeça do Piloto (Gira levemente para a curva)
            ctx.save();
            ctx.rotate(d.steer * 0.5); 
            // Capacete
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -25, 18, 0, Math.PI*2); ctx.fill();
            // M emblema
            ctx.fillStyle = '#ff0000'; ctx.font="bold 12px Arial"; ctx.textAlign="center"; ctx.fillText("M", 0, -32);
            // Visor
            ctx.fillStyle = '#333'; ctx.fillRect(-12, -28, 24, 8);
            ctx.restore();

            // Rodas Dianteiras (Esterçam)
            ctx.fillStyle = '#111';
            ctx.save(); ctx.translate(-35, -35); ctx.rotate(d.steer * 0.6); ctx.fillRect(-8, -10, 16, 20); ctx.restore();
            ctx.save(); ctx.translate(35, -35); ctx.rotate(d.steer * 0.6); ctx.fillRect(-8, -10, 16, 20); ctx.restore();

            ctx.restore();

            // Renderiza Partículas (Fumaça)
            particles.forEach((p, i) => {
                p.x += p.vx; p.y += p.vy; p.l--;
                if(p.l <= 0) particles.splice(i, 1);
                else {
                    ctx.fillStyle = p.c;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI*2); ctx.fill();
                }
            });

            // =================================================================
            // 6. HUD (INTEFACE DE USUÁRIO)
            // =================================================================
            
            // 6.1 Velocímetro Digital (Canto Inferior Direito)
            const hudX = w - 80;
            const hudY = h - 60;
            
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(hudX, hudY, 50, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
            
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; 
            ctx.font = "bold 36px 'Russo One'";
            ctx.fillText(Math.floor(d.speed * 20), hudX, hudY + 10);
            ctx.font = "12px Arial"; ctx.fillText("KM/H", hudX, hudY + 30);

            // 6.2 Barra de Vida (Superior)
            const hpW = w * 0.3;
            ctx.fillStyle = '#333'; ctx.fillRect(cx - hpW/2, 20, hpW, 10);
            const hpColor = d.health > 50 ? '#2ecc71' : '#e74c3c';
            ctx.fillStyle = hpColor; ctx.fillRect(cx - hpW/2 + 2, 22, (hpW-4) * (d.health/100), 6);

            // =================================================================
            // 7. MÃOS DO JOGADOR (LUVAS VIRTUAIS) - CAMADA FINAL
            // =================================================================
            // Elas são desenhadas POR ÚLTIMO para ficarem sobre tudo
            // Isso garante o feedback visual "Nintendo" de controle
            if(window.Gfx && window.Gfx.drawSteeringHands) {
                // Força um estilo de linha mais visível para as luvas neste jogo específico
                ctx.save();
                ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10;
                window.Gfx.drawSteeringHands(ctx, pose, w, h);
                ctx.restore();
            }

            // Game Over
            if(d.health <= 0) window.System.gameOver("MOTOR QUEBROU!");

            return d.score;
        }
    };

    if(window.System) {
        window.System.registerGame('drive', 'Otto Kart', '🏎️', Logic, {camOpacity: 0.4, showWheel: true});
    }
})();