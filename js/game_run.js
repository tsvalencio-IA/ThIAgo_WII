// LÓGICA DO JOGO: OTTO RUNNER (REMASTERED - CYBER GRID)
(function() {
    const Logic = {
        lane:0, sc:0, f:0, obs:[], camTilt: 0,
        
        init: function(){ 
            this.sc=0; this.obs=[]; this.f=0; this.camTilt=0; 
            window.System.msg("CORRA!"); 
        },

        update: function(ctx, w, h, pose){
            const cx=w/2; this.f++;
            
            // 1. DETECÇÃO (Nose-based)
            if(pose){
                const n=pose.keypoints.find(k=>k.name==='nose');
                if(n&&n.score>0.4){ 
                    if(n.x<210) this.lane=1; 
                    else if(n.x>430) this.lane=-1; 
                    else this.lane=0; 
                }
            }
            
            // Suavização do tilt da câmera para sensação de movimento lateral
            const targetTilt = this.lane * 15; // Graus
            this.camTilt += (targetTilt - this.camTilt) * 0.1;

            // 2. GERA OBSTÁCULOS
            if(this.f%50===0) this.obs.push({l:Math.floor(Math.random()*3)-1, z:1000});

            // 3. RENDERIZAÇÃO CYBER
            ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h);
            
            // Efeito Horizon Glow
            const gradSky = ctx.createLinearGradient(0, 0, 0, h/2);
            gradSky.addColorStop(0, '#000'); gradSky.addColorStop(1, '#001a33');
            ctx.fillStyle = gradSky; ctx.fillRect(0,0,w,h/2);

            // GRID DE CHÃO (Moving)
            ctx.save();
            ctx.translate(cx, h/2);
            // ctx.rotate(this.camTilt * Math.PI / 180 * 0.2); // Leve rotação de câmera
            
            // Linhas verticais (Perspectiva)
            ctx.strokeStyle='rgba(0, 255, 204, 0.3)'; ctx.lineWidth=2;
            const laneW = w * 0.6; // Largura total da pista no fundo
            
            ctx.beginPath();
            // Pista central
            ctx.moveTo(-w*0.3, 0); ctx.lineTo(-w, h/2);
            ctx.moveTo(w*0.3, 0); ctx.lineTo(w, h/2);
            // Divisórias de lane
            ctx.strokeStyle='rgba(0, 255, 204, 0.1)';
            ctx.moveTo(-w*0.1, 0); ctx.lineTo(-w*0.33, h/2);
            ctx.moveTo(w*0.1, 0); ctx.lineTo(w*0.33, h/2);
            ctx.stroke();

            // Linhas horizontais (Velocidade)
            const speedOffset = (this.f * 10) % 100;
            ctx.strokeStyle='rgba(255, 0, 255, 0.2)'; // Grid Magenta
            for(let i=0; i<10; i++) {
                const z = 100 + (i * 100) - speedOffset;
                const y = (z / 1000) * (h/2);
                // Quanto mais perto, mais largo
                ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(w, y); ctx.stroke();
            }
            ctx.restore();

            // 4. OBSTÁCULOS (Cubos 3D Neon)
            this.obs.forEach((o,i)=>{
                o.z-=20; 
                if(o.z<-100){this.obs.splice(i,1); this.sc+=10; window.Sfx.coin(); return;}
                
                const sc=500/(o.z+100);
                if(sc>0){
                    const ox=cx+(o.l*w*0.3*sc);
                    const oy=h/2+(50*sc);
                    const sz=w*0.15*sc;

                    // Desenha CUBO (Face frente)
                    ctx.fillStyle='rgba(255, 0, 50, 0.8)'; // Vermelho Neon
                    ctx.strokeStyle='#fff'; ctx.lineWidth=2;
                    ctx.fillRect(ox-sz/2, oy-sz, sz, sz);
                    ctx.strokeRect(ox-sz/2, oy-sz, sz, sz);
                    
                    // Topo do cubo (3D fake)
                    ctx.beginPath();
                    ctx.fillStyle='rgba(150, 0, 30, 0.8)';
                    ctx.moveTo(ox-sz/2, oy-sz); ctx.lineTo(ox-sz/2 + sz*0.2, oy-sz - sz*0.2);
                    ctx.lineTo(ox+sz/2 + sz*0.2, oy-sz - sz*0.2); ctx.lineTo(ox+sz/2, oy-sz);
                    ctx.fill(); ctx.stroke();

                    // Colisão
                    if(o.z<50 && o.z>-50 && o.l===this.lane) {
                         window.Gfx.shake(20);
                         window.System.gameOver(this.sc);
                    }
                }
            });
            
            // 5. JOGADOR (Avatar Futurista)
            ctx.save(); 
            // Posiciona baseado na lane mas com interpolação suave visual já calculada
            // Mas para manter simples e responsivo, usamos a lane direta com lerp de posição X
            const targetX = cx+(this.lane*w*0.25);
            // ctx.translate(targetX, h*0.85); 
            
            // Desenha a nave/player
            const pSize = w*0.06;
            ctx.translate(targetX, h*0.82);
            
            // Inclinação visual ao mudar de lane
            ctx.rotate(this.lane * 0.2);

            // Corpo da Nave/Hoverboard
            ctx.fillStyle = '#00ffcc';
            ctx.shadowBlur = 20; ctx.shadowColor = '#00ffcc';
            ctx.beginPath();
            ctx.moveTo(0, -pSize); // Ponta
            ctx.lineTo(-pSize/2, pSize);
            ctx.lineTo(0, pSize*0.8); // Recorte traseiro
            ctx.lineTo(pSize/2, pSize);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Engine glow
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, pSize*0.5, pSize*0.2, 0, Math.PI*2); ctx.fill();

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
