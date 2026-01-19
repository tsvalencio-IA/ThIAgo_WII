// =============================================================================
// LÓGICA DO JOGO: OTTO SUPER RUN (NINTENDO STYLE REMASTER)
// ARQUITETO: THIAGUINHO WII (CODE 177)
// =============================================================================

(function() {
    // --- CONFIGURAÇÕES VISUAIS & GAMEPLAY ---
    const CONF = {
        SPEED: 22,               // Velocidade do mundo
        HORIZON_Y: 0.38,         // Altura do horizonte (0.0 a 1.0)
        LANE_SPREAD: 0.8,        // Espalhamento das faixas na tela
        FOCAL_LENGTH: 320,       // Distância focal para perspectiva 3D
        GRAVITY: 0.8,
        COLORS: {
            SKY_TOP: '#5c94fc',    // Azul Mario Bros
            SKY_BOT: '#95b8ff',
            GRASS: '#00cc00',      // Verde Vibrante
            TRACK: '#d65a4e',      // Terracota (Pista Olímpica)
            LINES: '#ffffff',
            PIPE:  '#00aa00'
        }
    };

    let particles = [];
    let clouds = [];
    let decors = []; // Decorações laterais (Canos, Arbustos)

    const Logic = {
        // Estado
        sc: 0,
        f: 0,
        lane: 0,            // -1, 0, 1
        currentLaneX: 0,    // Valor suavizado para animação
        action: 'run',      // 'run', 'jump', 'crouch'
        
        // Calibração
        state: 'calibrate',
        baseNoseY: 0,
        calibSamples: [],
        
        // Objetos
        obs: [],
        
        // Efeitos
        hitTimer: 0,        // Piscar tela ao bater

        init: function() { 
            this.sc = 0; 
            this.f = 0; 
            this.obs = []; 
            this.state = 'calibrate';
            this.calibSamples = [];
            this.baseNoseY = 0;
            this.action = 'run';
            this.hitTimer = 0;
            
            // Reinicia sistemas de partículas e ambiente
            particles = [];
            clouds = [];
            decors = [];
            
            // Gera nuvens iniciais
            for(let i=0; i<8; i++) {
                clouds.push({ x: (Math.random()*2000)-1000, y: Math.random()*200, z: Math.random()*1000 + 500, type: Math.random() });
            }

            window.System.msg("CALIBRANDO..."); 
        },

        update: function(ctx, w, h, pose) {
            const cx = w / 2;
            const cy = h / 2;
            const horizon = h * CONF.HORIZON_Y;
            const groundH = h - horizon;

            this.f++;

            // =================================================================
            // 1. INPUT E LÓGICA DE CONTROLE
            // =================================================================
            
            if(pose && this.hitTimer <= 0) {
                const n = pose.keypoints.find(k => k.name === 'nose');
                
                if(n && n.score > 0.4) {
                    // --- CALIBRAÇÃO ---
                    if(this.state === 'calibrate') {
                        this.calibSamples.push(n.y);
                        this.drawCalibration(ctx, w, h, cx);
                        
                        if(this.calibSamples.length > 60) {
                            const sum = this.calibSamples.reduce((a, b) => a + b, 0);
                            this.baseNoseY = sum / this.calibSamples.length;
                            this.state = 'play';
                            window.System.msg("LARGADA!"); 
                            window.Sfx.play(400, 'square', 0.5, 0.1); 
                        }
                        return 0; 
                    }
                    
                    // --- GAMEPLAY ---
                    else if(this.state === 'play') {
                        // Lane Switching (Suavizado)
                        if(n.x < w * 0.35) this.lane = 1;       // Espelhado: Esquerda na cam = Direita na tela
                        else if(n.x > w * 0.65) this.lane = -1; // Espelhado
                        else this.lane = 0;

                        // Detecção de Ação (Jump/Crouch)
                        const diff = n.y - this.baseNoseY;
                        const sensitivity = 45; 

                        if(diff < -sensitivity) this.action = 'jump';
                        else if (diff > sensitivity) this.action = 'crouch';
                        else this.action = 'run';
                    }
                }
            }

            // Suavização do movimento lateral do personagem (Lerp)
            const targetLaneX = this.lane * (w * 0.25);
            this.currentLaneX += (targetLaneX - this.currentLaneX) * 0.15;

            // =================================================================
            // 2. RENDERIZAÇÃO DO CENÁRIO (SKY & BACKGROUND)
            // =================================================================
            
            // A. Céu Degradê Vibrante
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, CONF.COLORS.SKY_TOP);
            gradSky.addColorStop(1, CONF.COLORS.SKY_BOT);
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

            // B. Nuvens Animadas (Parallax)
            this.drawClouds(ctx, w, horizon);

            // C. Blocos Flutuantes (Estilo Mario - Decorativo ao fundo)
            this.drawFloatingBlocks(ctx, w, horizon);

            // D. Arquibancada Pixelizada
            const standH = h * 0.12;
            ctx.fillStyle = '#666'; ctx.fillRect(0, horizon - standH, w, standH);
            // Pixels da torcida
            const pixelSize = 8;
            for(let py = horizon - standH; py < horizon; py += pixelSize) {
                for(let px = 0; px < w; px += pixelSize) {
                    if(Math.random() > 0.6) {
                        const cols = ['#ff3333', '#33ff33', '#3333ff', '#ffff33', '#ffffff'];
                        ctx.fillStyle = cols[Math.floor(Math.random() * cols.length)];
                        ctx.fillRect(px, py, pixelSize, pixelSize);
                    }
                }
            }

            // E. Gramado
            ctx.fillStyle = CONF.COLORS.GRASS;
            ctx.fillRect(0, horizon, w, groundH);

            // =================================================================
            // 3. PISTA E DECORAÇÕES (3D PROJECTION)
            // =================================================================
            
            ctx.save();
            ctx.translate(cx, horizon);

            // Larguras para perspectiva trapezoidal
            const trackTopW = w * 0.05; 
            const trackBotW = w * 1.1; 
            
            // Desenha Pista
            ctx.beginPath();
            ctx.fillStyle = CONF.COLORS.TRACK; 
            ctx.moveTo(-trackTopW, 0); ctx.lineTo(trackTopW, 0);
            ctx.lineTo(trackBotW, groundH); ctx.lineTo(-trackBotW, groundH);
            ctx.fill();

            // Linhas das Raias (Zebras laterais)
            const lanes = [-1, -0.33, 0.33, 1];
            ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 4;
            
            // Zebras Laterais (Vermelho e Branco alternado)
            const segmentH = 40;
            const offset = (this.f * CONF.SPEED) % (segmentH * 2);
            
            // Linhas internas
            lanes.forEach(l => {
                ctx.beginPath();
                ctx.moveTo(l * trackTopW, 0);
                ctx.lineTo(l * trackBotW, groundH);
                ctx.stroke();
            });

            ctx.restore();

            // =================================================================
            // 4. OBJETOS DO JOGO (OBSTÁCULOS & DECORAÇÕES)
            // =================================================================
            
            // Spawn Obstáculos
            if(this.state === 'play' && this.f % 80 === 0) {
                const type = Math.random() < 0.5 ? 'hurdle' : 'sign';
                const obsLane = Math.floor(Math.random() * 3) - 1; 
                this.obs.push({ lane: obsLane, z: 1500, type: type, passed: false, animOffset: Math.random() * 10 });
            }

            // Spawn Decorações (Canos/Arbustos laterais)
            if(this.state === 'play' && this.f % 30 === 0) {
                decors.push({ z: 1500, side: -1, type: Math.random() < 0.5 ? 'pipe' : 'bush' }); // Esquerda
                decors.push({ z: 1500, side: 1, type: Math.random() < 0.5 ? 'pipe' : 'bush' });  // Direita
            }

            // Fila de Renderização (Z-Sort: Fundo para Frente)
            const renderQueue = [];

            // Adiciona Obstáculos
            this.obs.forEach((o, i) => {
                o.z -= CONF.SPEED;
                if(o.z < -200) { this.obs.splice(i, 1); return; }
                renderQueue.push({ type: 'obs', obj: o, z: o.z });
            });

            // Adiciona Decorações
            decors.forEach((d, i) => {
                d.z -= CONF.SPEED;
                if(d.z < -200) { decors.splice(i, 1); return; }
                renderQueue.push({ type: 'decor', obj: d, z: d.z });
            });

            renderQueue.sort((a, b) => b.z - a.z);

            // Render Loop
            renderQueue.forEach(item => {
                const scale = CONF.FOCAL_LENGTH / (CONF.FOCAL_LENGTH + item.z);
                if(scale <= 0) return;

                const screenY = horizon + (groundH * scale); // Cola no chão
                const size = (w * 0.15) * scale; 
                
                if(item.type === 'decor') {
                    // --- DECORAÇÕES LATERAIS ---
                    const d = item.obj;
                    const spread = (w * 1.2) * scale; // Bem fora da pista
                    const sx = cx + (d.side * spread);
                    
                    if(d.type === 'pipe') {
                        // Cano Verde Estilo Mario
                        const pH = size * 1.0;
                        const pW = size * 0.6;
                        ctx.fillStyle = CONF.COLORS.PIPE;
                        ctx.strokeStyle = '#004400'; ctx.lineWidth = 2 * scale;
                        
                        // Corpo
                        ctx.fillRect(sx - pW/2, screenY - pH, pW, pH);
                        ctx.strokeRect(sx - pW/2, screenY - pH, pW, pH);
                        // Borda Superior
                        ctx.fillRect(sx - pW/2 - (5*scale), screenY - pH, pW + (10*scale), 15*scale);
                        ctx.strokeRect(sx - pW/2 - (5*scale), screenY - pH, pW + (10*scale), 15*scale);
                        
                        // Brilho
                        ctx.fillStyle = 'rgba(255,255,255,0.3)';
                        ctx.fillRect(sx - pW/4, screenY - pH + 5, 5*scale, pH - 10);
                    } else {
                        // Arbusto Pixelado
                        ctx.fillStyle = '#228B22';
                        ctx.beginPath();
                        ctx.arc(sx, screenY, size*0.5, Math.PI, 0);
                        ctx.arc(sx + size*0.4, screenY, size*0.4, Math.PI, 0);
                        ctx.arc(sx - size*0.4, screenY, size*0.4, Math.PI, 0);
                        ctx.fill();
                    }
                }
                else if (item.type === 'obs') {
                    // --- OBSTÁCULOS DA PISTA ---
                    const o = item.obj;
                    
                    // Cálculo de posição X na pista
                    const currentTrackW = trackTopW + (trackBotW - trackTopW) * scale;
                    const laneSpread = currentTrackW * CONF.LANE_SPREAD;
                    const sx = cx + (o.lane * laneSpread);

                    // Sombra
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.beginPath(); ctx.ellipse(sx, screenY, size*0.6, size*0.2, 0, 0, Math.PI*2); ctx.fill();

                    if(o.type === 'hurdle') {
                        // Barreira de Pulo (Estilo Atletismo Mario)
                        const hH = size * 0.6;
                        
                        // Pernas
                        ctx.lineWidth = 4 * scale; ctx.strokeStyle = '#fff';
                        ctx.beginPath();
                        ctx.moveTo(sx - size/2, screenY); ctx.lineTo(sx - size/2, screenY - hH);
                        ctx.moveTo(sx + size/2, screenY); ctx.lineTo(sx + size/2, screenY - hH);
                        ctx.stroke();

                        // Barra Superior (Listrada)
                        const barH = 20 * scale;
                        ctx.fillStyle = '#fff'; ctx.fillRect(sx - size/2 - 2, screenY - hH - barH, size + 4, barH);
                        
                        // Listras Vermelhas Animadas
                        const shift = Math.sin(this.f * 0.2 + o.animOffset) * (size*0.1);
                        ctx.fillStyle = '#ff3333';
                        ctx.fillRect(sx - size/4 + shift, screenY - hH - barH, size/5, barH);
                        ctx.fillRect(sx + size/4 + shift, screenY - hH - barH, size/5, barH);

                        if(scale > 0.5 && !o.passed) this.drawActionHint(ctx, sx, screenY - hH - 30*scale, "PULO!", scale, '#ffff00');
                    } 
                    else {
                        // Placa de Abaixar (Estilo Bloco ? do Mario)
                        const signH = size * 2.5;
                        const signBox = size * 0.8;
                        
                        // Poste
                        ctx.fillStyle = '#333'; ctx.fillRect(sx - 2*scale, screenY - signH, 4*scale, signH);
                        
                        // Bloco [?]
                        const boxY = screenY - signH + Math.sin(this.f * 0.1) * 5; // Flutua levemente
                        ctx.fillStyle = '#f1c40f'; // Gold
                        ctx.fillRect(sx - signBox/2, boxY, signBox, signBox);
                        ctx.strokeStyle = '#c27c0e'; ctx.lineWidth = 3*scale;
                        ctx.strokeRect(sx - signBox/2, boxY, signBox, signBox);
                        
                        // Pontos do Bloco
                        ctx.fillStyle = '#c27c0e'; ctx.fillRect(sx - signBox/2 + 2, boxY + 2, 4*scale, 4*scale);
                        ctx.fillRect(sx + signBox/2 - 6*scale, boxY + 2, 4*scale, 4*scale);
                        ctx.fillRect(sx - signBox/2 + 2, boxY + signBox - 6*scale, 4*scale, 4*scale);
                        ctx.fillRect(sx + signBox/2 - 6*scale, boxY + signBox - 6*scale, 4*scale, 4*scale);

                        // Seta Branca
                        ctx.fillStyle = '#fff'; ctx.beginPath();
                        ctx.moveTo(sx, boxY + signBox*0.8);
                        ctx.lineTo(sx - signBox*0.3, boxY + signBox*0.4);
                        ctx.lineTo(sx + signBox*0.3, boxY + signBox*0.4);
                        ctx.fill();

                        if(scale > 0.5 && !o.passed) this.drawActionHint(ctx, sx, boxY - 20*scale, "ABAIXE!", scale, '#fff');
                    }

                    // --- LÓGICA DE COLISÃO ---
                    if(o.z < 100 && o.z > 0 && this.state === 'play') {
                        if(o.lane === this.lane) {
                            let hit = false;
                            if(o.type === 'hurdle' && this.action !== 'jump') hit = true;
                            if(o.type === 'sign' && this.action !== 'crouch') hit = true;

                            if(hit) {
                                this.hitTimer = 10;
                                window.Gfx.shake(20);
                                window.Sfx.crash();
                                window.System.gameOver(this.sc);
                            } else if(!o.passed) {
                                // SUCESSO!
                                this.sc += 100;
                                window.Sfx.coin(); // Som de moeda
                                o.passed = true;
                                this.spawnParticles(sx, screenY - size, 10, '#ffff00'); // Confete
                            }
                        }
                    }
                }
            });

            // =================================================================
            // 5. PERSONAGEM (ESTILO PLUMBER BOY - NINTENDO VIBE)
            // =================================================================
            
            const charX = cx + this.currentLaneX;
            let charY = h * 0.85; // Base do chão

            // Física Vertical
            if(this.action === 'jump') charY -= h * 0.20; // Pulo mais alto
            if(this.action === 'crouch') charY += h * 0.05;

            // Escala corrigida: w * 0.0035 para ficar "chibi" e caber na tela
            this.drawCharacter(ctx, charX, charY, w, h);

            // =================================================================
            // 6. EFEITOS E PARTICULAS
            // =================================================================
            
            // Renderiza Partículas
            particles.forEach((p, i) => {
                p.x += p.vx; p.y += p.vy; p.life--;
                p.vy += 0.5; // Gravidade
                if(p.life <= 0) particles.splice(i, 1);
                else {
                    ctx.fillStyle = p.c;
                    ctx.fillRect(p.x, p.y, p.s, p.s);
                }
            });

            // Flash de Dano
            if(this.hitTimer > 0) {
                ctx.fillStyle = `rgba(255, 0, 0, ${this.hitTimer * 0.1})`;
                ctx.fillRect(0, 0, w, h);
                this.hitTimer--;
            }

            return this.sc;
        },

        // --- FUNÇÕES DE DESENHO AUXILIARES ---

        drawClouds: function(ctx, w, horizon) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            clouds.forEach(c => {
                c.x -= 0.5; // Move lento
                if(c.x < -200) c.x = w + 200;
                
                // Desenha nuvem simples
                const s = 1000 / c.z;
                const cx = c.x; const cy = c.y + (horizon * 0.2);
                ctx.beginPath();
                ctx.arc(cx, cy, 30*s, 0, Math.PI*2);
                ctx.arc(cx+25*s, cy-10*s, 35*s, 0, Math.PI*2);
                ctx.arc(cx+50*s, cy, 30*s, 0, Math.PI*2);
                ctx.fill();
            });
        },

        drawFloatingBlocks: function(ctx, w, horizon) {
            // Desenha alguns blocos "tijolo" flutuando ao fundo
            const blockSize = 30;
            const offset = (this.f * 0.5) % 1000;
            const blockY = horizon * 0.5;
            
            ctx.fillStyle = '#b85c00'; // Marrom Tijolo
            ctx.strokeStyle = '#000';
            
            for(let i=0; i<w; i+= 300) {
                const bx = (i - offset + 1000) % (w + 200) - 100;
                ctx.fillRect(bx, blockY, blockSize, blockSize);
                ctx.strokeRect(bx, blockY, blockSize, blockSize);
                
                // ? Block ocasional
                if(i % 600 === 0) {
                    ctx.fillStyle = '#f1c40f'; // Gold
                    ctx.fillRect(bx+35, blockY - 40, blockSize, blockSize);
                    ctx.strokeRect(bx+35, blockY - 40, blockSize, blockSize);
                    ctx.fillStyle = '#b85c00'; // Reset
                }
            }
        },

        drawCharacter: function(ctx, x, y, w, h) {
            // ESCALA REDUZIDA E CORRIGIDA PARA MOBILE
            // w * 0.0035 cria um boneco "chibi" que não ocupa a tela toda
            const s = w * 0.0035; 
            
            // Sombra no Chão (Fixa no Y base do chão para dar referência de altura no pulo)
            const groundY = h * 0.88;
            const shadowS = this.action === 'jump' ? s * 0.5 : s; // Sombra diminui no pulo
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath(); ctx.ellipse(x, groundY, 45*shadowS, 12*shadowS, 0, 0, Math.PI*2); ctx.fill();

            ctx.save();
            ctx.translate(x, y);
            ctx.scale(s, s);

            // Variáveis de animação
            const cycle = Math.sin(this.f * 0.4) * 20;
            const jumpOffset = this.action === 'jump' ? -10 : 0;
            
            // CORES DO PERSONAGEM (Estilo Plumber)
            const C_SKIN = '#ffccaa';
            const C_SHIRT = '#ff0000'; // Vermelho Mario
            const C_OVERALL = '#0000ff'; // Azul
            const C_BUTTON = '#ffff00';
            const C_BOOT = '#654321';
            const C_GLOVE = '#ffffff';

            // --- 1. PERNAS (Banhadas, curtas e grossas) ---
            ctx.fillStyle = C_OVERALL;
            if(this.action === 'run') {
                // Perna Esq
                this.drawLimb(ctx, -15, 0, 14, 30, cycle);
                // Perna Dir
                this.drawLimb(ctx, 15, 0, 14, 30, -cycle);
            } else if (this.action === 'jump') {
                // Pulo (uma dobrada)
                this.drawLimb(ctx, -15, -10, 14, 25, -20);
                this.drawLimb(ctx, 15, 5, 14, 35, 10);
            } else { // Crouch
                this.drawLimb(ctx, -20, -5, 14, 20, -40);
                this.drawLimb(ctx, 20, -5, 14, 20, 40);
            }

            // --- 2. BOTAS ---
            ctx.fillStyle = C_BOOT;
            if(this.action === 'run') {
                this.drawOval(ctx, -15 + (cycle*0.8), 30 - (Math.abs(cycle)*0.2), 16, 12);
                this.drawOval(ctx, 15 - (cycle*0.8), 30 - (Math.abs(cycle)*0.2), 16, 12);
            } else if (this.action === 'jump') {
                this.drawOval(ctx, -18, 15, 16, 12); // Esq cima
                this.drawOval(ctx, 18, 40, 16, 12);  // Dir baixo
            } else {
                this.drawOval(ctx, -25, 15, 16, 12);
                this.drawOval(ctx, 25, 15, 16, 12);
            }

            // --- 3. CORPO (Gordinho) ---
            const bodyH = this.action === 'crouch' ? 35 : 45;
            const bodyY = this.action === 'crouch' ? -20 : -40;
            
            // Camisa Vermelha (Base)
            ctx.fillStyle = C_SHIRT;
            ctx.beginPath(); ctx.arc(0, bodyY, 28, 0, Math.PI*2); ctx.fill();
            
            // Macacão Azul
            ctx.fillStyle = C_OVERALL;
            ctx.fillRect(-20, bodyY, 40, 30);
            ctx.beginPath(); ctx.arc(0, bodyY+30, 21, 0, Math.PI, false); ctx.fill(); // Fundo arredondado

            // Botões Amarelos
            ctx.fillStyle = C_BUTTON;
            ctx.beginPath(); ctx.arc(-10, bodyY+5, 4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(10, bodyY+5, 4, 0, Math.PI*2); ctx.fill();

            // --- 4. BRAÇOS (Curtos) ---
            ctx.fillStyle = C_SHIRT;
            const armY = bodyY - 5;
            if(this.action === 'jump') {
                // Braço Soco pra Cima
                ctx.beginPath(); ctx.ellipse(25, armY-20, 10, 20, -0.5, 0, Math.PI*2); ctx.fill(); // Dir
                ctx.beginPath(); ctx.ellipse(-25, armY+10, 10, 15, 0.5, 0, Math.PI*2); ctx.fill(); // Esq
                // Luvas
                ctx.fillStyle = C_GLOVE;
                ctx.beginPath(); ctx.arc(32, armY-35, 12, 0, Math.PI*2); ctx.fill(); // Punho Cima
                ctx.beginPath(); ctx.arc(-30, armY+20, 10, 0, Math.PI*2); ctx.fill(); // Mão Baixo
            } 
            else {
                // Correndo (Balança oposto às pernas)
                const armSwing = this.action === 'run' ? -cycle : 0;
                // Esq
                ctx.beginPath(); ctx.ellipse(-28 + (armSwing*0.5), armY + 10, 10, 18, 0.5 + (armSwing*0.02), 0, Math.PI*2); ctx.fill();
                // Dir
                ctx.beginPath(); ctx.ellipse(28 - (armSwing*0.5), armY + 10, 10, 18, -0.5 - (armSwing*0.02), 0, Math.PI*2); ctx.fill();
                
                // Luvas
                ctx.fillStyle = C_GLOVE;
                ctx.beginPath(); ctx.arc(-32 + (armSwing*0.8), armY+25, 10, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(32 - (armSwing*0.8), armY+25, 10, 0, Math.PI*2); ctx.fill();
            }

            // --- 5. CABEÇA (Grande e Redonda) ---
            const headY = bodyY - 25;
            
            // Rosto
            ctx.fillStyle = C_SKIN;
            ctx.beginPath(); ctx.arc(0, headY, 26, 0, Math.PI*2); ctx.fill();
            
            // Nariz (Batata)
            ctx.beginPath(); ctx.ellipse(0, headY+5, 8, 6, 0, 0, Math.PI*2); ctx.fill();

            // Bigode (Preto e Grosso)
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.moveTo(-12, headY+12);
            ctx.quadraticCurveTo(0, headY+8, 12, headY+12); // Cima
            ctx.quadraticCurveTo(14, headY+16, 0, headY+18); // Baixo
            ctx.quadraticCurveTo(-14, headY+16, -12, headY+12);
            ctx.fill();

            // Olhos (Ovais Pretos)
            ctx.beginPath(); ctx.ellipse(-8, headY-4, 4, 7, 0, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(8, headY-4, 4, 7, 0, 0, Math.PI*2); ctx.fill();
            // Brilho dos olhos
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(-7, headY-7, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(9, headY-7, 2, 0, Math.PI*2); ctx.fill();

            // --- 6. BONÉ (Vermelho com Aba) ---
            ctx.fillStyle = C_SHIRT; // Vermelho
            // Cúpula
            ctx.beginPath(); ctx.arc(0, headY-8, 26, Math.PI, 0); ctx.fill();
            // Aba
            ctx.fillRect(-28, headY-12, 56, 8);
            // Símbolo "M" (opcional, branco)
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, headY-15, 8, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'red';
            ctx.font = "bold 10px Arial"; ctx.textAlign="center"; 
            ctx.fillText("M", 0, headY-12);

            ctx.restore();

            // HUD Ação
            if(this.state === 'play') {
                ctx.font = "bold 26px 'Chakra Petch'"; ctx.textAlign = "center";
                ctx.shadowColor = "black"; ctx.shadowBlur = 4;
                if(this.action === 'jump') { ctx.fillStyle = "#00ff00"; ctx.fillText("PULO!", x, y - (h*0.25)); }
                else if(this.action === 'crouch') { ctx.fillStyle = "#ffff00"; ctx.fillText("AGACHADO", x, y - (h*0.22)); }
                ctx.shadowBlur = 0;
            }
        },

        // Helper para desenhar membros arredondados
        drawLimb: function(ctx, x, y, w, h, angleDeg) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angleDeg * Math.PI / 180);
            ctx.beginPath();
            ctx.ellipse(0, h/2, w/2, h/2, 0, 0, Math.PI*2);
            ctx.fill();
            ctx.restore();
        },

        drawOval: function(ctx, x, y, w, h) {
            ctx.beginPath();
            ctx.ellipse(x, y, w/2, h/2, 0, 0, Math.PI*2);
            ctx.fill();
        },

        drawCalibration: function(ctx, w, h, cx) {
            ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#fff"; ctx.font = "bold 30px 'Russo One'"; ctx.textAlign = "center";
            ctx.fillText("FIQUE EM POSIÇÃO NEUTRA", cx, h*0.4);
            
            const pct = this.calibSamples.length / 60;
            ctx.fillStyle = "#3498db"; 
            ctx.fillRect(cx - 150, h*0.5, 300 * pct, 20);
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
            ctx.strokeRect(cx - 150, h*0.5, 300, 20);
        },

        drawActionHint: function(ctx, x, y, text, scale, color) {
            ctx.font = `bold ${16*scale}px Arial`; 
            ctx.textAlign='center';
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillText(text, x+2, y+2); // Sombra
            ctx.fillStyle = color;
            ctx.fillText(text, x, y);
        },

        spawnParticles: function(x, y, count, color) {
            for(let i=0; i<count; i++) {
                particles.push({
                    x: x, y: y,
                    vx: (Math.random() - 0.5) * 10,
                    vy: (Math.random() - 1.0) * 10,
                    life: 20 + Math.random() * 10,
                    c: color,
                    s: 4 + Math.random() * 4
                });
            }
        }
    };

    // --- REGISTRO NO SISTEMA ---
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('run', 'Otto Super Run', '🏃', Logic, {camOpacity: 0.3, showWheel: false});
            clearInterval(regLoop);
        }
    }, 100);

})();
