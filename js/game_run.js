// LÓGICA DO JOGO: OTTO OLYMPICS (ATLETISMO)
(function() {
    const Logic = {
        lane: 0, 
        action: 'run', // run, jump, crouch
        sc: 0, 
        f: 0, 
        obs: [], 
        
        // Calibração Inteligente
        baseNoseY: 0,
        calibSamples: [],
        state: 'calibrate', // calibrate, play, game_over

        init: function(){ 
            this.sc=0; this.obs=[]; this.f=0; 
            this.state = 'calibrate';
            this.calibSamples = [];
            this.baseNoseY = 0;
            window.System.msg("FIQUE PARADO..."); 
        },

        update: function(ctx, w, h, pose){
            const cx = w / 2; 
            this.f++;

            // =================================================================
            // 1. INPUT E DETECÇÃO (CALIBRAÇÃO AUTOMÁTICA)
            // =================================================================
            
            if(pose){
                const n = pose.keypoints.find(k=>k.name==='nose');
                
                if(n && n.score > 0.4) {
                    // MUDANÇA DE FAIXA (Esquerda/Direita)
                    if(n.x < 210) this.lane = 1;      // Espelhado
                    else if(n.x > 430) this.lane = -1; 
                    else this.lane = 0;

                    // LÓGICA DE ESTADOS
                    if(this.state === 'calibrate') {
                        // Coleta altura do nariz por 60 frames (aprox 1.5 seg)
                        this.calibSamples.push(n.y);
                        
                        // Barra de progresso visual
                        ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(0,0,w,h);
                        ctx.fillStyle = "#fff"; ctx.font = "bold 30px Arial"; ctx.textAlign = "center";
                        ctx.fillText("CALIBRANDO ALTURA...", cx, h/2 - 50);
                        
                        // Desenha barra
                        const pct = this.calibSamples.length / 60;
                        ctx.fillStyle = "#00ff00"; ctx.fillRect(cx - 100, h/2, 200 * pct, 20);
                        ctx.strokeStyle = "#fff"; ctx.strokeRect(cx - 100, h/2, 200, 20);

                        if(this.calibSamples.length > 60) {
                            // Calcula a média da altura "em pé"
                            const sum = this.calibSamples.reduce((a, b) => a + b, 0);
                            this.baseNoseY = sum / this.calibSamples.length;
                            this.state = 'play';
                            window.System.msg("LARGADA!");
                            window.Sfx.play(400, 'square', 0.5, 0.1); // Som de apito
                        }
                        return 0; // Não desenha o jogo ainda
                    }
                    else if(this.state === 'play') {
                        // DETECÇÃO RELATIVA (MUITO MAIS PRECISA)
                        // Se o nariz subir 40 pixels acima da base = PULO
                        // Se o nariz descer 40 pixels abaixo da base = AGACHAR
                        
                        const diff = n.y - this.baseNoseY;

                        if(diff < -50) { // Subiu (Y diminui)
                            this.action = 'jump';
                        } else if (diff > 50) { // Desceu (Y aumenta)
                            this.action = 'crouch';
                        } else {
                            this.action = 'run';
                        }
                    }
                }
            }

            // =================================================================
            // 2. VISUAL ESPORTIVO (ESTÁDIO)
            // =================================================================
            
            // Céu Azul
            const gradSky = ctx.createLinearGradient(0,0,0,h*0.5);
            gradSky.addColorStop(0, '#00bfff'); gradSky.addColorStop(1, '#87ceeb');
            ctx.fillStyle = gradSky; ctx.fillRect(0,0,w,h);

            // Arquibancada (Fundo)
            ctx.fillStyle = '#ddd'; ctx.fillRect(0, h*0.4, w, h*0.1);
            for(let i=0; i<w; i+=20) { // Torcida abstrata
                ctx.fillStyle = Math.random() < 0.5 ? '#ff0000' : '#0000ff';
                ctx.fillRect(i, h*0.42, 10, 10);
            }

            const horizon = h * 0.5;

            // Gramado
            ctx.fillStyle = '#2d8a2d'; ctx.fillRect(0, horizon, w, h);

            // Pista de Atletismo (Trapézio Vermelho/Terracota)
            ctx.save(); ctx.translate(cx, horizon);
            
            // Desenha a pista
            const trackW_Top = w * 0.1;
            const trackW_Bot = w * 1.5;
            
            ctx.beginPath();
            ctx.fillStyle = '#c0392b'; // Cor de Tartan (Pista Olímpica)
            ctx.moveTo(-trackW_Top, 0); ctx.lineTo(trackW_Top, 0);
            ctx.lineTo(trackW_Bot, h); ctx.lineTo(-trackW_Bot, h);
            ctx.fill();

            // Linhas das raias (Brancas)
            ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4;
            const lanes = [-1, -0.33, 0.33, 1]; // Posições das linhas
            lanes.forEach(l => {
                ctx.beginPath();
                ctx.moveTo(l * trackW_Top, 0);
                ctx.lineTo(l * trackW_Bot, h);
                ctx.stroke();
            });

            ctx.restore();

            // =================================================================
            // 3. OBSTÁCULOS (BARREIRAS REAIS)
            // =================================================================
            
            if(this.state === 'play' && this.f % 70 === 0) { // Spawn rate
                const type = Math.random() < 0.6 ? 'hurdle' : 'sign'; // Mais barreiras que placas
                const lane = Math.floor(Math.random()*3)-1;
                this.obs.push({l: lane, z: 1000, type: type});
            }

            this.obs.forEach((o, i) => {
                o.z -= 18;
                if(o.z < -100) { this.obs.splice(i,1); this.sc += 10; return; }

                const scale = 300 / (o.z + 200);
                if(scale > 0) {
                    const ox = cx + (o.l * w * 0.5 * scale); // Posição X ajustada para pista larga
                    const oy = horizon + (100 * scale); // Chão visual
                    const sz = w * 0.18 * scale; // Largura do obstáculo

                    // SOMBRA
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.beginPath(); ctx.ellipse(ox, oy, sz*0.6, sz*0.2, 0, 0, Math.PI*2); ctx.fill();

                    if(o.type === 'hurdle') {
                        // BARREIRA DE ATLETISMO (PULAR)
                        const hH = sz * 0.6; // Altura da barreira
                        ctx.lineWidth = 4 * scale;
                        
                        // Pés da barreira
                        ctx.strokeStyle = '#aaa'; 
                        ctx.beginPath(); 
                        ctx.moveTo(ox - sz/2, oy); ctx.lineTo(ox - sz/2, oy - hH); // Pé esq
                        ctx.moveTo(ox + sz/2, oy); ctx.lineTo(ox + sz/2, oy - hH); // Pé dir
                        ctx.stroke();

                        // Barra superior (Branca e Preta)
                        ctx.fillStyle = '#fff'; ctx.fillRect(ox - sz/2 - 5, oy - hH - 5, sz + 10, 15 * scale);
                        ctx.fillStyle = '#000'; 
                        ctx.fillRect(ox - sz/4, oy - hH - 5, sz/6, 15 * scale);
                        ctx.fillRect(ox + sz/4, oy - hH - 5, sz/6, 15 * scale);

                        // Aviso
                        if(scale > 0.5) { ctx.fillStyle='#ffff00'; ctx.font=`bold ${16*scale}px Arial`; ctx.textAlign='center'; ctx.fillText("PULE!", ox, oy - hH - 20); }
                    } 
                    else {
                        // PLACA ALTA (AGACHAR)
                        const signH = sz * 2.2;
                        
                        // Postes
                        ctx.fillStyle = '#444'; 
                        ctx.fillRect(ox - sz/2, oy - signH, 5*scale, signH);
                        ctx.fillRect(ox + sz/2, oy - signH, 5*scale, signH);

                        // Placa
                        ctx.fillStyle = '#003366';
                        ctx.fillRect(ox - sz/1.5, oy - signH, sz*1.33, sz*0.6);
                        ctx.strokeStyle = '#fff'; ctx.lineWidth=2;
                        ctx.strokeRect(ox - sz/1.5, oy - signH, sz*1.33, sz*0.6);

                        if(scale > 0.5) { ctx.fillStyle='#fff'; ctx.font=`bold ${14*scale}px Arial`; ctx.textAlign='center'; ctx.fillText("ABAIXE!", ox, oy - signH + sz*0.4); }
                    }

                    // COLISÃO
                    if(o.z < 50 && o.z > -50 && o.l === this.lane) {
                        let hit = false;
                        if(o.type === 'hurdle' && this.action !== 'jump') hit = true;
                        if(o.type === 'sign' && this.action !== 'crouch') hit = true;

                        if(hit) {
                            window.Gfx.shake(15);
                            window.System.gameOver(this.sc);
                        } else {
                            // Feedback visual de sucesso
                            if(!o.passed) { 
                                window.Sfx.play(600, 'sine', 0.1, 0.05);
                                o.passed = true;
                            }
                        }
                    }
                }
            });

            // =================================================================
            // 4. PERSONAGEM (ATLETA)
            // =================================================================
            
            let charX = cx + (this.lane * w * 0.35); // Mais espaçado
            let charY = h * 0.8;
            
            // Feedback visual da ação no personagem
            if(this.action === 'jump') charY -= 80; // Pula visualmente
            if(this.action === 'crouch') charY += 40; // Abaixa visualmente

            // Sombra do personagem
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.ellipse(charX, h*0.8 + 20, 40, 10, 0, 0, Math.PI*2); ctx.fill();

            const s = w * 0.006;
            ctx.save();
            ctx.translate(charX, charY);
            ctx.scale(s, s);

            // CORPO
            ctx.strokeStyle = '#222'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            
            const cycle = Math.sin(this.f * 0.4) * 20; // Animação corrida

            ctx.beginPath();
            
            if(this.action === 'jump') {
                // Pose de Salto (Pernas abertas estilo barreira)
                ctx.moveTo(0, -50); ctx.lineTo(-30, -20); // Perna Esq (frente)
                ctx.moveTo(0, -50); ctx.lineTo(30, -10); ctx.lineTo(50, 10); // Perna Dir (trás)
                // Braços
                ctx.moveTo(0, -90); ctx.lineTo(-30, -120);
                ctx.moveTo(0, -90); ctx.lineTo(30, -120);
            } 
            else if(this.action === 'crouch') {
                // Pose Agachado (Bolinhha)
                ctx.moveTo(0, -30); ctx.lineTo(-15, 10); ctx.lineTo(-25, 30);
                ctx.moveTo(0, -30); ctx.lineTo(15, 10); ctx.lineTo(25, 30);
                // Tronco baixo
                ctx.moveTo(0, -30); ctx.lineTo(0, -60);
                // Braços na cabeça
                ctx.moveTo(0, -60); ctx.lineTo(-20, -40);
                ctx.moveTo(0, -60); ctx.lineTo(20, -40);
            }
            else {
                // Correndo
                // Tronco
                ctx.moveTo(0, -50); ctx.lineTo(0, -100);
                // Pernas
                ctx.moveTo(0, -50); ctx.lineTo(-15 + cycle, 10); ctx.lineTo(-20 + cycle, 40);
                ctx.moveTo(0, -50); ctx.lineTo(15 - cycle, 10); ctx.lineTo(20 - cycle, 40);
                // Braços (Oposto das pernas)
                ctx.moveTo(0, -90); ctx.lineTo(-20 - cycle, -50);
                ctx.moveTo(0, -90); ctx.lineTo(20 + cycle, -50);
            }
            ctx.stroke();

            // CABEÇA
            const headY = (this.action === 'crouch') ? -75 : -115;
            ctx.fillStyle = '#ffccaa'; // Pele
            ctx.beginPath(); ctx.arc(0, headY, 15, 0, Math.PI*2); ctx.fill();
            // Faixa na cabeça
            ctx.strokeStyle = '#ff0000'; ctx.lineWidth=4; 
            ctx.beginPath(); ctx.moveTo(-14, headY-5); ctx.lineTo(14, headY-5); ctx.stroke();

            ctx.restore();
            
            // HUD AÇÃO
            if(this.state === 'play') {
                ctx.font = "bold 24px Arial"; ctx.textAlign = "center";
                if(this.action === 'jump') { ctx.fillStyle = "#00ff00"; ctx.fillText("PULO!", charX, charY - 100); }
                else if(this.action === 'crouch') { ctx.fillStyle = "#ffff00"; ctx.fillText("AGACHADO", charX, charY - 100); }
            }

            return this.sc;
        }
    };

    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('run', 'Otto Olympics', '🏃', Logic, {camOpacity: 0.3, showWheel: false});
            clearInterval(regLoop);
        }
    }, 100);
})();