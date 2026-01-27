// =============================================================================
// LÓGICA DO JOGO: OTTO BOXING (LUIGI'S TRAINING GYM EDITION)
// ARQUITETO: CODE 177
// =============================================================================

(function() {
    let particles = [];
    let popups = [];

    // Configurações Globais
    const CONF = {
        GAME_DURATION: 120, // 2 minutos em segundos
        TARGET_SPAWN_RATE: 700, // ms entre alvos
        GRAVITY: 0.4,
        COLORS: {
            HAT: '#40a832',     // Verde Luigi
            SHIRT: '#40a832',
            OVERALL: '#2b3a8f', // Azul Macacão
            SKIN: '#ffccaa',
            GLOVE: '#ffffff',
            GLOVE_SEC: '#ddd'
        }
    };

    const Logic = {
        sc: 0,           // Score
        tg: [],          // Alvos
        lastSpawn: 0,    // Controle de tempo de spawn
        timeLeft: 0,     // Tempo restante
        startTime: 0,    // Marcação de início
        state: 'intro',  // intro, play, finished
        
        // Estado do Jogador (Suavização)
        player: {
            head: {x:0, y:0},
            shoulders: {l:{x:0,y:0}, r:{x:0,y:0}},
            elbows: {l:{x:0,y:0}, r:{x:0,y:0}},
            wrists: {l:{x:0,y:0}, r:{x:0,y:0}},
            baseX: 0
        },

        init: function() { 
            this.sc = 0; 
            this.tg = []; 
            particles = []; 
            popups = [];
            this.state = 'play';
            this.timeLeft = CONF.GAME_DURATION;
            this.startTime = Date.now();
            this.lastSpawn = 0;
            
            window.System.msg("START!"); 
            window.Sfx.play(600, 'square', 0.5, 0.1);
        },
        
        update: function(ctx, w, h, pose) {
            const now = Date.now();
            
            // 1. GERENCIAMENTO DE TEMPO
            if (this.state === 'play') {
                const elapsed = (now - this.startTime) / 1000;
                this.timeLeft = Math.max(0, CONF.GAME_DURATION - elapsed);
                
                if (this.timeLeft <= 0) {
                    this.state = 'finished';
                    window.System.gameOver(Math.floor(this.sc));
                    return this.sc;
                }
            }

            // 2. FUNDO (RINGUE DE BOXE)
            this.drawBackground(ctx, w, h);

            // 3. PROCESSAMENTO DE POSE E DESENHO DO AVATAR (LUIGI)
            this.updatePlayerPose(pose, w, h);
            this.drawLuigiAvatar(ctx, w, h);

            // 4. LÓGICA DE ALVOS (Somente se jogando)
            if (this.state === 'play') {
                // Spawn
                if (now - this.lastSpawn > CONF.TARGET_SPAWN_RATE) {
                    // Tenta criar alvo perto do alcance do jogador
                    const rangeX = w * 0.35;
                    const cX = w / 2;
                    
                    this.tg.push({
                        x: (cX - rangeX) + Math.random() * (rangeX * 2),
                        y: (h * 0.2) + Math.random() * (h * 0.4),
                        r: w * 0.07,
                        born: now,
                        life: 2000, // ms de vida
                        maxLife: 2000,
                        id: Math.random()
                    });
                    this.lastSpawn = now;
                }

                // Update & Colisão
                const p = this.player;
                const hitboxes = [p.wrists.l, p.wrists.r]; // Apenas as luvas colidem

                for (let i = this.tg.length - 1; i >= 0; i--) {
                    let t = this.tg[i];
                    let age = now - t.born;
                    
                    // Remove se expirou
                    if (age > t.life) {
                        this.tg.splice(i, 1);
                        continue;
                    }

                    // Verifica Colisão
                    let hit = false;
                    hitboxes.forEach(hand => {
                        if (hand.x !== 0 && Math.hypot(hand.x - t.x, hand.y - t.y) < t.r + 20) {
                            hit = true;
                        }
                    });

                    if (hit) {
                        // ACERTOU!
                        this.sc += 50;
                        window.Sfx.hit();
                        window.System.msg("POW!");
                        
                        // Efeitos Visuais
                        this.spawnParticles(t.x, t.y, 15, '#ffff00');
                        popups.push({x: t.x, y: t.y, text: "+50", life: 1.0, dy: -3});
                        
                        this.tg.splice(i, 1);
                    }
                }
            }

            // 5. RENDERIZAÇÃO DE ALVOS
            this.tg.forEach(t => {
                const pct = 1 - ((now - t.born) / t.life);
                
                ctx.save();
                ctx.translate(t.x, t.y);
                const scale = 0.8 + (Math.sin(now * 0.01) * 0.1);
                ctx.scale(scale, scale);

                // Anel de tempo
                ctx.beginPath();
                ctx.arc(0, 0, t.r, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * pct));
                ctx.strokeStyle = pct < 0.3 ? '#ff0000' : '#00ffff';
                ctx.lineWidth = 8;
                ctx.stroke();

                // Corpo do alvo (Estilo Almofada de treino)
                const grad = ctx.createRadialGradient(-10, -10, 5, 0, 0, t.r);
                grad.addColorStop(0, '#ffaa00');
                grad.addColorStop(1, '#cc5500');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.arc(0, 0, t.r - 5, 0, Math.PI*2); ctx.fill();
                
                // Marca central
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(0, 0, t.r * 0.3, 0, Math.PI*2); ctx.fill();

                ctx.restore();
            });

            // 6. EFEITOS (Partículas e Textos)
            this.renderEffects(ctx);

            // 7. HUD (TEMPO)
            this.drawHUD(ctx, w, h);

            return this.sc;
        },

        // --- SISTEMA DE AVATAR (LUIGI PSEUDO-3D) ---
        updatePlayerPose: function(pose, w, h) {
            // Se não detectar pose, usa uma pose "idle" no centro
            if (!pose || !pose.keypoints) return;

            const kp = pose.keypoints;
            const find = (n) => {
                const k = kp.find(p => p.name === n);
                return (k && k.score > 0.3) ? window.Gfx.map(k, w, h) : null;
            };

            const nose = find('nose');
            const ls = find('left_shoulder');
            const rs = find('right_shoulder');
            const le = find('left_elbow');
            const re = find('right_elbow');
            const lw = find('left_wrist');
            const rw = find('right_wrist');

            // Suavização simples (Lerp) para evitar tremedeira
            const lerp = (curr, target) => target ? { x: curr.x + (target.x - curr.x) * 0.3, y: curr.y + (target.y - curr.y) * 0.3 } : curr;

            if(nose) this.player.head = lerp(this.player.head, nose);
            if(ls) this.player.shoulders.l = lerp(this.player.shoulders.l, ls);
            if(rs) this.player.shoulders.r = lerp(this.player.shoulders.r, rs);
            if(le) this.player.elbows.l = lerp(this.player.elbows.l, le);
            if(re) this.player.elbows.r = lerp(this.player.elbows.r, re);
            if(lw) this.player.wrists.l = lerp(this.player.wrists.l, lw);
            if(rw) this.player.wrists.r = lerp(this.player.wrists.r, rw);
        },

        drawLuigiAvatar: function(ctx, w, h) {
            const p = this.player;
            // Se os ombros não estiverem visíveis, não desenha nada
            if (p.shoulders.l.x === 0 || p.shoulders.r.x === 0) return;

            // Define tamanhos baseados na distância dos ombros (Escala dinâmica)
            const shoulderDist = Math.hypot(p.shoulders.r.x - p.shoulders.l.x, p.shoulders.r.y - p.shoulders.l.y);
            const scale = shoulderDist / 100; 

            // Funções de desenho auxiliares
            const drawLimb = (p1, p2, color, width) => {
                if (p1.x === 0 || p2.x === 0) return;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = width * scale;
                ctx.strokeStyle = color;
                ctx.stroke();
            };

            const drawCircle = (x, y, r, color) => {
                ctx.beginPath(); ctx.arc(x, y, r * scale, 0, Math.PI*2); 
                ctx.fillStyle = color; ctx.fill();
            };

            // 1. CORPO E MACACÃO
            // Centro do peito
            const chestX = (p.shoulders.l.x + p.shoulders.r.x) / 2;
            const chestY = (p.shoulders.l.y + p.shoulders.r.y) / 2;
            
            // Corpo (Camisa Verde)
            ctx.fillStyle = CONF.COLORS.SHIRT;
            ctx.beginPath();
            ctx.ellipse(chestX, chestY + (40*scale), 50*scale, 70*scale, 0, 0, Math.PI*2);
            ctx.fill();

            // Macacão Azul
            ctx.fillStyle = CONF.COLORS.OVERALL;
            ctx.fillRect(chestX - 35*scale, chestY + 50*scale, 70*scale, 80*scale);
            // Alças do Macacão
            ctx.lineWidth = 10 * scale; ctx.strokeStyle = CONF.COLORS.OVERALL;
            ctx.beginPath(); ctx.moveTo(p.shoulders.l.x, p.shoulders.l.y + 10); ctx.lineTo(chestX - 20*scale, chestY + 60*scale); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(p.shoulders.r.x, p.shoulders.r.y + 10); ctx.lineTo(chestX + 20*scale, chestY + 60*scale); ctx.stroke();
            // Botões Amarelos
            drawCircle(chestX - 20*scale, chestY + 60*scale, 6, '#ffff00');
            drawCircle(chestX + 20*scale, chestY + 60*scale, 6, '#ffff00');

            // 2. BRAÇOS
            const armWidth = 25;
            // Braço Esquerdo
            drawLimb(p.shoulders.l, p.elbows.l, CONF.COLORS.SHIRT, armWidth);
            drawLimb(p.elbows.l, p.wrists.l, CONF.COLORS.SHIRT, armWidth);
            // Braço Direito
            drawLimb(p.shoulders.r, p.elbows.r, CONF.COLORS.SHIRT, armWidth);
            drawLimb(p.elbows.r, p.wrists.r, CONF.COLORS.SHIRT, armWidth);

            // 3. CABEÇA
            // Pescoço
            ctx.fillStyle = CONF.COLORS.SKIN;
            ctx.fillRect(chestX - 15*scale, chestY - 30*scale, 30*scale, 40*scale);

            if (p.head.x !== 0) {
                // Cabeça Base
                drawCircle(p.head.x, p.head.y, 45, CONF.COLORS.SKIN);
                
                // Bigode (Curvas Bézier)
                ctx.fillStyle = '#000';
                ctx.beginPath();
                const my = p.head.y + 10*scale;
                ctx.moveTo(p.head.x, my);
                ctx.bezierCurveTo(p.head.x - 20*scale, my - 10*scale, p.head.x - 30*scale, my + 20*scale, p.head.x, my + 10*scale);
                ctx.bezierCurveTo(p.head.x + 30*scale, my + 20*scale, p.head.x + 20*scale, my - 10*scale, p.head.x, my);
                ctx.fill();

                // Nariz
                drawCircle(p.head.x, p.head.y, 10, '#ffaaaa');

                // Olhos (Ovai simples)
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.ellipse(p.head.x - 12*scale, p.head.y - 15*scale, 4*scale, 8*scale, 0, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(p.head.x + 12*scale, p.head.y - 15*scale, 4*scale, 8*scale, 0, 0, Math.PI*2); ctx.fill();

                // Boné Verde
                ctx.fillStyle = CONF.COLORS.HAT;
                ctx.beginPath();
                ctx.arc(p.head.x, p.head.y - 10*scale, 46*scale, Math.PI, 0); // Domo
                ctx.fill();
                // Aba do boné
                ctx.beginPath();
                ctx.ellipse(p.head.x, p.head.y - 12*scale, 50*scale, 15*scale, 0, Math.PI, 0);
                ctx.fill();
                // Logo 'L'
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(p.head.x, p.head.y - 35*scale, 12*scale, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = CONF.COLORS.HAT;
                ctx.font = `bold ${16*scale}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText("L", p.head.x, p.head.y - 34*scale);
            }

            // 4. LUVAS DE BOXE (Desenhadas por último para ficar na frente)
            const drawGlove = (pos) => {
                if (pos.x === 0) return;
                const gSize = 35 * scale;
                
                // Corpo da luva
                const grad = ctx.createRadialGradient(pos.x - 10, pos.y - 10, 5, pos.x, pos.y, gSize);
                grad.addColorStop(0, '#ffffff');
                grad.addColorStop(1, '#cccccc');
                
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.arc(pos.x, pos.y, gSize, 0, Math.PI*2); ctx.fill();
                
                // Detalhe (Dedão)
                ctx.fillStyle = '#bbbbbb';
                ctx.beginPath(); ctx.arc(pos.x + gSize*0.5, pos.y + gSize*0.2, gSize*0.3, 0, Math.PI*2); ctx.fill();
                
                // Faixa do pulso
                ctx.fillStyle = CONF.COLORS.SHIRT; // Verde para combinar
                ctx.fillRect(pos.x - gSize*0.6, pos.y + gSize*0.5, gSize*1.2, 15*scale);
            };

            drawGlove(p.wrists.l);
            drawGlove(p.wrists.r);
        },

        drawBackground: function(ctx, w, h) {
            // Fundo escuro
            ctx.fillStyle = '#111'; ctx.fillRect(0,0,w,h);
            
            // Holofote central
            const grad = ctx.createRadialGradient(w/2, 0, 50, w/2, h, w);
            grad.addColorStop(0, 'rgba(40, 60, 100, 0.4)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);

            // Cordas do Ringue (Fundo)
            ctx.lineWidth = 6;
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.beginPath(); ctx.moveTo(0, h*0.4); ctx.lineTo(w, h*0.4); ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath(); ctx.moveTo(0, h*0.55); ctx.lineTo(w, h*0.55); ctx.stroke();
            ctx.strokeStyle = 'rgba(0, 0, 255, 0.3)';
            ctx.beginPath(); ctx.moveTo(0, h*0.7); ctx.lineTo(w, h*0.7); ctx.stroke();
        },

        drawHUD: function(ctx, w, h) {
            // Caixa de Tempo
            const min = Math.floor(this.timeLeft / 60);
            const sec = Math.floor(this.timeLeft % 60).toString().padStart(2, '0');
            
            ctx.save();
            ctx.translate(w/2, 50);
            
            // Fundo LCD
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.beginPath(); 
            ctx.moveTo(-70, -30); ctx.lineTo(70, -30); ctx.lineTo(60, 30); ctx.lineTo(-60, 30); 
            ctx.fill();
            
            // Borda Neon
            ctx.strokeStyle = this.timeLeft < 10 ? '#ff0000' : '#00ffff';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Texto
            ctx.fillStyle = this.timeLeft < 10 ? '#ff5555' : '#ffffff';
            ctx.font = "bold 40px 'Russo One'";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${min}:${sec}`, 0, 0);
            
            // Label
            ctx.fillStyle = '#aaa';
            ctx.font = "10px sans-serif";
            ctx.fillText("TIME LIMIT", 0, -38);

            ctx.restore();
        },

        spawnParticles: function(x, y, count, color) {
            for(let i=0; i<count; i++){
                particles.push({
                    x: x, y: y,
                    vx: (Math.random()-0.5)*15, vy: (Math.random()-0.5)*15,
                    color: color, life: 1.0, size: Math.random() * 6
                });
            }
        },

        renderEffects: function(ctx) {
            // Partículas
            particles.forEach((p,i)=>{
                p.x += p.vx; p.y += p.vy; p.life -= 0.05;
                if(p.life <= 0) particles.splice(i,1);
                else {
                    ctx.fillStyle = p.color; ctx.globalAlpha = p.life;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
                }
            });
            
            // Popups de Dano
            popups.forEach((p,i)=>{
                p.y += p.dy; p.life -= 0.02;
                if(p.life <= 0) popups.splice(i,1);
                else {
                    ctx.fillStyle = "#fff"; ctx.globalAlpha = p.life;
                    ctx.font = "italic 900 40px 'Roboto'"; 
                    ctx.strokeStyle = "#000"; ctx.lineWidth = 4;
                    ctx.strokeText(p.text, p.x, p.y); 
                    ctx.fillText(p.text, p.x, p.y);
                }
            });
            ctx.globalAlpha = 1.0;
        }
    };

    // REGISTRO
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('fight', 'Luigi Boxe', '🥊', Logic, {camOpacity: 0.1, showWheel: false});
            clearInterval(regLoop);
        }
    }, 100);
})();