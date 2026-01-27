/* =================================================================
   GAME: OTTO KART GP (ULTIMATE WII PHYSICS)
   Implementa Volante Holográfico e Perspectiva 3D Scanline.
   ================================================================= */

(function() {
    const CONF = {
        TRACK_LEN: 20000,
        LAPS: 3,
        MAX_SPD: 160,
        ACCEL: 0.7,
        FRICTION: 0.97,
        TURN_SPD: 0.08,
        CENTRIFUGAL: 0.8,
        GRIP: 0.4
    };

    let particles = [];
    let opponents = [];

    const Logic = {
        speed: 0, 
        x: 0,           // Posição lateral (-1.5 a 1.5)
        steer: 0,       // Suavizado
        z: 0,           // Progresso
        lap: 1, 
        rank: 1,
        curve: 0,       // Curvatura da pista
        state: 'START',
        timer: 3000,

        // Input
        hands: { left: null, right: null },
        wheel: { x: 0, y: 0, ang: 0, r: 0, active: false },

        init: function() {
            this.speed = 0; this.x = 0; this.steer = 0; this.z = 0; this.lap = 1;
            this.state = 'START'; this.timer = 3500;
            particles = []; opponents = [];
            
            const colors = ['#e74c3c', '#f1c40f', '#9b59b6', '#2ecc71', '#3498db'];
            for(let i=0; i<5; i++) {
                opponents.push({ z: (i+1)*-400, x: (Math.random()-0.5)*1.5, spd: CONF.MAX_SPD*0.85, color: colors[i] });
            }
            window.System.msg("PREPARAR...");
        },

        update: function(ctx, w, h, pose) {
            const cx = w/2, cy = h/2, horizon = h*0.4;
            
            // 1. PROCESSAMENTO DE INPUT (VOLANTE HOLOGRÁFICO)
            this.wheel.active = false;
            if(pose) {
                const kp = pose.keypoints;
                const lw = kp.find(k=>k.name==='left_wrist'), rw = kp.find(k=>k.name==='right_wrist');
                
                if(lw && rw && lw.score > 0.4 && rw.score > 0.4) {
                    const p1 = window.Gfx.map(lw, w, h), p2 = window.Gfx.map(rw, w, h);
                    this.hands.left = p1; this.hands.right = p2;
                    this.wheel.active = true;

                    // Lógica do Volante Virtual
                    const dx = p2.x - p1.x, dy = p2.y - p1.y;
                    const angle = Math.atan2(dy, dx);
                    const dist = Math.hypot(dx, dy);
                    
                    this.wheel.x = (p1.x + p2.x)/2;
                    this.wheel.y = (p1.y + p2.y)/2;
                    this.wheel.ang = angle;
                    this.wheel.r = dist/2;

                    // Aplica Direção com Deadzone e Sensibilidade do Sistema
                    let input = angle * 2.5 * window.System.sens;
                    if(Math.abs(input) < 0.1) input = 0;
                    this.steer += (input - this.steer) * 0.15;
                    
                    if(this.state === 'RACE' && this.speed < CONF.MAX_SPD) this.speed += CONF.ACCEL;
                } else {
                    this.speed *= CONF.FRICTION;
                }
            }

            // 2. FÍSICA DE CORRIDA
            if(this.state === 'START') {
                this.timer -= 16;
                if(this.timer <= 0) { this.state = 'RACE'; window.System.msg("VAI!"); }
                else { const s = Math.ceil(this.timer/1000); if(s<=3) window.System.msg(s); }
            }

            if(this.state === 'RACE') {
                this.z += this.speed;
                // Pista em Senoide (Curvas procedurais)
                this.curve = Math.sin(this.z * 0.001) * 1.5;
                
                // Força Centrífuga vs Grip
                const centrifugal = this.curve * (this.speed/CONF.MAX_SPD) * CONF.CENTRIFUGAL;
                this.x += (this.steer * CONF.TURN_SPD) - centrifugal;

                // Penalidade fora da pista
                if(Math.abs(this.x) > 1.4) {
                    this.speed *= 0.94;
                    if(this.speed > 30) window.Gfx.shake(3);
                }

                // Checkpoint de Volta
                if(this.z >= CONF.TRACK_LEN) {
                    this.z = 0; this.lap++; window.Sfx.coin();
                    if(this.lap > CONF.LAPS) window.System.gameOver("CHEGADA!");
                    else window.System.msg("VOLTA " + this.lap);
                }

                // IA
                this.rank = 1;
                opponents.forEach(bot => {
                    bot.z += bot.spd;
                    bot.x += (-this.curve*0.5 - bot.x)*0.03;
                    if(bot.z > this.z + (this.lap-1)*CONF.TRACK_LEN) this.rank++;
                });
            }

            // 3. RENDERIZAÇÃO 3D (SCANLINE ENGINE)
            // Céu
            const sky = ctx.createLinearGradient(0,0,0,horizon);
            sky.addColorStop(0, '#3498db'); sky.addColorStop(1, '#87ceeb');
            ctx.fillStyle = sky; ctx.fillRect(0,0,w,horizon);
            // Grama
            ctx.fillStyle = '#2ecc71'; ctx.fillRect(0,horizon,w,h-horizon);

            // Pista (Trapézio Progressivo)
            const roadW_Far = w*0.05, roadW_Near = w*1.8;
            const curveVis = this.curve * w * 0.4;
            const phase = Math.floor(this.z/100)%2;

            ctx.beginPath();
            ctx.fillStyle = phase === 0 ? '#555' : '#444';
            ctx.moveTo(cx + curveVis - roadW_Far, horizon);
            ctx.lineTo(cx + curveVis + roadW_Far, horizon);
            ctx.lineTo(cx + roadW_Near, h);
            ctx.lineTo(cx - roadW_Near, h);
            ctx.fill();

            // Zebras
            ctx.strokeStyle = phase === 0 ? '#e74c3c' : '#fff'; ctx.lineWidth = w*0.05;
            ctx.beginPath(); ctx.moveTo(cx + curveVis - roadW_Far, horizon); ctx.lineTo(cx - roadW_Near, h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + curveVis + roadW_Far, horizon); ctx.lineTo(cx + roadW_Near, h); ctx.stroke();

            // 4. ELEMENTOS VISUAIS (PLAYER & VOLANTE)
            this.drawPlayer(ctx, w, h);
            if(this.wheel.active) this.drawWheel(ctx);

            // HUD Rank
            ctx.fillStyle = "#fff"; ctx.font = "italic 900 60px 'Russo One'"; ctx.textAlign = "left";
            ctx.strokeStyle = "#000"; ctx.lineWidth = 6;
            ctx.strokeText(this.rank + "º", 40, 160); ctx.fillText(this.rank + "º", 40, 160);

            return this.speed;
        },

        drawPlayer: function(ctx, w, h) {
            const s = w*0.0055, px = w/2, py = h*0.85;
            ctx.save(); ctx.translate(px, py); ctx.scale(s, s);
            ctx.rotate(this.steer * 0.2);

            // Sombra
            ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 20, 60, 15, 0, 0, Math.PI*2); ctx.fill();
            // Kart
            ctx.fillStyle='#e74c3c'; ctx.beginPath(); ctx.moveTo(-30,-50); ctx.lineTo(30,-50); ctx.lineTo(50,20); ctx.lineTo(-50,20); ctx.fill();
            ctx.fillStyle='#111'; ctx.fillRect(-55,0,25,30); ctx.fillRect(30,0,25,30); // Rodas
            // Capacete
            ctx.fillStyle='#f1c40f'; ctx.beginPath(); ctx.arc(0,-20,18,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#333'; ctx.fillRect(-12,-25,24,8); // Visor
            ctx.restore();
        },

        drawWheel: function(ctx) {
            ctx.save();
            ctx.translate(this.wheel.x, this.wheel.y);
            ctx.rotate(this.wheel.ang);
            const r = this.wheel.r;

            // Aro do Volante Holográfico
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 15; ctx.stroke();
            ctx.strokeStyle = 'rgba(52, 152, 219, 0.8)'; ctx.lineWidth = 5; ctx.stroke();
            
            // Haste Central
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(-r, -10, r*2, 20);
            
            // Logo Wii
            ctx.fillStyle = "#fff"; ctx.font = "bold 20px Arial"; ctx.textAlign = "center";
            ctx.fillText("Wii", 0, 7);
            ctx.restore();
        }
    };

    window.System.registerGame('kart', 'Otto Kart GP', '🏎️', Logic, {camOpacity: 0.4});
})();