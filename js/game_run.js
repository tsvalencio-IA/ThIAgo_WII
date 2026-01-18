// LÓGICA DO JOGO: OTTO OLYMPICS (LAYOUT CORRIGIDO & WIDE VIEW)
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
        state: 'calibrate', 

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
            // 1. INPUT E DETECÇÃO
            // =================================================================
            
            if(pose){
                const n = pose.keypoints.find(k=>k.name==='nose');
                
                if(n && n.score > 0.4) {
                    if(n.x < 210) this.lane = 1;      
                    else if(n.x > 430) this.lane = -1; 
                    else this.lane = 0;

                    if(this.state === 'calibrate') {
                        this.calibSamples.push(n.y);
                        
                        // Fundo de calibração semi-transparente
                        ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,w,h);
                        ctx.fillStyle = "#fff"; ctx.font = "bold 24px Arial"; ctx.textAlign = "center";
                        ctx.fillText("CALIBRANDO...", cx, h*0.4);
                        ctx.font = "16px Arial"; 
                        ctx.fillText("Fique em posição natural", cx, h*0.45);
                        
                        const pct = this.calibSamples.length / 60;
                        ctx.fillStyle = "#00ff00"; ctx.fillRect(cx - 80, h*0.5, 160 * pct, 10);
                        ctx.strokeStyle = "#fff"; ctx.strokeRect(cx - 80, h*0.5, 160, 10);

                        if(this.calibSamples.length > 60) {
                            const sum = this.calibSamples.reduce((a, b) => a + b, 0);
                            this.baseNoseY = sum / this.calibSamples.length;
                            this.state = 'play';
                            window.System.msg("LARGADA!"); 
                            window.Sfx.play(400, 'square', 0.5, 0.1); 
                        }
                        return 0; 
                    }
                    else if(this.state === 'play') {
                        const diff = n.y - this.baseNoseY;
                        if(diff < -50) this.action = 'jump';
                        else if (diff > 50) this.action = 'crouch';
                        else this.action = 'run';
                    }
                }
            }

            // =================================================================
            // 2. VISUAL ESPORTIVO (LAYOUT MELHORADO)
            // =================================================================
            
            // Horizonte mais alto (h*0.4) para dar mais profundidade à pista
            const horizon = h * 0.4;

            // Céu
            const gradSky = ctx.createLinearGradient(0,0,0,horizon);
            gradSky.addColorStop(0, '#00bfff'); gradSky.addColorStop(1, '#cceeff');
            ctx.fillStyle = gradSky; ctx.fillRect(0,0,w,h);

            // Arquibancada
            ctx.fillStyle = '#bbb'; ctx.fillRect(0, horizon - h*0.08, w, h*0.08);
            // Torcida (Pixels)
            for(let i=0; i<w; i+=15) { 
                ctx.fillStyle = Math.random() < 0.5 ? '#ff3333' : '#3333ff';
                if(Math.random()>0.3) ctx.fillRect(i, horizon - h*0.06, 8, 8);
                if(Math.random()>0.3) ctx.fillRect(i, horizon - h*0.04, 8, 8);
            }

            // Gramado
            ctx.fillStyle = '#339933'; ctx.fillRect(0, horizon, w, h);

            // Pista de Atletismo (PERSPECTIVA AJUSTADA)
            ctx.save(); ctx.translate(cx, horizon);
            
            // Larguras ajustadas para não parecer um triângulo tão agudo
            const trackW_Top = w * 0.15; // Mais largo no topo
            const trackW_Bot = w * 1.2;  // Base
            const trackHeight = h - horizon;

            ctx.beginPath();
            ctx.fillStyle = '#d64541'; // Terracota mais suave
            ctx.moveTo(-trackW_Top, 0); ctx.lineTo(trackW_Top, 0);
            ctx.lineTo(trackW_Bot, trackHeight); ctx.lineTo(-trackW_Bot, trackHeight);
            ctx.fill();

            // Linhas das raias
            ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
            [-1, -0.33, 0.33, 1].forEach(l => {
                ctx.beginPath();
                ctx.moveTo(l * trackW_Top, 0);
                ctx.lineTo(l * trackW_Bot, trackHeight);
                ctx.stroke();
            });
            ctx.restore();

            // =================================================================
            // 3. OBSTÁCULOS
            // =================================================================
            
            if(this.state === 'play' && this.f % 70 === 0) { 
                const type = Math.random() < 0.6 ? 'hurdle' : 'sign'; 
                const lane = Math.floor(Math.random()*3)-1;
                this.obs.push({l: lane, z: 1200, type: type}); // Nascem mais longe (Z=1200)
            }

            this.obs.forEach((o, i) => {
                o.z -= 18;
                if(o.z < -100) { this.obs.splice(i,1); this.sc += 10; return; }

                // Escala ajustada para a nova perspectiva
                const scale = 300 / (o.z + 300); // Suaviza o crescimento
                
                if(scale > 0) {
                    // Cálculo de posição X interpolando topo e base da pista
                    const progress = 1 - (o.z / 1200); // 0 (fundo) a 1 (tela)
                    const currentW = trackW_Top + (trackW_Bot - trackW_Top) * scale; // Aproximação visual
                    
                    // Fator de espalhamento das lanes baseado na profundidade
                    const spread = (w * 0.6) * scale; 

                    const ox = cx + (o.l * spread);
                    const oy = horizon + (scale * (h - horizon)); // Cola no chão corretamente
                    const sz = w * 0.16 * scale; 

                    // Sombra
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.beginPath(); ctx.ellipse(ox, oy, sz*0.7, sz*0.2, 0, 0, Math.PI*2); ctx.fill();

                    if(o.type === 'hurdle') {
                        // Barreira
                        const hH = sz * 0.7; 
                        ctx.lineWidth = 4 * scale;
                        ctx.strokeStyle = '#ddd'; 
                        ctx.beginPath(); 
                        ctx.moveTo(ox - sz/2, oy); ctx.lineTo(ox - sz/2, oy - hH); 
                        ctx.moveTo(ox + sz/2, oy); ctx.lineTo(ox + sz/2, oy - hH); 
                        ctx.stroke();

                        ctx.fillStyle = '#fff'; ctx.fillRect(ox - sz/2 - 2, oy - hH - 2, sz + 4, 18 * scale);
                        ctx.fillStyle = '#111'; 
                        ctx.fillRect(ox - sz/4, oy - hH - 2, sz/6, 18 * scale);
                        ctx.fillRect(ox + sz/4, oy - hH - 2, sz/6, 18 * scale);

                        if(scale > 0.4) { ctx.fillStyle='#ffff00'; ctx.font=`bold ${14*scale}px Arial`; ctx.textAlign='center'; ctx.fillText("PULE!", ox, oy - hH - 10); }
                    } 
                    else {
                        // Placa Alta
                        const signH = sz * 2.5;
                        ctx.fillStyle = '#333'; 
                        ctx.fillRect(ox - sz/2, oy - signH, 6*scale, signH);
                        ctx.fillRect(ox + sz/2, oy - signH, 6*scale, signH);

                        ctx.fillStyle = '#004488';
                        ctx.fillRect(ox - sz/1.4, oy - signH, sz*1.4, sz*0.7);
                        ctx.strokeStyle = '#fff'; ctx.lineWidth=2*scale;
                        ctx.strokeRect(ox - sz/1.4, oy - signH, sz*1.4, sz*0.7);

                        if(scale > 0.4) { ctx.fillStyle='#fff'; ctx.font=`bold ${12*scale}px Arial`; ctx.textAlign='center'; ctx.fillText("ABAIXE", ox, oy - signH + sz*0.4); }
                    }

                    // Colisão
                    if(o.z < 60 && o.z > -50 && o.l === this.lane) {
                        let hit = false;
                        if(o.type === 'hurdle' && this.action !== 'jump') hit = true;
                        if(o.type === 'sign' && this.action !== 'crouch') hit = true;
                        if(hit) { window.Gfx.shake(15); window.System.gameOver(this.sc); }
                        else if(!o.passed) { window.Sfx.play(600, 'sine', 0.1, 0.05); o.passed = true; }
                    }
                }
            });

            // =================================================================
            // 4. PERSONAGEM (ESCALA CORRIGIDA)
            // =================================================================
            
            // Posição ajustada: Mais longe da câmera (mais alto na tela) para não bater na UI
            // Lane spread visual reduzido para ele não sair da pista
            let charX = cx + (this.lane * w * 0.25); 
            
            // Y Base: 75% da altura da tela (antes era 80-85%)
            // Isso tira os pés da frente do slider de sensibilidade
            let charY = h * 0.75; 
            
            if(this.action === 'jump') charY -= h * 0.12; 
            if(this.action === 'crouch') charY += h * 0.05; 

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.ellipse(charX, h*0.75 + (h*0.03), w*0.08, w*0.02, 0, 0, Math.PI*2); ctx.fill();

            // ESCALA REDUZIDA: w * 0.0045 (era 0.006)
            // Isso resolve o problema da cabeça bater no texto "LARGADA"
            const s = w * 0.0045;
            
            ctx.save();
            ctx.translate(charX, charY);
            ctx.scale(s, s);

            ctx.strokeStyle = '#222'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            const cycle = Math.sin(this.f * 0.4) * 20;

            ctx.beginPath();
            
            if(this.action === 'jump') {
                // Salto (Perna estilo barreira)
                ctx.moveTo(0, -50); ctx.lineTo(-40, -30); 
                ctx.moveTo(0, -50); ctx.lineTo(40, -10); ctx.lineTo(60, 20); 
                // Braços
                ctx.moveTo(0, -90); ctx.lineTo(-30, -130);
                ctx.moveTo(0, -90); ctx.lineTo(30, -130);
            } 
            else if(this.action === 'crouch') {
                // Agachado compacto
                ctx.moveTo(0, -20); ctx.lineTo(-20, 20); ctx.lineTo(-30, 40);
                ctx.moveTo(0, -20); ctx.lineTo(20, 20); ctx.lineTo(30, 40);
                ctx.moveTo(0, -20); ctx.lineTo(0, -60); // Tronco curto
                ctx.moveTo(0, -60); ctx.lineTo(-25, -30); // Braços
                ctx.moveTo(0, -60); ctx.lineTo(25, -30);
            }
            else {
                // Corrida (Tronco inclinado pra frente para dar velocidade)
                ctx.moveTo(0, -40); ctx.lineTo(10, -100); // Tronco inclinado
                
                // Pernas
                ctx.moveTo(0, -40); ctx.lineTo(-20 + cycle, 20); ctx.lineTo(-30 + cycle, 60);
                ctx.moveTo(0, -40); ctx.lineTo(20 - cycle, 20); ctx.lineTo(30 - cycle, 60);
                
                // Braços
                const shoulderX = 10; // Ombros alinhados com tronco inclinado
                const shoulderY = -90;
                ctx.moveTo(shoulderX, shoulderY); ctx.lineTo(shoulderX - 30 - cycle, shoulderY + 40);
                ctx.moveTo(shoulderX, shoulderY); ctx.lineTo(shoulderX + 30 + cycle, shoulderY + 40);
                
                // Cabeça (Acompanha inclinação)
                ctx.translate(15, -5); 
            }
            ctx.stroke();

            // Cabeça
            const headY = (this.action === 'crouch') ? -80 : -120;
            ctx.fillStyle = '#ffccaa'; 
            ctx.beginPath(); ctx.arc(0, headY, 18, 0, Math.PI*2); ctx.fill();
            // Bandana
            ctx.strokeStyle = '#ff0000'; ctx.lineWidth=5; 
            ctx.beginPath(); ctx.moveTo(-16, headY-5); ctx.lineTo(16, headY-5); ctx.stroke();
            // Faixa solta da bandana (animada)
            ctx.strokeStyle = '#ff0000'; ctx.lineWidth=3;
            ctx.beginPath(); ctx.moveTo(-16, headY-5); 
            ctx.quadraticCurveTo(-30 - Math.abs(cycle), headY, -40 - Math.abs(cycle), headY + 10);
            ctx.stroke();

            ctx.restore();
            
            // HUD AÇÃO (Ajustado para não cobrir o boneco)
            if(this.state === 'play') {
                ctx.font = "bold 20px Arial"; ctx.textAlign = "center";
                // Texto um pouco mais alto
                if(this.action === 'jump') { ctx.fillStyle = "#00aa00"; ctx.fillText("PULO!", charX, charY - (h*0.15)); }
                else if(this.action === 'crouch') { ctx.fillStyle = "#ddaa00"; ctx.fillText("AGACHADO", charX, charY - (h*0.12)); }
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