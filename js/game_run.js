/* =================================================================
   GAME: OTTO SUPER RUN (PERSPECTIVA 3D TRASEIRA)
   ================================================================= */

(function() {
    const Logic = {
        sc: 0, f: 0, lane: 0, obs: [], action: 'run',
        init: function() { this.sc=0; this.f=0; this.lane=0; this.obs=[]; this.action='run'; window.System.msg("CORRA!"); },
        update: function(ctx, w, h, pose) {
            this.f++; const cx = w/2, horizon = h*0.4;
            
            if(pose) {
                const n = pose.keypoints.find(k=>k.name==='nose');
                if(n && n.score > 0.4) {
                    const nx = n.x;
                    if(nx < 200) this.lane = 1; else if(nx > 440) this.lane = -1; else this.lane = 0;
                    const dy = n.y - h*0.4;
                    if(dy < -50) this.action = 'jump'; else if(dy > 50) this.action = 'crouch'; else this.action = 'run';
                }
            }

            // Cenário
            ctx.fillStyle = '#5c94fc'; ctx.fillRect(0,0,w,horizon);
            ctx.fillStyle = '#00cc00'; ctx.fillRect(0,horizon,w,h-horizon);
            
            // Pista Trapezoidal
            ctx.fillStyle = '#d65a4e';
            ctx.beginPath(); ctx.moveTo(cx-40, horizon); ctx.lineTo(cx+40, horizon); ctx.lineTo(cx+w*0.6, h); ctx.lineTo(cx-w*0.6, h); ctx.fill();

            // Obstáculos
            if(this.f % 60 === 0) this.obs.push({z: 1000, l: Math.floor(Math.random()*3)-1});
            this.obs.forEach((o, i) => {
                o.z -= 20;
                if(o.z < 0) { this.obs.splice(i,1); this.sc += 100; return; }
                const scale = 300/(o.z+300), ox = cx + (o.l * w * 0.4 * scale), oy = horizon + (h*0.6*scale), sz = 100*scale;
                ctx.fillStyle = '#ff0000'; ctx.fillRect(ox-sz/2, oy-sz, sz, sz);
                if(o.z < 50 && o.l === this.lane && this.action !== 'jump') window.System.gameOver(this.sc);
            });

            // Personagem (Costas)
            const px = cx + (this.lane * w * 0.25), py = h*0.8;
            ctx.fillStyle = '#ff0000'; ctx.beginPath(); ctx.arc(px, py + (this.action==='jump'?-80:0), 30, 0, Math.PI*2); ctx.fill();
            
            return this.sc;
        }
    };
    window.System.registerGame('run', 'Otto Super Run', '🏃', Logic, {camOpacity: 0.2});
})();