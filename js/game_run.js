// LÓGICA DO JOGO: OTTO RUNNER (HUMANOID EDITION)
(function() {
    const Logic = {
        lane: 0, // -1 (Esq), 0 (Meio), 1 (Dir)
        action: 'run', // run, jump, crouch
        sc: 0, 
        f: 0, 
        obs: [], 
        playerY: 0, // Posição vertical para pulo

        init: function(){ 
            this.sc=0; this.obs=[]; this.f=0; this.action='run';
            window.System.msg("FIQUE DE PÉ!"); 
        },

        update: function(ctx, w, h, pose){
            const cx = w / 2; 
            this.f++;
            
            // 1. DETECÇÃO DE POSE (IA)
            // Precisamos calibrar o "Centro" verticalmente na primeira execução, 
            // mas faremos dinâmico baseado na altura do nariz.
            
            if(pose){
                const n = pose.keypoints.find(k=>k.name==='nose');
                const ls = pose.keypoints.find(k=>k.name==='left_shoulder');
                const rs = pose.keypoints.find(k=>k.name==='right_shoulder');

                if(n && n.score > 0.4) {
                    // CONTROLE LATERAL (Pista)
                    if(n.x < 200) this.lane = 1;      // Espelhado: Esquerda na tela = Direita Real
                    else if(n.x > 440) this.lane = -1; 
                    else this.lane = 0;

                    // CONTROLE VERTICAL (Pular/Agachar)
                    // Baseado na posição Y do nariz em relação à tela (0 a 480)
                    // Normal é aprox 150-250. 
                    
                    if(n.y < 120) { 
                        this.action = 'jump'; 
                    } else if (n.y > 320) { 
                        this.action = 'crouch';
                    } else {
                        this.action = 'run';
                    }
                }
            }

            // 2. GERAÇÃO DE OBSTÁCULOS
            // Tipos: 0=Caixa (Pular), 1=Viga (Agachar)
            if(this.f % 60 === 0) {
                const type = Math.random() < 0.5 ? 'box' : 'beam';
                // Obstaculos surgem na pista atual ou aleatoria
                const lane = Math.floor(Math.random()*3)-1;
                this.obs.push({l: lane, z: 1000, type: type});
            }

            // 3. CENÁRIO 3D (GRID INFINITO)
            ctx.fillStyle='#050510'; ctx.fillRect(0,0,w,h); // Céu noturno
            
            // Horizonte
            const horizon = h * 0.45;
            const gradFloor = ctx.createLinearGradient(0, horizon, 0, h);
            gradFloor.addColorStop(0, '#110022'); gradFloor.addColorStop(1, '#220044');
            ctx.fillStyle = gradFloor; ctx.fillRect(0, horizon, w, h);

            // Linhas de perspectiva
            ctx.save(); ctx.translate(cx, horizon);
            ctx.strokeStyle = '#ff00ff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.4;
            
            // Linhas verticais (Lanes)
            const perspective = 200;
            [-1.5, -0.5, 0.5, 1.5].forEach(offset => {
                ctx.beginPath();
                ctx.moveTo(offset * 20, 0); // Ponto de fuga
                ctx.lineTo(offset * w * 1.5, h); 
                ctx.stroke();
            });

            // Linhas horizontais (Movimento)
            const speedZ = (this.f * 15) % 100;
            for(let i=0; i<10; i++) {
                const z = 100 + (i * 100) - speedZ;
                const y = (z / 1000) * (h - horizon);
                ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(w, y); ctx.stroke();
            }
            ctx.restore();

            // 4. OBSTÁCULOS
            this.obs.forEach((o, i) => {
                o.z -= 15; // Velocidade do jogo
                if(o.z < -100) { this.obs.splice(i,1); this.sc += 10; window.Sfx.coin(); return; }

                const scale = 300 / (o.z + 200);
                if(scale > 0) {
                    const ox = cx + (o.l * w * 0.4 * scale);
                    const oy = horizon + (100 * scale); // Chão
                    const sz = w * 0.15 * scale;

                    // Desenha Obstáculo
                    if(o.type === 'box') {
                        // Caixa no chão (TEM QUE PULAR)
                        ctx.fillStyle = '#ff3300';
                        ctx.fillRect(ox - sz/2, oy - sz, sz, sz);
                        ctx.strokeStyle = '#fff'; ctx.strokeRect(ox - sz/2, oy - sz, sz, sz);
                        // Texto visual
                        if(scale > 0.5) { ctx.fillStyle='#fff'; ctx.font=`${10*scale}px Arial`; ctx.fillText("PULE", ox-sz/4, oy-sz/2); }
                    } else {
                        // Viga no alto (TEM QUE AGACHAR)
                        const beamY = oy - (sz * 2.5);
                        ctx.fillStyle = '#ffcc00';
                        ctx.fillRect(ox - sz, beamY, sz*2, sz*0.5);
                        ctx.strokeStyle = '#fff'; ctx.strokeRect(ox - sz, beamY, sz*2, sz*0.5);
                         // Texto visual
                        if(scale > 0.5) { ctx.fillStyle='#000'; ctx.font=`${10*scale}px Arial`; ctx.fillText("AGACHE", ox-sz/4, beamY+sz*0.3); }
                    }

                    // COLISÃO
                    if(o.z < 50 && o.z > -50 && o.l === this.lane) {
                        let hit = false;
                        if(o.type === 'box' && this.action !== 'jump') hit = true;
                        if(o.type === 'beam' && this.action !== 'crouch') hit = true;

                        if(hit) {
                            window.Gfx.shake(15);
                            window.System.gameOver(this.sc);
                        }
                    }
                }
            });

            // 5. PERSONAGEM HUMANOIDE (Canvas Drawing)
            // Posição base
            let charX = cx + (this.lane * w * 0.25);
            // Suaviza movimento lateral
            this.playerY = this.playerY * 0.9 + (this.action === 'jump' ? -120 : 0) * 0.1;
            
            let charY = h * 0.8 + this.playerY; // Y Base (Pés)
            if(this.action === 'crouch') charY += 40; // Mais baixo visualmente

            const s = w * 0.005; // Escala do boneco

            ctx.save();
            ctx.translate(charX, charY);
            ctx.scale(s, s);

            // Cor do Stickman
            ctx.strokeStyle = '#00ffcc';
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Animação Cíclica
            const cycle = Math.sin(this.f * 0.5);

            // --- DESENHO DO STICKMAN ---
            
            // 1. Pernas
            ctx.beginPath();
            if(this.action === 'jump') {
                // Pernas encolhidas no ar
                ctx.moveTo(0, -30); ctx.lineTo(-10, -10); ctx.lineTo(-20, 10);
                ctx.moveTo(0, -30); ctx.lineTo(10, -20); ctx.lineTo(20, 0);
            } else if (this.action === 'crouch') {
                // Pernas dobradas (agachado)
                ctx.moveTo(0, -20); ctx.lineTo(-15, 10); ctx.lineTo(-25, 30);
                ctx.moveTo(0, -20); ctx.lineTo(15, 10); ctx.lineTo(25, 30);
            } else {
                // Correndo
                ctx.moveTo(0, -30); ctx.lineTo(-10 + (cycle*15), 0); ctx.lineTo(-15 + (cycle*20), 30);
                ctx.moveTo(0, -30); ctx.lineTo(10 - (cycle*15), 0); ctx.lineTo(15 - (cycle*20), 30);
            }
            ctx.stroke();

            // 2. Tronco
            ctx.beginPath();
            ctx.moveTo(0, -30); 
            ctx.lineTo(0, (this.action === 'crouch' ? -60 : -90)); 
            ctx.stroke();

            // 3. Braços
            const shoulderY = (this.action === 'crouch' ? -60 : -90);
            ctx.beginPath();
            if(this.action === 'crouch') {
                // Braços protegendo cabeça
                ctx.moveTo(0, shoulderY); ctx.lineTo(-15, shoulderY-10); ctx.lineTo(0, shoulderY-30);
                ctx.moveTo(0, shoulderY); ctx.lineTo(15, shoulderY-10); ctx.lineTo(0, shoulderY-30);
            } else {
                // Braços balançando
                ctx.moveTo(0, shoulderY); ctx.lineTo(-20, shoulderY+20 + (cycle*20));
                ctx.moveTo(0, shoulderY); ctx.lineTo(20, shoulderY+20 - (cycle*20));
            }
            ctx.stroke();

            // 4. Cabeça
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(0, shoulderY - 15, 12, 0, Math.PI*2);
            ctx.fill();

            ctx.restore();

            // HUD DE AÇÃO
            ctx.fillStyle = 'yellow'; ctx.font = "bold 20px Arial"; ctx.textAlign = "center";
            if(this.action === 'jump') ctx.fillText("PULO!", charX, charY - 150);
            if(this.action === 'crouch') ctx.fillText("AGACHADO!", charX, charY - 100);

            return this.sc;
        }
    };

    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('run', 'Otto Runner', '🏃', Logic, {camOpacity: 0.3, showWheel: false});
            clearInterval(regLoop);
        }
    }, 100);
})();