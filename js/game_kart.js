// LÓGICA DO JOGO: KART DO OTTO (HEAVY PHYSICS & WII STYLE)
(function() {
    // Sistema de partículas local para o escapamento e sujeira
    let particles = [];
    
    const Logic = {
        // Física e Estado
        speed: 0, 
        pos: 0, 
        x: 0,           // Posição lateral real (-1 a 1)
        steer: 0,       // Valor atual do volante (suavizado)
        curve: 0,       // Curvatura atual da pista
        
        // Atributos de Jogo
        health: 100, 
        score: 0, 
        maxSpeed: 0,    // Para normalizar o velocímetro
        
        // Elementos do Mundo
        obs: [], 
        enemies: [],
        
        // Variáveis Visuais (Inércia e Animação)
        visualTilt: 0,  // Inclinação do chassi
        bounce: 0,      // Vibração do motor/pista
        camShake: 0,
        
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
            this.maxSpeed = window.innerHeight * 0.08; // Referência para HUD
            
            window.System.msg("GO!"); 
            window.Sfx.play(200, 'sawtooth', 0.5, 0.2); // Ronco inicial
        },
        
        update: function(ctx, w, h, pose) {
            const d = Logic; 
            const cx = w / 2;
            const horizon = h * 0.4;

            // =================================================================
            // 1. INPUT E FÍSICA PESADA (INÉRCIA MELHORADA)
            // =================================================================
            let targetAngle = 0;
            
            // Mantendo a detecção original (PROIBIDO ALTERAR POSE), mas refinando a resposta
            if(pose) {
                const kp = pose.keypoints;
                const lw = kp.find(k=>k.name==='left_wrist');
                const rw = kp.find(k=>k.name==='right_wrist');
                
                if(lw && rw && lw.score > 0.4 && rw.score > 0.4) {
                    const dy = rw.y - lw.y; 
                    const dx = rw.x - lw.x;
                    let rawAngle = Math.atan2(dy, dx);
                    
                    // Deadzone central para evitar tremedeira
                    if(Math.abs(rawAngle) < 0.08) rawAngle = 0;
                    
                    // Aplica sensibilidade do sistema
                    targetAngle = Math.sign(rawAngle) * Math.pow(Math.abs(rawAngle), 1.2) * 2.0 * window.System.sens;
                    
                    // Aceleração automática se mãos detectadas
                    if(d.speed < h * 0.07) d.speed += h * 0.0005; 
                } else { 
                    // Desaceleração natural (fricção)
                    d.speed *= 0.96; 
                }
            }
            
            // SENSAÇÃO DE PESO: A inércia muda com a velocidade
            // Em alta velocidade, o volante fica "mais duro" (menor reactionSpeed)
            const speedRatio = d.speed / (h * 0.07);
            const dynamicInertia = 0.05 + (0.15 * (1 - speedRatio)); // 0.2 (lento) a 0.05 (rápido)
            
            d.steer += (targetAngle - d.steer) * dynamicInertia;
            
            // Limites físicos do volante
            d.steer = Math.max(-1.5, Math.min(1.5, d.steer));

            // Atualiza volante visual na UI (se existir)
            const wheel = document.getElementById('visual-wheel');
            if(wheel) wheel.style.transform = `rotate(${d.steer * 90}deg)`;

            // Cálculos de Posição
            d.pos += d.speed;
            d.score += Math.floor(d.speed * 0.1);
            
            // Curva da pista (Senoide progressiva baseada na posição)
            d.curve = Math.sin(d.pos * 0.0025) * 2.0;
            
            // Força Centrífuga: Carro é empurrado para fora na curva
            const centrifugal = d.curve * (d.speed/h) * 0.8;
            
            // Direção do Carro:
            // handling reduz em alta velocidade (subesterço)
            const handling = 1.0 - (speedRatio * 0.2); 
            d.x += (d.steer * handling * 0.06) - centrifugal;
            
            // Colisão com bordas (Grama)
            let onGrass = false;
            if(Math.abs(d.x) > 1.2) { 
                d.speed *= 0.94; // Grama segura o carro
                onGrass = true;
                d.x = d.x > 0 ? 1.2 : -1.2; // Clamp
                
                // Shake violento na grama
                if(d.speed > 2) window.Gfx.shake(Math.random() * 5);
            }

            // Vibração do Motor (Bounce)
            d.bounce = (Math.sin(Date.now() / 40) * 2) * speedRatio;
            if(onGrass) d.bounce = (Math.random() - 0.5) * 10;

            // Inclinação Visual (Chassi "rola" ao contrário da curva)
            // Isso dá a sensação de suspensão trabalhando
            d.visualTilt += (d.steer - d.visualTilt) * 0.1;

            // =================================================================
            // 2. GERAÇÃO DE OBJETOS E INIMIGOS
            // =================================================================
            // Lógica mantida, apenas ajustada probabilidades
            if(Math.random() < 0.02 && d.speed > 5) {
                const type = Math.random() < 0.4 ? 'sign' : 'cone';
                let posX = (Math.random() * 2.0) - 1.0;
                if(type === 'sign') posX = (Math.random() < 0.5 ? -1.5 : 1.5); // Placas fora da pista
                d.obs.push({ x: posX, z: 2000, type: type });
            }
            if(Math.random() < 0.01 && d.speed > 8) {
                d.enemies.push({
                    x: (Math.random() * 1.4) - 0.7, z: 2000, 
                    speed: d.speed * (0.5 + Math.random()*0.4),
                    color: Math.random() < 0.5 ? '#2980b9' : '#e67e22',
                    laneChange: (Math.random() - 0.5) * 0.02
                });
            }

            // =================================================================
            // 3. RENDERIZAÇÃO DE CENÁRIO (WII STYLE - VIBRANTE)
            // =================================================================
            
            // Céu com Gradiente Rico
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, "#00a8ff"); // Azul Céu Nintendo
            gradSky.addColorStop(1, "#c2e9fb");
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);
            
            // Nuvens ou Montanhas ao fundo (Parallax simples usando d.curve)
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            const bgOffset = d.steer * 50 + (d.curve * 100);
            ctx.beginPath(); ctx.arc(cx - bgOffset - 200, horizon, 150, Math.PI, 0); ctx.fill();
            ctx.beginPath(); ctx.arc(cx - bgOffset + 300, horizon, 100, Math.PI, 0); ctx.fill();

            // Grama (Texturizada com ruído simples)
            const gradGrass = ctx.createLinearGradient(0, horizon, 0, h);
            gradGrass.addColorStop(0, '#55aa55'); gradGrass.addColorStop(1, '#27ae60');
            ctx.fillStyle = gradGrass; ctx.fillRect(0, horizon, w, h);

            // DESENHO DA PISTA (Trapezoidal Projection)
            const viewDist = 0.6; // Onde a pista começa
            const roadW_Far = w * 0.02;
            const roadW_Near = w * 1.8;
            
            // Curvatura visual da estrada
            const roadCurve = d.curve * (w * 0.6);

            // 3.1 ZEBRAS (Curbs) - Vermelho e Branco vibrante
            const zebraW = w * 0.25;
            const segLength = 40; // Tamanho do segmento visual
            const currentSeg = Math.floor(d.pos / segLength) % 2;
            
            ctx.fillStyle = (currentSeg === 0) ? '#e74c3c' : '#f0f0f0';
            ctx.beginPath();
            ctx.moveTo(cx + roadCurve - roadW_Far - (zebraW*0.1), horizon); // Top Left
            ctx.lineTo(cx + roadCurve + roadW_Far + (zebraW*0.1), horizon); // Top Right
            ctx.lineTo(cx + roadW_Near + zebraW, h); // Bot Right
            ctx.lineTo(cx - roadW_Near - zebraW, h); // Bot Left
            ctx.fill();

            // 3.2 ASFALTO
            ctx.fillStyle = '#34495e'; // Cinza azulado moderno
            ctx.beginPath();
            ctx.moveTo(cx + roadCurve - roadW_Far, horizon);
            ctx.lineTo(cx + roadCurve + roadW_Far, horizon);
            ctx.lineTo(cx + roadW_Near, h);
            ctx.lineTo(cx - roadW_Near, h);
            ctx.fill();

            // 3.3 LINHAS DE VELOCIDADE NO CHÃO (TEXTURA)
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 2;
            const lineOffset = (d.pos % 100) / 100; // 0 a 1
            const roadH = h - horizon;
            // 3 linhas paralelas que descem
            for(let i=0; i<3; i++) {
                let yPct = (lineOffset + i/3) % 1;
                let y = horizon + (yPct * yPct * roadH); // Perspectiva quadrática
                let wAtY = roadW_Far + (roadW_Near - roadW_Far) * (yPct * yPct);
                let xCenter = cx + (roadCurve * (1 - yPct)); // Curva afeta menos perto da camera
                
                ctx.beginPath();
                ctx.moveTo(xCenter - wAtY, y);
                ctx.lineTo(xCenter + wAtY, y);
                ctx.stroke();
            }

            // 3.4 FAIXA CENTRAL
            ctx.strokeStyle = 'rgba(255,255,255,0.6)'; 
            ctx.lineWidth = w * 0.015;
            // Dash array ajustado para parecer rápido
            ctx.setLineDash([h * 0.15, h * 0.2]); 
            ctx.lineDashOffset = -d.pos * 1.5; // Move mais rápido que a posição para dar speed feel
            
            ctx.beginPath(); 
            ctx.moveTo(cx + roadCurve, horizon); 
            // Bezier quadrática para suavizar a curva visual
            ctx.quadraticCurveTo(cx + (roadCurve * 0.3), h * 0.7, cx, h); 
            ctx.stroke(); 
            ctx.setLineDash([]);

            // =================================================================
            // 4. RENDERIZAÇÃO DE OBJETOS (Z-BUFFER SIMPLES)
            // =================================================================
            let drawList = [];
            
            // Prepara Objetos
            d.obs.forEach((o, i) => {
                o.z -= d.speed * 2.0; // Velocidade relativa
                if(o.z < -200) { d.obs.splice(i,1); return; }
                drawList.push({ type: o.type, obj: o, z: o.z });
            });
            
            // Prepara Inimigos
            d.enemies.forEach((e, i) => {
                // Inimigos tem velocidade própria
                e.z -= (d.speed - e.speed) * 2.0; 
                e.x += e.laneChange;
                
                // IA simples para manter na pista
                if(e.x > 0.9) e.laneChange = -0.01;
                if(e.x < -0.9) e.laneChange = 0.01;

                if(e.z < -400 || e.z > 2500) { d.enemies.splice(i,1); return; }
                drawList.push({ type: 'car', obj: e, z: e.z });
            });

            // Ordena por profundidade (Z-Index do pintor)
            drawList.sort((a, b) => b.z - a.z);

            drawList.forEach(item => {
                const o = item.obj; 
                // Projeção 3D
                const scale = 500 / (o.z + 500); // Fator de escala
                
                if(scale > 0 && o.z < 2000) {
                    // X projetado leva em conta a curva da pista
                    // Quanto mais longe (z alto), mais a curva afeta o X
                    const curveFactor = d.curve * w * 0.8 * (o.z / 2000);
                    const objX = cx + curveFactor + (o.x * w * 0.6 * scale);
                    const objY = horizon + (40 * scale); // Ponto de ancoragem no horizonte
                    const size = (w * 0.15) * scale;

                    // COLISÃO
                    let hit = false;
                    // Hitbox um pouco mais generosa para gameplay fluido
                    if(o.z < 80 && o.z > -80 && Math.abs(d.x - o.x) < 0.4) hit = true;

                    if(item.type === 'cone') {
                        // Cone 3D fake
                        ctx.fillStyle = '#e67e22';
                        ctx.beginPath(); 
                        ctx.moveTo(objX, objY - size); // Topo
                        ctx.lineTo(objX - size*0.3, objY); 
                        ctx.lineTo(objX + size*0.3, objY); 
                        ctx.fill();
                        // Base branca
                        ctx.fillStyle = '#fff'; ctx.fillRect(objX - size*0.32, objY-2, size*0.64, 4*scale);

                        if(hit) { 
                            d.speed *= 0.7; // Perda de velocidade
                            d.health -= 5; 
                            window.Sfx.crash(); 
                            window.Gfx.shake(10); 
                            d.obs.splice(d.obs.indexOf(o), 1); 
                        }
                    } 
                    else if (item.type === 'sign') {
                        const ph = size * 2.5; // Altura do poste
                        // Poste
                        ctx.fillStyle = '#bdc3c7'; ctx.fillRect(objX - 2*scale, objY - ph, 4*scale, ph); 
                        // Placa
                        ctx.fillStyle = '#f1c40f'; // Amarelo alerta
                        ctx.beginPath();
                        ctx.moveTo(objX, objY - ph + size*0.5);
                        ctx.lineTo(objX - size*0.8, objY - ph - size*0.5);
                        ctx.lineTo(objX + size*0.8, objY - ph - size*0.5);
                        ctx.fill();
                        ctx.fillStyle = '#000'; ctx.font=`bold ${12*scale}px Arial`; ctx.textAlign='center';
                        ctx.fillText("<<<", objX, objY - ph);

                        if(hit) { 
                            d.speed *= 0.4; // Batida forte
                            d.health -= 15; 
                            window.Sfx.crash(); 
                            window.Gfx.shake(25); 
                            d.obs.splice(d.obs.indexOf(o), 1); 
                        }
                    }
                    else if (item.type === 'car') {
                        // Carro Inimigo
                        const es = scale * w * 0.004;
                        ctx.save(); ctx.translate(objX, objY); ctx.scale(es, es);
                        
                        // Sombra
                        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 15, 35, 12, 0, 0, Math.PI*2); ctx.fill();
                        
                        // Corpo
                        ctx.fillStyle = o.color; ctx.beginPath(); ctx.roundRect(-22, -20, 44, 40, 6); ctx.fill();
                        // Cabine
                        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.roundRect(-18, -25, 36, 15, 4); ctx.fill();
                        
                        // Lanternas (Brilho)
                        ctx.fillStyle = '#e74c3c'; 
                        ctx.shadowBlur=15; ctx.shadowColor='#e74c3c';
                        ctx.fillRect(-20, 10, 12, 6); ctx.fillRect(8, 10, 12, 6);
                        ctx.shadowBlur=0;
                        
                        ctx.restore();
                        
                        if(hit) { 
                            d.speed = 0; // Parada total
                            d.health -= 25; 
                            window.Sfx.crash(); 
                            window.Gfx.shake(30); 
                            // Empurra inimigo para frente para não colar
                            o.z -= 400; 
                            o.speed += 5; 
                        }
                    }
                }
            });

            // =================================================================
            // 5. CARRO DO JOGADOR (PESO E DETALHES)
            // =================================================================
            const carX = cx + (d.x * w * 0.35); // Posição X na tela
            const carY = h * 0.85 + d.bounce;   // Posição Y com vibração
            const scaleCar = w * 0.005; // Escala base
            
            ctx.save();
            ctx.translate(carX, carY);
            ctx.scale(scaleCar, scaleCar);
            
            // Inclinação nas curvas (Body Roll)
            // Multiplicado por -1 para inclinar PARA DENTRO da curva (estilo Kart)
            // ou positivo para inclinar para fora (estilo suspensão mole)
            ctx.rotate(d.visualTilt * 0.15);

            // 5.1 Fumaça do Escapamento (Particles)
            if(d.speed > 2) {
                particles.push({
                    x: carX + (Math.random()-0.5)*20, 
                    y: carY + 20, 
                    vx: (Math.random()-0.5)*2, 
                    vy: 2 + Math.random()*2, // Vai para baixo na tela (trás do carro)
                    life: 1.0,
                    size: 5 + Math.random()*5
                });
            }

            // 5.2 Sombra (Oval achatada)
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; 
            ctx.beginPath(); ctx.ellipse(0, 30, 55, 15, 0, 0, Math.PI*2); ctx.fill();

            // 5.3 Pneus Traseiros (Largos e Escuros)
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(-45, 0, 25, 30); // Esq
            ctx.fillRect(20, 0, 25, 30);  // Dir

            // 5.4 Chassi Principal (Gradiente Aerodinâmico)
            const gradBody = ctx.createLinearGradient(-30, -50, 30, 50);
            if(d.health > 50) { gradBody.addColorStop(0, '#e74c3c'); gradBody.addColorStop(1, '#c0392b'); }
            else { gradBody.addColorStop(0, '#7f8c8d'); gradBody.addColorStop(1, '#2c3e50'); } // Cinza se quebrado
            
            ctx.fillStyle = gradBody;
            ctx.beginPath();
            ctx.moveTo(-20, -60); // Bico
            ctx.lineTo(20, -60);
            ctx.lineTo(35, 10);   // Sidepod Dir
            ctx.lineTo(40, 30);   // Traseira Dir
            ctx.lineTo(-40, 30);  // Traseira Esq
            ctx.lineTo(-35, 10);  // Sidepod Esq
            ctx.fill();
            
            // Detalhes do Motor (Traseira)
            ctx.fillStyle = '#2c3e50'; ctx.fillRect(-25, 30, 50, 10);
            // Escapamentos
            ctx.fillStyle = '#95a5a6'; ctx.beginPath(); ctx.arc(-15, 35, 4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(15, 35, 4, 0, Math.PI*2); ctx.fill();

            // 5.5 Pneus Dianteiros (Esterçam com o volante)
            const wheelTurn = d.visualTilt * 0.8; // Ângulo visual das rodas
            ctx.fillStyle = '#1a1a1a';
            
            ctx.save(); ctx.translate(-35, -40); ctx.rotate(wheelTurn); ctx.fillRect(-8, -12, 16, 24); ctx.restore();
            ctx.save(); ctx.translate(35, -40); ctx.rotate(wheelTurn); ctx.fillRect(-8, -12, 16, 24); ctx.restore();

            // 5.6 Piloto (Capacete e Ombros)
            // Ombros
            ctx.fillStyle = '#d35400'; ctx.beginPath(); ctx.ellipse(0, -10, 18, 12, 0, 0, Math.PI*2); ctx.fill();
            // Capacete
            ctx.fillStyle = '#f1c40f'; // Amarelo Clássico
            ctx.beginPath(); ctx.arc(0, -25, 16, 0, Math.PI*2); ctx.fill();
            // Visor
            ctx.fillStyle = '#222'; ctx.beginPath(); ctx.roundRect(-10, -30, 20, 8, 2); ctx.fill();
            // Reflexo no visor
            ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(5, -28, 4, 2, 0, 0, Math.PI*2); ctx.fill();

            // 5.7 Asa Traseira (Spoiler)
            ctx.fillStyle = '#222'; 
            ctx.fillRect(-35, 20, 70, 8); // Asa
            ctx.fillStyle = '#fff'; ctx.font="bold 8px Arial"; ctx.fillText("TURBO", -12, 27);

            // Fumaça saindo se danificado
            if(d.health < 40) {
                ctx.fillStyle = 'rgba(50,50,50,0.6)';
                ctx.beginPath(); ctx.arc(0, 0, Math.random()*20, 0, Math.PI*2); ctx.fill();
            }

            ctx.restore();

            // =================================================================
            // 6. PROCESSA PARTÍCULAS DE FUMAÇA
            // =================================================================
            particles.forEach((p, i) => {
                p.x += p.vx;
                p.y += p.vy; // Fumaça fica pra trás (desce na tela)
                p.life -= 0.05;
                p.size *= 1.1; // Expande
                if(p.life <= 0) particles.splice(i,1);
                else {
                    ctx.fillStyle = `rgba(200, 200, 200, ${p.life * 0.4})`;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
                }
            });

            // =================================================================
            // 7. HUD ESTILO WII (LIMPO E CLARO)
            // =================================================================
            
            // Desenha as mãos virtuais (Core)
            if(window.Gfx && window.Gfx.drawSteeringHands) window.Gfx.drawSteeringHands(ctx, pose, w, h);

            // 7.1 Barra de Vida (Topo Centro)
            const barW = w * 0.4;
            const barH = 12;
            const barX = cx - barW/2;
            const barY = h * 0.05;
            
            // Fundo da barra
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.roundRect(barX, barY, barW, barH, 6); ctx.fill();
            // Barra Colorida
            const hpPct = Math.max(0, d.health / 100);
            const hpColor = hpPct > 0.5 ? '#2ecc71' : (hpPct > 0.2 ? '#f39c12' : '#e74c3c');
            
            ctx.fillStyle = hpColor;
            ctx.shadowColor = hpColor; ctx.shadowBlur = 10;
            ctx.beginPath(); ctx.roundRect(barX, barY, barW * hpPct, barH, 6); ctx.fill();
            ctx.shadowBlur = 0;
            
            // Texto "DAMAGE"
            ctx.fillStyle = '#fff'; ctx.font = "10px 'Roboto'"; ctx.textAlign = "center";
            ctx.fillText(hpPct > 0.2 ? "INTEGRIDADE" : "ALERTA DE DANO", cx, barY - 5);

            // 7.2 Velocímetro (Canto Inferior Direito)
            const speedRadius = w * 0.08;
            const speedX = w - speedRadius - 20;
            const speedY = h - speedRadius - 20;
            
            // Fundo do mostrador
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; 
            ctx.beginPath(); ctx.arc(speedX, speedY, speedRadius, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
            
            // Texto KM/H
            ctx.fillStyle = '#ccc'; ctx.font = "bold 12px Arial"; ctx.fillText("KM/H", speedX, speedY + speedRadius * 0.4);
            
            // Ponteiro
            const maxAngle = Math.PI * 0.8;
            const speedPct = Math.min(1, d.speed / (h*0.1)); // Normaliza 0-1
            const angle = -Math.PI*1.2 + (speedPct * (Math.PI*2.4)); // De -216deg a +Xdeg
            
            ctx.strokeStyle = hpColor; ctx.lineWidth = 4;
            ctx.beginPath(); 
            ctx.moveTo(speedX, speedY);
            ctx.lineTo(speedX + Math.cos(angle)*(speedRadius*0.8), speedY + Math.sin(angle)*(speedRadius*0.8));
            ctx.stroke();
            
            // Valor Digital Gigante
            ctx.fillStyle = '#fff'; ctx.font = "bold 32px 'Russo One'";
            ctx.fillText(Math.floor(d.speed * 20), speedX, speedY);

            // 7.3 Indicador de Posição (Seta de Centralização)
            // Ajuda o jogador a saber onde está o centro do volante
            if(pose) {
                const guideY = h * 0.15;
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.fillRect(cx - 50, guideY, 100, 4); // Centro
                
                // Cursor
                const cursorX = cx + (d.steer * 40); // Amplificado
                ctx.fillStyle = '#3498db';
                ctx.beginPath(); ctx.moveTo(cursorX, guideY-5); ctx.lineTo(cursorX-5, guideY-12); ctx.lineTo(cursorX+5, guideY-12); ctx.fill();
            }

            // Game Over Check
            if(d.health <= 0) window.System.gameOver("MOTOR QUEBRADO");

            return d.score;
        }
    };

    if(window.System) {
        window.System.registerGame('drive', 'Otto Kart Wii', '🏎️', Logic, {camOpacity: 0.4, showWheel: true});
    }
})();

