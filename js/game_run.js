// LÓGICA DO JOGO: OTTO RUNNER (REMASTERED - FIXED PLAYER)
(function() {
    const Logic = {
        lane:0, sc:0, f:0, obs:[], 
        
        init: function(){ 
            this.sc=0; this.obs=[]; this.f=0; 
            window.System.msg("CORRA!"); 
        },

        update: function(ctx, w, h, pose){
            const cx=w/2; this.f++;
            
            // 1. DETECÇÃO
            if(pose){
                const n=pose.keypoints.find(k=>k.name==='nose');
                if(n&&n.score>0.4){ 
                    if(n.x<210) this.lane=1; 
                    else if(n.x>430) this.lane=-1; 
                    else this.lane=0; 
                }
            }

            // 2. GERA OBSTÁCULOS
            if(this.f%50===0) this.obs.push({l:Math.floor(Math.random()*3)-1, z:1000});

            // 3. CENÁRIO CYBER
            ctx.fillStyle='#111'; ctx.fillRect(0,0,w,h);
            
            // Céu
            const gradSky = ctx.createLinearGradient(0, 0, 0, h/2);
            gradSky.addColorStop(0, '#000'); gradSky.addColorStop(1, '#002244');
            ctx.fillStyle = gradSky; ctx.fillRect(0,0,w,h/2);

            // Grid de Chão (Perspectiva Fixa para estabilidade)
            ctx.save();
            ctx.translate(cx, h/2);
            
            // Linhas Pista
            ctx.strokeStyle='rgba(0, 255, 200, 0.5)'; ctx.lineWidth=3;
            ctx.beginPath();
            ctx.moveTo(-w*0.4, 0); ctx.lineTo(-w*1.2, h/2); // Esq Ext
            ctx.moveTo(w*0.4, 0); ctx.lineTo(w*1.2, h/2);   // Dir Ext
            ctx.moveTo(-w*0.13, 0); ctx.lineTo(-w*0.4, h/2); // Esq Int
            ctx.moveTo(w*0.13, 0); ctx.lineTo(w*0.4, h/2);   // Dir Int
            ctx.stroke();

            // Linhas Horizontais (Movimento)
            const speedOffset = (this.f * 15) % 100;
            ctx.strokeStyle='rgba(200, 0, 255, 0.3)';
            for(let i=0; i<8; i++) {
                const z = 100 + (i * 120) - speedOffset;
                if(z > 0) {
                    const y = (z / 1000) * (h/2);
                    ctx.beginPath(); ctx.moveTo(-w*2, y); ctx.lineTo(w*2, y); ctx.stroke();
                }
            }
            ctx.restore();

            // 4. OBSTÁCULOS
            this.obs.forEach((o,i)=>{
                o.z-=20; 
                if(o.z<-100){this.obs.splice(i,1); this.sc+=10; window.Sfx.coin(); return;}
                
                const sc=500/(o.z+100);
                if(sc>0){
                    const ox=cx+(o.l*w*0.4*sc); // Ajustado para alinhar com as linhas
                    const oy=h/2+(50*sc);
                    const sz=w*0.15*sc;

                    // Cubo Neon
                    ctx.fillStyle='rgba(255, 0, 60, 0.8)';
                    ctx.strokeStyle='#fff'; ctx.lineWidth=2;
                    ctx.fillRect(ox-sz/2, oy-sz, sz, sz);
                    ctx.strokeRect(ox-sz/2, oy-sz, sz, sz);
                    
                    // Colisão
                    if(o.z<50 && o.z>-50 && o.l===this.lane) {
                         window.Gfx.shake(20);
                         window.System.gameOver(this.sc);
                    }
                }
            });
            
            // 5. JOGADOR (Correção de Visibilidade)
            // Desenhamos por último para garantir que fique por cima
            ctx.save(); 
            
            // Posição X baseada na lane (-1, 0, 1)
            // w*0.3 define o quão longe ele vai para os lados
            const playerX = cx + (this.lane * w * 0.3);
            const playerY = h * 0.85;
            const pSize = w * 0.08;

            ctx.translate(playerX, playerY);
            
            // Inclinação visual ao mudar de pista
            ctx.rotate(this.lane * 0.15);

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.ellipse(0, pSize, pSize*0.8, pSize*0.3, 0, 0, Math.PI*2); ctx.fill();

            // Nave / Personagem (Triângulo Futurista)
            ctx.fillStyle = '#00ffaa'; // Verde Neon Forte
            ctx.shadowBlur = 15; ctx.shadowColor = '#00ffaa'; // Glow
            
            ctx.beginPath();
            ctx.moveTo(0, -pSize);         // Bico
            ctx.lineTo(-pSize*0.6, pSize); // Base Esq
            ctx.lineTo(0, pSize*0.7);      // Centro Base (recorte)
            ctx.lineTo(pSize*0.6, pSize);  // Base Dir
            ctx.closePath();
            ctx.fill();
            
            // Detalhe Cockpit
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, 0, pSize*0.2, 0, Math.PI*2); ctx.fill();

            // Turbinas
            if(this.f % 4 < 2) { // Efeito piscante do motor
                ctx.fillStyle = '#ffff00';
                ctx.beginPath(); ctx.arc(-pSize*0.3, pSize, pSize*0.15, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(pSize*0.3, pSize, pSize*0.15, 0, Math.PI*2); ctx.fill();
            }

            ctx.restore();
            
            return this.sc;
        }
    };

    // REGISTRO
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('run', 'Otto Runner', '🏃', Logic, {camOpacity: 0.3, showWheel: false});
            clearInterval(regLoop);
        }
    }, 100);
})();
