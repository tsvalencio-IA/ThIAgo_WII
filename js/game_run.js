// =============================================================================
// LÓGICA DO JOGO: OTTO OLYMPICS (ESTILO MARIO RUN - PERSPECTIVA 3D)
// =============================================================================

(function() {
    const Logic = {
        // Estado do Jogo
        sc: 0,              // Pontuação
        f: 0,               // Contador de Frames
        lane: 0,            // Faixa atual (-1: Esq, 0: Centro, 1: Dir)
        action: 'run',      // Ação atual: 'run', 'jump', 'crouch'
        
        // Calibração
        state: 'calibrate', // 'calibrate' ou 'play'
        baseNoseY: 0,       // Altura média do nariz em repouso
        calibSamples: [],   // Amostras para calibração
        
        // Objetos
        obs: [],            // Obstáculos
        
        // Configurações de Gameplay
        LANE_WIDTH: 200,    // Largura visual das faixas
        SPEED: 18,          // Velocidade do mundo
        
        init: function() { 
            this.sc = 0; 
            this.f = 0; 
            this.obs = []; 
            this.state = 'calibrate';
            this.calibSamples = [];
            this.baseNoseY = 0;
            this.action = 'run';
            window.System.msg("CALIBRANDO..."); 
        },

        update: function(ctx, w, h, pose) {
            const cx = w / 2; // Centro X da tela
            
            // Definição do Horizonte (40% da altura para dar profundidade)
            const horizon = h * 0.40;
            const groundH = h - horizon;

            this.f++;

            // =================================================================
            // 1. INPUT E DETECÇÃO (CALIBRAÇÃO & CONTROLE)
            // =================================================================
            
            if(pose) {
                const n = pose.keypoints.find(k => k.name === 'nose');
                
                if(n && n.score > 0.4) {
                    // --- MODO CALIBRAÇÃO ---
                    if(this.state === 'calibrate') {
                        this.calibSamples.push(n.y);
                        
                        // Visual da Calibração
                        ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(0,0,w,h);
                        ctx.fillStyle = "#fff"; ctx.font = "bold 30px 'Russo One'"; ctx.textAlign = "center";
                        ctx.fillText("FIQUE EM POSIÇÃO NEUTRA", cx, h*0.4);
                        
                        // Barra de progresso
                        const pct = this.calibSamples.length / 60;
                        ctx.fillStyle = "#3498db"; 
                        ctx.fillRect(cx - 150, h*0.5, 300 * pct, 20);
                        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
                        ctx.strokeRect(cx - 150, h*0.5, 300, 20);

                        if(this.calibSamples.length > 60) {
                            const sum = this.calibSamples.reduce((a, b) => a + b, 0);
                            this.baseNoseY = sum / this.calibSamples.length;
                            this.state = 'play';
                            window.System.msg("LARGADA!"); 
                            window.Sfx.play(400, 'square', 0.5, 0.1); 
                        }
                        return 0; // Pausa renderização do jogo durante calibração
                    }
                    
                    // --- MODO JOGO ---
                    else if(this.state === 'play') {
                        // 1. Detectar Lane (X)
                        // Divide a tela em 3 terços virtuais para detecção
                        if(n.x < w * 0.35) this.lane = 1;       // Direita (Espelhado)
                        else if(n.x > w * 0.65) this.lane = -1; // Esquerda (Espelhado)
                        else this.lane = 0;                     // Centro

                        // 2. Detectar Ação (Y relativo à calibração)
                        const diff = n.y - this.baseNoseY;
                        const sensitivity = 40; // Pixels de movimento necessários

                        if(diff < -sensitivity) this.action = 'jump';       // Subiu o nariz = Pulo
                        else if (diff > sensitivity) this.action = 'crouch'; // Desceu o nariz = Agachou
                        else this.action = 'run';
                    }
                }
            }

            // =================================================================
            // 2. CENÁRIO (ESTILO NINTENDO - PERSPECTIVA)
            // =================================================================
            
            // A. CÉU (Degradê Azul Vibrante)
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, '#00BFFF'); // Deep Sky Blue
            gradSky.addColorStop(1, '#87CEFA'); // Light Sky Blue
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

            // B. ARQUIBANCADA (Torcida Pixelizada)
            const standH = h * 0.15;
            ctx.fillStyle = '#555'; ctx.fillRect(0, horizon - standH, w, standH);
            
            // Pixels da torcida (efeito estático colorido)
            for(let i=0; i < w; i+=10) {
                for(let j=0; j < standH; j+=10) {
                    if(Math.random() > 0.5) {
                        const cols = ['#ff0000', '#ffff00', '#0000ff', '#ffffff'];
                        ctx.fillStyle = cols[Math.floor(Math.random()*cols.length)];
                        ctx.fillRect(i, (horizon - standH) + j, 6, 6);
                    }
                }
            }

            // C. GRAMADO (Fundo verde)
            ctx.fillStyle = '#32CD32'; // Lime Green
            ctx.fillRect(0, horizon, w, groundH);

            // D. PISTA DE CORRIDA (Trapézio para profundidade)
            ctx.save();
            ctx.translate(cx, horizon); // Ponto de fuga no centro do horizonte

            // Largura da pista no horizonte (topo) vs na base da tela
            const trackTopW = w * 0.1; 
            const trackBotW = w * 1.0; 
            
            // Desenha o asfalto (Terracota avermelhado estilo pista olímpica)
            ctx.beginPath();
            ctx.fillStyle = '#d65a4e'; 
            ctx.moveTo(-trackTopW, 0);
            ctx.lineTo(trackTopW, 0);
            ctx.lineTo(trackBotW, groundH);
            ctx.lineTo(-trackBotW, groundH);
            ctx.fill();

            // Linhas das Raias (Brancas)
            ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4;
            const lanes = [-1, -0.33, 0.33, 1]; // Divisões das 3 pistas
            lanes.forEach(l => {
                ctx.beginPath();
                // Interpolação linear da perspectiva
                ctx.moveTo(l * trackTopW, 0);
                ctx.lineTo(l * trackBotW, groundH);
                ctx.stroke();
            });
            ctx.restore();

            // =================================================================
            // 3. OBSTÁCULOS (SPAWN E LÓGICA)
            // =================================================================
            
            if(this.state === 'play' && this.f % 90 === 0) { // Spawn a cada 90 frames
                const type = Math.random() < 0.5 ? 'hurdle' : 'sign';
                // Escolhe lane aleatória (-1, 0, 1)
                const obsLane = Math.floor(Math.random() * 3) - 1; 
                this.obs.push({
                    lane: obsLane,
                    z: 1200,      // Começa longe
                    type: type,
                    passed: false
                });
            }

            // Loop de renderização e lógica dos obstáculos (Do fundo para frente)
            this.obs.forEach((o, i) => {
                o.z -= this.SPEED; // Move em direção à tela

                // Remover se passar da tela
                if(o.z < -200) {
                    this.obs.splice(i, 1);
                    return;
                }

                // Cálculo de Perspectiva (Scale Factor)
                // Quanto menor o Z, maior a escala (mais perto)
                const scale = 300 / (300 + o.z);
                
                if(scale > 0) {
                    // Posição X: Interpola entre largura do topo e da base baseado na escala
                    const currentTrackW = trackTopW + (trackBotW - trackTopW) * scale;
                    // Spread das lanes aumenta conforme chega perto
                    const laneSpread = currentTrackW * 0.8; 
                    
                    const screenX = cx + (o.lane * laneSpread);
                    const screenY = horizon + (groundH * scale); // Cola no chão
                    const size = (w * 0.15) * scale; // Tamanho base visual

                    // 1. Sombra do Obstáculo
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.beginPath();
                    ctx.ellipse(screenX, screenY, size*0.6, size*0.2, 0, 0, Math.PI*2);
                    ctx.fill();

                    // 2. Desenha Obstáculo
                    if(o.type === 'hurdle') {
                        // Barreira (Vermelha e Branca)
                        const hH = size * 0.6; // Altura da barreira
                        ctx.lineWidth = 4 * scale;
                        ctx.strokeStyle = '#ddd'; 
                        
                        // Pernas
                        ctx.beginPath();
                        ctx.moveTo(screenX - size/2, screenY); ctx.lineTo(screenX - size/2, screenY - hH);
                        ctx.moveTo(screenX + size/2, screenY); ctx.lineTo(screenX + size/2, screenY - hH);
                        ctx.stroke();

                        // Topo
                        ctx.fillStyle = '#fff'; ctx.fillRect(screenX - size/2 - 2, screenY - hH - 5*scale, size + 4, 20*scale);
                        ctx.fillStyle = '#e74c3c'; // Listras vermelhas
                        ctx.fillRect(screenX - size/4, screenY - hH - 5*scale, size/5, 20*scale);
                        ctx.fillRect(screenX + size/4, screenY - hH - 5*scale, size/5, 20*scale);
                        
                        // Texto Ajuda
                        if(scale > 0.5 && !o.passed) {
                            ctx.fillStyle = '#FFFF00'; ctx.font = `bold ${16*scale}px Arial`; ctx.textAlign='center';
                            ctx.fillText("PULO!", screenX, screenY - hH - 20*scale);
                        }
                    } 
                    else {
                        // Placa Alta (Azul)
                        const signH = size * 2.2;
                        const signW = size * 1.2;
                        
                        // Postes
                        ctx.fillStyle = '#444'; 
                        ctx.fillRect(screenX - size/2, screenY - signH, 5*scale, signH);
                        ctx.fillRect(screenX + size/2, screenY - signH, 5*scale, signH);

                        // Placa
                        ctx.fillStyle = '#2980b9'; // Azul Esporte
                        ctx.fillRect(screenX - signW/2, screenY - signH, signW, size*0.8);
                        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3*scale;
                        ctx.strokeRect(screenX - signW/2, screenY - signH, signW, size*0.8);
                        
                        // Seta ou Texto
                        ctx.fillStyle = '#fff'; ctx.beginPath();
                        ctx.moveTo(screenX - 10*scale, screenY - signH + size*0.2);
                        ctx.lineTo(screenX + 10*scale, screenY - signH + size*0.2);
                        ctx.lineTo(screenX, screenY - signH + size*0.6);
                        ctx.fill();

                        // Texto Ajuda
                        if(scale > 0.5 && !o.passed) {
                            ctx.fillStyle = '#FFFF00'; ctx.font = `bold ${16*scale}px Arial`; ctx.textAlign='center';
                            ctx.fillText("ABAIXE!", screenX, screenY - signH - 10*scale);
                        }
                    }

                    // --- COLISÃO ---
                    // Z entre 0 e 100 é a zona de impacto ("perto do jogador")
                    if(o.z < 100 && o.z > 0) {
                        if(o.lane === this.lane) {
                            // Se está na mesma faixa, checa a ação
                            let hit = false;
                            
                            if(o.type === 'hurdle' && this.action !== 'jump') hit = true;
                            if(o.type === 'sign' && this.action !== 'crouch') hit = true;

                            if(hit) {
                                window.Gfx.shake(20);
                                window.Sfx.crash();
                                window.System.gameOver(this.sc);
                            } else if(!o.passed) {
                                // Sucesso (Desviou)
                                this.sc += 100;
                                window.Sfx.play(600, 'sine', 0.1, 0.05); // Som "bip" positivo
                                o.passed = true; // Marca como passado para não pontuar 2x
                            }
                        }
                    }
                }
            });

            // =================================================================
            // 4. PERSONAGEM (OTTO ESTILO MARIO)
            // =================================================================
            
            // Posição Base
            // X: Centro + (Lane * Largura proporcional da pista na base)
            const charX = cx + (this.lane * (w * 0.25)); 
            let charY = h * 0.80; // Pés no chão (80% da tela)

            // Modificador de Altura pela Ação
            if(this.action === 'jump') charY -= h * 0.15; // Sobe
            if(this.action === 'crouch') charY += h * 0.05; // Desce um pouco (agachado)

            // Sombra do Personagem (Sempre no chão)
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath();
            // A sombra fica fixa no chão (h*0.80 + offset), não sobe com o pulo
            // Mas diminui se ele pular
            const shadowSize = (this.action === 'jump') ? w * 0.06 : w * 0.08;
            ctx.ellipse(charX, h * 0.83, shadowSize, shadowSize * 0.3, 0, 0, Math.PI*2);
            ctx.fill();

            // Desenho do Boneco
            const s = w * 0.005; // Escala global do boneco
            ctx.save();
            ctx.translate(charX, charY);
            ctx.scale(s, s);

            // Estilo do traço
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 14;
            ctx.strokeStyle = '#333'; // Cor do corpo (cinza escuro/preto)

            const cycle = Math.sin(this.f * 0.5) * 25; // Ciclo de animação (corrida)

            ctx.beginPath();

            if(this.action === 'jump') {
                // POSE: PULO (Mario Jump)
                // Perna Dir levantada
                ctx.moveTo(0, -50); ctx.lineTo(30, -20); ctx.lineTo(40, 10);
                // Perna Esq esticada pra trás
                ctx.moveTo(0, -50); ctx.lineTo(-20, -10); ctx.lineTo(-30, 30);
                // Braço Dir pra cima (Punho pro alto)
                ctx.moveTo(0, -90); ctx.lineTo(20, -140); 
                // Braço Esq pra baixo
                ctx.moveTo(0, -90); ctx.lineTo(-20, -60);
            } 
            else if (this.action === 'crouch') {
                // POSE: AGACHADO (Bolinha)
                // Tronco curto
                ctx.moveTo(0, -30); ctx.lineTo(0, -70);
                // Pernas dobradas
                ctx.moveTo(0, -30); ctx.lineTo(-30, 0); ctx.lineTo(-40, 20);
                ctx.moveTo(0, -30); ctx.lineTo(30, 0); ctx.lineTo(40, 20);
                // Braços guardados
                ctx.moveTo(0, -70); ctx.lineTo(-25, -40);
                ctx.moveTo(0, -70); ctx.lineTo(25, -40);
                // Cabeça mais baixa
                ctx.translate(0, 30); 
            }
            else {
                // POSE: CORRIDA (Running)
                // Tronco inclinado pra frente
                ctx.moveTo(0, -40); ctx.lineTo(15, -100); 
                
                // Pernas (Alternando)
                ctx.moveTo(0, -40); ctx.lineTo(-20 + cycle, 10); ctx.lineTo(-30 + cycle, 50);
                ctx.moveTo(0, -40); ctx.lineTo(20 - cycle, 10); ctx.lineTo(30 - cycle, 50);

                // Braços (Opostos às pernas)
                const shoulderX = 15;
                const shoulderY = -90;
                ctx.moveTo(shoulderX, shoulderY); ctx.lineTo(shoulderX - 30 - cycle, shoulderY + 40);
                ctx.moveTo(shoulderX, shoulderY); ctx.lineTo(shoulderX + 30 + cycle, shoulderY + 40);
            }
            ctx.stroke();

            // CABEÇA E BANDANA
            // Posição da cabeça (topo do tronco)
            const headY = (this.action === 'crouch') ? -100 : -130;
            const headX = (this.action === 'run') ? 20 : 0; // Cabeça pra frente se correndo

            // Rosto
            ctx.fillStyle = '#ffccaa'; // Pele
            ctx.beginPath(); ctx.arc(headX, headY, 22, 0, Math.PI*2); ctx.fill();
            
            // Bandana Vermelha (Animada ao vento)
            ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 6;
            ctx.beginPath(); 
            ctx.moveTo(headX - 20, headY - 8); ctx.lineTo(headX + 20, headY - 8); 
            ctx.stroke();
            
            // Cauda da bandana
            const wind = Math.sin(this.f * 0.8) * 10;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(headX - 20, headY - 8);
            ctx.quadraticCurveTo(headX - 40, headY - 10 + wind, headX - 60, headY + 5 + wind);
            ctx.stroke();

            ctx.restore();

            // =================================================================
            // 5. HUD E FEEDBACK
            // =================================================================
            
            // Texto de Ação acima do personagem
            if(this.state === 'play') {
                ctx.font = "bold 24px 'Chakra Petch'"; ctx.textAlign = "center";
                ctx.shadowColor = "black"; ctx.shadowBlur = 4;
                
                if(this.action === 'jump') { 
                    ctx.fillStyle = "#00ff00"; 
                    ctx.fillText("PULO!", charX, charY - (h*0.22)); 
                } else if(this.action === 'crouch') { 
                    ctx.fillStyle = "#ffff00"; 
                    ctx.fillText("AGACHADO", charX, charY - (h*0.22)); 
                }
                
                ctx.shadowBlur = 0;
            }

            return this.sc; // Retorna Score para o Core System atualizar o HUD principal
        }
    };

    // Registro no Core System
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('run', 'Otto Olympics', '🏃', Logic, {camOpacity: 0.3, showWheel: false});
            clearInterval(regLoop);
        }
    }, 100);

})();
