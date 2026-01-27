(function() {
    const Logic = {
        sc: 0, tg: [], last: 0,
        init: function() { this.sc=0; this.tg=[]; window.System.msg("FIGHT!"); },
        update: function(ctx, w, h, pose) {
            const now = Date.now();
            ctx.fillStyle = '#050505'; ctx.fillRect(0,0,w,h);
            if(window.Gfx) window.Gfx.drawSkeleton(ctx, pose, w, h);

            if(now - this.last > 1000) {
                this.tg.push({x: Math.random()*w*0.6+w*0.2, y: Math.random()*h*0.5+h*0.2, r: 50, s: now});
                this.last = now;
            }

            let fists = [];
            if(pose) {
                const kp = pose.keypoints;
                const lw = kp.find(k=>k.name==='left_wrist'), rw = kp.find(k=>k.name==='right_wrist');
                if(lw && lw.score>0.4) fists.push(window.Gfx.map(lw,w,h));
                if(rw && rw.score>0.4) fists.push(window.Gfx.map(rw,w,h));
            }

            this.tg.forEach((t, i) => {
                ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 5;
                ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI*2); ctx.stroke();
                fists.forEach(f => {
                    if(Math.hypot(f.x-t.x, f.y-t.y) < t.r) {
                        this.tg.splice(i,1); this.sc += 100; window.Sfx.hit(); window.Gfx.shake(10);
                    }
                });
                if(now - t.s > 2000) this.tg.splice(i,1);
            });
            return this.sc;
        }
    };
    window.System.registerGame('box', 'Otto Boxing', '🥊', Logic, {camOpacity: 0.5});
})();