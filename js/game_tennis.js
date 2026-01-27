(function() {
    const Logic = {
        sc: 0, ball: {x:0, y:0, z:1200, vx:0, vy:0, vz:0}, hand: {x:0, y:0},
        init: function() { this.sc=0; this.resetBall(); window.System.msg("PLAY!"); },
        resetBall: function() { this.ball = {x:0, y:-100, z:1200, vx:(Math.random()-0.5)*10, vy:5, vz:-25}; },
        update: function(ctx, w, h, pose) {
            const cx = w/2, cy = h/2;
            ctx.fillStyle = '#2ecc71'; ctx.fillRect(0,cy,w,cy); // Chão
            ctx.fillStyle = '#87ceeb'; ctx.fillRect(0,0,w,cy);  // Céu

            if(pose) {
                const rw = pose.keypoints.find(k=>k.name==='right_wrist');
                if(rw && rw.score > 0.4) {
                    const m = window.Gfx.map(rw, w, h);
                    this.hand.x = m.x - cx; this.hand.y = m.y - cy;
                }
            }

            this.ball.x += this.ball.vx; this.ball.y += this.ball.vy; this.ball.z += this.ball.vz;
            this.ball.vy += 0.5; // Gravidade
            if(this.ball.y > 200) { this.ball.y = 200; this.ball.vy *= -0.8; }

            const scale = 500/(this.ball.z+500);
            const bx = cx + this.ball.x*scale, by = cy + this.ball.y*scale;
            ctx.fillStyle = '#ccff00'; ctx.beginPath(); ctx.arc(bx, by, 20*scale, 0, Math.PI*2); ctx.fill();

            if(this.ball.z < 100 && Math.hypot(bx-(cx+this.hand.x), by-(cy+this.hand.y)) < 80) {
                this.ball.vz *= -1.1; this.ball.vy = -15; this.sc++; window.Sfx.hit();
            }
            if(this.ball.z > 1500) this.ball.vz *= -1;
            if(this.ball.z < -200) { window.System.gameOver(this.sc); }

            ctx.fillStyle = '#aa0000'; ctx.fillRect(cx+this.hand.x-30, cy+this.hand.y-40, 60, 80); // Raquete
            return this.sc;
        }
    };
    window.System.registerGame('tennis', 'Otto Tennis', '🎾', Logic, {camOpacity: 0.5});
})();