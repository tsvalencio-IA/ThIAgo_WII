// LÓGICA DO JOGO: KART DO OTTO (ULTIMATE VISUAL EDITION)
(function() {
    const Logic = {
        speed: 0, pos: 0, x: 0, steer: 0, rawSteer: 0, curve: 0,
        health: 100, score: 0, obs: [], enemies: [],
        
        init: function() { 
            this.speed = 0; this.pos = 0; this.x = 0; this.health = 100; this.score = 0;
            this.obs = []; this.enemies = [];
            window.System.msg("START ENGINES"); 
        },
        
        update: function(ctx, w, h, pose) {
            const d = Logic; 
            const cx = w / 2;

            // --- 1. INPUT ---
            let targetAngle = 0;
            if(pose) {
                const kp = pose.keypoints;
                const lw = kp.find(k=>k.name==='left_wrist');
                const rw = kp.find(k=>k.name==='right_wrist');
                
                if(lw && rw && lw.score > 0.4 && rw.score > 0.4) {
                    const dy = rw.y - lw.y; 
                    const dx = rw.x - lw.x;
                    let rawAngle = Math.atan2(dy, dx);
                    if(Math.abs(rawAngle) < 0.05) rawAngle = 0;
                    targetAngle = Math.sign(rawAngle) * Math.pow(Math.abs(rawAngle), 1.4) * 1.8 * window.System.sens;
                    if(d.speed < h * 0.065) d.speed += h * 0.0008; 
                } else { 
                    d.speed *= 0.95; 
                }
            }
            
            const reactionSpeed = (Math.abs(targetAngle) < Math.abs(d.steer)) ? 0.4 : 0.25;
            d.steer += (targetAngle - d.steer) * reactionSpeed;
            d.steer = Math.max(-1.5, Math.min(1.5, d.steer));

            const wheel = document.getElementById('visual-wheel');
            if(wheel) wheel.style.transform = `rotate(${d.steer * 80}deg)`;

            // --- 2. FÍSICA ---
            d.pos += d.speed;
            d.score += Math.floor(d.speed * 0.1);
            d.curve = Math.sin(d.pos * 0.003) * 1.5;
            const handling = (d.speed / (h * 0.06)) * 1.2; 
            d.x += d.steer * (d.speed / (h * 0.55)) * handling;
            d.x -= d.curve * (d.speed / h);
            
            if(Math.abs(d.x) > 1.35) { 
                d.speed *= 0.92; d.x = d.x > 0 ? 1.35 : -1.35;
                if(d.speed > 5) {
                    d.health -= 0.2; 
                    window.Gfx.shake(3); // Shake via Core
                }
            }

            // GERAÇÃO
            if(Math.random() < 0.02 && d.speed > 5) {
                const type = Math.random() < 0.35 ? 'sign' : 'cone';
                let posX = (Math.random() * 2.2) - 1.1;
                if(type === 'sign') posX = (Math.random() < 0.5 ? -1.6 : 1.6);
                d.obs.push({ x: posX, z: 1000, type: type });
            }
            if(Math.random() < 0.008 && d.speed > 8) {
                d.enemies.push({
                    x: (Math.random() * 1.6) - 0.8, z: 1000, 
                    speed: d.speed * (0.6 + Math.random()*0.3),
                    color: Math.random() < 0.5 ? '#0033cc' : '#008800',
                    laneChange: (Math.random() - 0.5) * 0.01
                });
            }

            // --- 3. RENDERIZAÇÃO AMBIENTE (Outrun Style) ---
            const horizon = h * 0.4;
            
            // Céu Sunset
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, "#0b1026"); 
            gradSky.addColorStop(0.5, "#2b32b2"); 
            gradSky.addColorStop(1, "#ff6b6b"); // Pôr do sol rosa/laranja
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);
            
            // Sol (Retro Sun)
            ctx.fillStyle = 'rgba(255, 200, 0, 0.3)';
            ctx.beginPath(); ctx.arc(cx, horizon, w*0.15, Math.PI, 0); ctx.fill();

            // Grama
            const gradGrass = ctx.createLinearGradient(0, horizon, 0, h);
            gradGrass.addColorStop(0, '#114411'); gradGrass.addColorStop(1, '#2d8a2d');
            ctx.fillStyle = gradGrass; ctx.fillRect(0, horizon, w, h);

            // Perspectiva Pista
            const topW = w * 0.01; const botW = w * 1.8; 
            const curveOff = d.curve * (w * 0.55);
            
            // Zebras (Texturizadas)
            const zebraW = w * 0.2;
            const zebraFreq = Math.floor(d.pos / 35) % 2;
            ctx.fillStyle = (zebraFreq === 0) ? '#cc0000' : '#eeeeee';
            ctx.beginPath();
            ctx.moveTo(cx + curveOff - topW - (zebraW*0.1), horizon);
            ctx.lineTo(cx + curveOff + topW + (zebraW*0.1), horizon);
            ctx.lineTo(cx + botW + zebraW, h);
            ctx.lineTo(cx - botW - zebraW, h);
            ctx.fill();

            // Asfalto
            ctx.fillStyle = '#333'; 
            ctx.beginPath();
            ctx.moveTo(cx + curveOff - topW, horizon); ctx.lineTo(cx + curveOff + topW, horizon);
            ctx.lineTo(cx + botW, h); ctx.lineTo(cx - botW, h);
            ctx.fill();

            // Faixas
            ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = w * 0.012;
            ctx.setLineDash([h * 0.08, h * 0.12]); ctx.lineDashOffset = -d.pos; 
            ctx.beginPath(); ctx.moveTo(cx + curveOff, horizon); 
            ctx.quadraticCurveTo(cx + (curveOff * 0.4), h * 0.7, cx, h); ctx.stroke(); ctx.setLineDash([]);

            // --- 4. OBJETOS ---
            let drawList = [];
            d.obs.forEach((o, i) => {
                o.z -= d.speed * 2.2; 
                if(o.z < -100) { d.obs.splice(i,1); return; }
                drawList.push({ type: o.type, obj: o, z: o.z });
            });
            d.enemies.forEach((e, i) => {
                e.z -= (d.speed - e.speed) * 2.2; e.x += e.laneChange;
                if(e.z < -300 || e.z > 1500) { d.enemies.splice(i,1); return; }
                drawList.push({ type: 'car', obj: e, z: e.z });
            });
            drawList.sort((a, b) => b.z - a.z);

            drawList.forEach(item => {
                const o = item.obj; const scale = 500 / (o.z + 100);
                if(scale > 0 && o.z < 1000) {
                    const objX = cx + (d.curve * w * 0.3 * (1 - o.z/1000)) + (o.x * w * 0.5 * scale);
                    const objY = (h * 0.4) + (50 * scale);
                    const size = (w * 0.12) * scale;
                    let hit = false;
                    if(o.z < 100 && o.z > -50 && Math.abs(d.x - o.x) < 0.3) hit = true;

                    if(item.type === 'cone') {
                        ctx.fillStyle = '#ff5500';
                        ctx.beginPath(); ctx.moveTo(objX, objY - size); 
                        ctx.lineTo(objX - size*0.4, objY); ctx.lineTo(objX + size*0.4, objY); ctx.fill();
                        if(hit) { d.speed *= 0.6; d.health -= 8; window.Sfx.crash(); window.Gfx.shake(10); d.obs.splice(d.obs.indexOf(o), 1); }
                    } 
                    else if (item.type === 'sign') {
                        const ph = size * 2.5;
                        ctx.fillStyle = '#222'; ctx.fillRect(objX - 2, objY - ph, 4*scale, ph); 
                        ctx.fillStyle = '#004488'; ctx.fillRect(objX - size*1.2, objY - ph, size*2.4, size);
                        ctx.fillStyle = '#fff'; ctx.font=`bold ${12*scale}px Arial`; ctx.textAlign='center';
                        ctx.fillText("CURVA", objX, objY - ph + size*0.6);
                        if(hit) { d.speed *= 0.3; d.health -= 20; window.Sfx.crash(); window.Gfx.shake(20); d.obs.splice(d.obs.indexOf(o), 1); }
                    }
                    else if (item.type === 'car') {
                        const es = scale * w * 0.0035;
                        ctx.save(); ctx.translate(objX, objY); ctx.scale(es, es);
                        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 15, 35, 12, 0, 0, Math.PI*2); ctx.fill();
                        ctx.fillStyle = o.color; ctx.beginPath(); ctx.roundRect(-22, -20, 44, 45, 6); ctx.fill();
                        ctx.fillStyle = '#000'; ctx.fillRect(-18, -15, 36, 10);
                        // Lanternas traseiras
                        ctx.fillStyle = '#ff0000'; ctx.shadowBlur=10; ctx.shadowColor='red';
                        ctx.fillRect(-20, 10, 12, 6); ctx.fillRect(8, 10, 12, 6);
                        ctx.shadowBlur=0;
                        ctx.restore();
                        if(hit) { d.speed = 0; d.health -= 30; window.Sfx.crash(); window.Gfx.shake(20); o.z -= 300; o.speed += 5; }
                    }
                }
            });

            // --- 5. EFEITO VELOCIDADE (Speed Lines) ---
            if(d.speed > 8) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                for(let i=0; i<5; i++) {
                    const lx = Math.random() * w;
                    const ly = Math.random() * h;
                    ctx.moveTo(cx, h*0.4); 
                    ctx.lineTo(lx, ly);
                }
                ctx.stroke();
            }

            // --- 6. PLAYER KART (Cockpit View) ---
            const carX = cx + (d.x * w * 0.25);
            const carY = h * 0.88;
            const s = w * 0.004;
            let visualTurn = d.steer * 22; 
            visualTurn = Math.max(-24, Math.min(24, visualTurn)); 

            ctx.save();
            ctx.translate(carX, carY);
            if(d.health < 40) ctx.translate((Math.random()-0.5)*3, (Math.random()-0.5)*3);
            ctx.scale(s, s);

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.ellipse(0, 20, 45, 15, 0, 0, Math.PI*2); ctx.fill();

            // Pneus Traseiros
            ctx.fillStyle = '#111';
            ctx.fillRect(-35, 0, 18, 24); ctx.fillRect(17, 0, 18, 24);

            // Chassi (Fórmula 1 Style)
            if(d.health > 70) ctx.fillStyle = '#e74c3c'; 
            else if(d.health > 30) ctx.fillStyle = '#c0392b'; 
            else ctx.fillStyle = '#555';
            
            // Corpo Principal
            ctx.beginPath(); 
            ctx.moveTo(-15, -30); ctx.lineTo(15, -30); 
            ctx.lineTo(22, 20); ctx.lineTo(-22, 20); 
            ctx.fill();

            // Asa Traseira
            ctx.fillStyle = '#222'; ctx.fillRect(-28, 25, 56, 12);

            // Fumaça se danificado
            if(d.health < 50) {
                ctx.fillStyle = 'rgba(100,100,100,0.5)';
                for(let i=0; i<3; i++) ctx.beginPath(), ctx.arc((Math.random()-0.5)*20, -40 - Math.random()*20, 10, 0, Math.PI*2), ctx.fill();
            }

            // Pneus Dianteiros (Esterçam)
            ctx.fillStyle = '#111';
            ctx.save();
            ctx.translate(-30, -25); ctx.rotate(d.steer * 0.5); ctx.fillRect(-6, -8, 12, 16); ctx.restore();
            ctx.save();
            ctx.translate(30, -25); ctx.rotate(d.steer * 0.5); ctx.fillRect(-6, -8, 12, 16); ctx.restore();

            // Capacete
            ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(0, -10, 14, 0, Math.PI*2); ctx.fill();
            
            ctx.restore();

            // --- 7. HUD ---
            const hudY = h * 0.08; const hudW = w * 0.5;
            // Life Bar Clean
            ctx.fillStyle = '#000'; ctx.fillRect(cx - hudW/2, hudY + 35, hudW, 6);
            const hpColor = d.health > 50 ? '#2ecc71' : '#e74c3c';
            ctx.fillStyle = hpColor; ctx.fillRect(cx - hudW/2, hudY + 35, Math.max(0, hudW * (d.health/100)), 6);
            ctx.shadowBlur = 10; ctx.shadowColor = hpColor; ctx.fillRect(cx - hudW/2, hudY + 35, Math.max(0, hudW * (d.health/100)), 6);
            ctx.shadowBlur = 0;

            if(d.health <= 0) window.System.gameOver("GAME OVER");
            if(window.Gfx && window.Gfx.drawSteeringHands) window.Gfx.drawSteeringHands(ctx, pose, w, h);

            return d.score;
        }
    };

    if(window.System) {
        window.System.registerGame('drive', 'Otto Kart Pro', '🏎️', Logic, {camOpacity: 0.5, showWheel: true});
    }
})();
