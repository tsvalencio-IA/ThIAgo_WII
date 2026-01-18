// =============================================================================
// LÓGICA DO JOGO: OTTO PING PONG (TUNED GAMEPLAY)
// =============================================================================

(function() {
    const TABLE_W = 550;        
    const SENSITIVITY_BASE = 2.5; // Aumentei um pouco a sensibilidade
    const REACH_BOOST = 1.6;    
    const CALIBRATION_TIME = 50; // Calibração mais rápida

    // Sistema de partículas simples local
    let particles = [];

    const Logic = {
        score: 0,
        state: 'calibrate',
        ball: { x:0, y:0, z:1200, vx:0, vy:0, vz:0 },
        racket: { x:0, y:0 }, 
        prevRacket: { x:0, y:0 },
        handCenter: { x:null, y:null }, 
        calibCounter: 0, 
        flash: 0,
        inStrikeZone: false, // Novo indicador visual

        init: function() { 
            this.score = 0; 
            this.state = 'calibrate';
            this.handCenter = { x:null, y:null };
            this.calibCounter = 0;
            this.resetBall();
            particles = [];
            window.System.msg("CALIBRAR POSIÇÃO"); 
        },

        resetBall: function() {
            this.ball = { 
                x: 0, y: -180, z: 1200, 
                vx: (Math.random() - 0.5) * 12, // Um pouco mais lento lateralmente
                vy: 4, 
                vz: -20 - (this.score * 1.2) // Começa levemente mais lento
            };
            this.inStrikeZone = false;
        },

        update: function(ctx, w, h, pose) {
            const cx = w / 2; 
            const cy = h / 2;

            // 1. FUNDO
            const grad = ctx.createRadialGradient(cx, cy, 100, cx, cy, w);
            grad.addColorStop(0, '#2c3e50'); grad.addColorStop(1, '#000');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);

            // Grid de Chão
            ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth=2;
            ctx.beginPath();
            for(let i=0; i<h; i+=40) { ctx.moveTo(0, i); ctx.lineTo(w, i); }
            ctx.stroke();

            if(window.Gfx && window.Gfx.drawSkeleton && pose) {
                ctx.save(); ctx.globalAlpha = 0.3; 
                window.Gfx.drawSkeleton(ctx, pose, w, h);
                ctx.restore();
            }

            let hand = null;
            let rawPos = { x:0, y:0 };
            
            if(pose) {
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                if(rw && rw.score > 0.4) hand = rw;
                else if(lw && lw.score > 0.4) hand = lw;
            }

            if(hand) {
                rawPos = window.Gfx.map(hand, w, h);
            }

            // --- LÓGICA ---

            if(this.state === 'calibrate') {
                const pulse = Math.sin(Date.now() / 200) * 5;
                ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 3;
                ctx.setLineDash([15, 10]);
                ctx.beginPath(); ctx.arc(cx, cy, 60 + pulse, 0, Math.PI*2); ctx.stroke();
                ctx.setLineDash([]);
                
                ctx.fillStyle = '#fff'; ctx.font = "bold 20px 'Chakra Petch'"; ctx.textAlign = "center";
                ctx.fillText("POSICIONE A MÃO", cx, cy - 90);

                if(hand) {
                    ctx.fillStyle = '#00ff00'; 
                    ctx.beginPath(); ctx.arc(rawPos.x, rawPos.y, 15, 0, Math.PI*2); ctx.fill();
                    const dist = Math.hypot(rawPos.x - cx, rawPos.y - cy);
                    
                    if(dist < 70) { // Área de calibração maior
                        this.calibCounter++;
                        const progress = this.calibCounter / CALIBRATION_TIME;
                        
                        ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 10; ctx.lineCap = 'round';
                        ctx.beginPath(); 
                        ctx.arc(cx, cy, 60 + pulse, -Math.PI/2, (-Math.PI/2) + (Math.PI*2*progress)); 
                        ctx.stroke();

                        if(this.calibCounter >= CALIBRATION_TIME) {
                            this.handCenter = { x: rawPos.x, y: rawPos.y };
                            this.state = 'serve';
                            window.System.msg("JOGAR!");
                            window.Sfx.coin();
                        }
                    } else {
                        this.calibCounter = Math.max(0, this.calibCounter - 2);
                    }
                }
            }
            else {
                this.prevRacket = { ...this.racket };

                if(hand) {
                    let dx = rawPos.x - this.handCenter.x;
                    let dy = rawPos.y - this.handCenter.y;
                    const reachFactor = 1 + (Math.abs(dx) / (w * 0.25)) * REACH_BOOST;
                    let targetX = dx * SENSITIVITY_BASE * reachFactor;
                    let targetY = dy * SENSITIVITY_BASE; 
                    
                    // Suavização ajustada para ser mais responsiva
                    const distToTarget = Math.hypot(targetX - this.racket.x, targetY - this.racket.y);
                    const smoothFactor = Math.min(0.95, 0.4 + (distToTarget / 100)); 

                    this.racket.x += (targetX - this.racket.x) * smoothFactor;
                    this.racket.y += (targetY - this.racket.y) * smoothFactor;
                    this.racket.x = Math.max(-TABLE_W/2 - 100, Math.min(TABLE_W/2 + 100, this.racket.x));
                }

                if(this.state === 'serve') {
                    this.ball.z -= 18;
                    if(this.ball.z < 1000) this.state = 'play';
                }
                else if(this.state === 'play') {
                    this.ball.x += this.ball.vx;
                    this.ball.y += this.ball.vy;
                    this.ball.z += this.ball.vz;
                    if(this.ball.y < 250) this.ball.vy += 0.35;

                    // COLISÃO FACILITADA
                    // Zona de batida estendida (entre 200 e -100 no eixo Z)
                    this.inStrikeZone = (this.ball.z < 250 && this.ball.z > -100 && this.ball.vz < 0);

                    if(this.inStrikeZone) {
                        const scale = 500 / (this.ball.z + 500);
                        const ballScreenX = (this.ball.x * scale); 
                        const ballScreenY = (this.ball.y * scale) + 60; 
                        
                        // Distância entre raquete e bola na tela 2D
                        const dist = Math.hypot(ballScreenX - this.racket.x, ballScreenY - this.racket.y);
                        
                        // HITBOX GIGANTE (AIM ASSIST)
                        // Aumentado para 22% da largura da tela
                        if(dist < w * 0.22) {
                            window.Sfx.hit();
                            window.Gfx.shake(5); 
                            
                            for(let i=0; i<10; i++) {
                                particles.push({
                                    x: cx + ballScreenX, y: cy + ballScreenY,
                                    vx: (Math.random()-0.5)*10, vy: (Math.random()-0.5)*10,
                                    life: 1.0
                                });
                            }

                            this.score++;
                            this.flash = 4;
                            this.ball.vz = Math.abs(this.ball.vz) + 3; // Rebate
                            this.ball.vy = -14;
                            this.ball.vx = (ballScreenX - this.racket.x) * 0.8; // Spin baseado no acerto
                            
                            // Feedback Visual
                            const msgs = ["BOM!", "ÓTIMO!", "UAU!", "CRACK!"];
                            window.System.msg(msgs[Math.floor(Math.random()*msgs.length)]);
                        }
                    }

                    if(this.ball.z > 1500 && this.ball.vz > 0) {
                        window.Sfx.click(); 
                        this.ball.vz = -20 - (this.score * 1.0);
                        this.ball.vx = (Math.random() - 0.5) * 28;
                        this.ball.vy = -8;
                    }

                    if(this.ball.z < -350) {
                        this.state = 'game_over';
                        window.System.gameOver(this.score);
                    }
                }
            }

            // =================================================================
            // RENDERIZAÇÃO
            // =================================================================
            
            const project = (x, y, z) => {
                const scale = 500 / (500 + z);
                return {
                    x: cx + (x * scale),
                    y: cy + ((y + 120) * scale),
                    s: scale
                };
            };

            const pTL = project(-TABLE_W/2, 0, 1500); 
            const pTR = project(TABLE_W/2, 0, 1500);  
            const pBL = project(-TABLE_W/2, 0, 0);    
            const pBR = project(TABLE_W/2, 0, 0);     

            // MESA
            const tableGrad = ctx.createLinearGradient(0, pTL.y, 0, pBL.y);
            // Muda a cor da mesa se a bola estiver na zona de ataque
            if(this.inStrikeZone) {
                tableGrad.addColorStop(0, '#145a32'); 
                tableGrad.addColorStop(1, '#2ecc71'); // Verde Brilhante
            } else {
                tableGrad.addColorStop(0, '#1a5276'); 
                tableGrad.addColorStop(1, '#3498db'); // Azul Padrão
            }
            
            ctx.beginPath(); ctx.fillStyle = tableGrad; 
            ctx.moveTo(pTL.x, pTL.y); ctx.lineTo(pTR.x, pTR.y);
            ctx.lineTo(pBR.x, pBR.y); ctx.lineTo(pBL.x, pBL.y);
            ctx.fill();

            // Bordas e Rede
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(pTL.x, pTL.y); ctx.lineTo(pBL.x, pBL.y);
            ctx.moveTo(pTR.x, pTR.y); ctx.lineTo(pBR.x, pBR.y);
            ctx.moveTo(pTL.x, pTL.y); ctx.lineTo(pTR.x, pTR.y);
            ctx.moveTo(pBL.x, pBL.y); ctx.lineTo(pBR.x, pBR.y);
            const midTop = project(0,0,1500); const midBot = project(0,0,0);
            ctx.moveTo(midTop.x, midTop.y); ctx.lineTo(midBot.x, midBot.y);
            ctx.stroke();

            const netY = pTL.y + (pBL.y - pTL.y) * 0.5;
            const netW = (pBR.x - pBL.x) * 0.7;
            ctx.fillStyle='rgba(255,255,255,0.2)'; ctx.fillRect(cx - netW/2, netY-25, netW, 25);
            ctx.fillStyle='#fff'; ctx.fillRect(cx - netW/2, netY-25, netW, 3);

            // BOLA
            if(this.state !== 'calibrate') {
                const ballPos = project(this.ball.x, this.ball.y, this.ball.z);
                
                if(ballPos.s > 0) {
                    const bSize = 18 * ballPos.s; // Bola um pouco maior
                    
                    // SOMBRA DA BOLA (IMPORTANTE PARA PROFUNDIDADE)
                    const shadowPos = project(this.ball.x, 150, this.ball.z); 
                    const shadowAlpha = Math.max(0, 0.6 - (Math.abs(this.ball.y) / 400));
                    ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
                    ctx.beginPath(); 
                    ctx.ellipse(shadowPos.x, shadowPos.y, bSize, bSize*0.4, 0, 0, Math.PI*2); 
                    ctx.fill();

                    // CORPO DA BOLA
                    const gradBall = ctx.createRadialGradient(ballPos.x - bSize*0.3, ballPos.y - bSize*0.3, bSize*0.2, ballPos.x, ballPos.y, bSize);
                    gradBall.addColorStop(0, '#fff'); gradBall.addColorStop(1, '#ddd');
                    ctx.fillStyle = gradBall;
                    ctx.beginPath(); ctx.arc(ballPos.x, ballPos.y, bSize, 0, Math.PI*2); ctx.fill();
                    
                    // Contorno para alto contraste
                    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
                }
            }

            // RAQUETE
            if(this.state !== 'calibrate') {
                const rX = cx + this.racket.x;
                const rY = cy + this.racket.y;
                const rSize = w * 0.12; // RAQUETE MAIOR

                // SOMBRA DA RAQUETE NA MESA (NOVO - AJUDA NA MIRA)
                // Projetamos a sombra onde a raquete estaria tocando a mesa (Z=0)
                const shadowRx = project(this.racket.x, 150, 0); 
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath(); ctx.ellipse(shadowRx.x, shadowRx.y, rSize, rSize*0.5, 0, 0, Math.PI*2); ctx.fill();

                // Cabo
                ctx.fillStyle = '#d35400'; ctx.fillRect(rX - 12, rY, 24, rSize * 1.8);
                
                // Borracha
                const gradRacket = ctx.createRadialGradient(rX, rY, rSize*0.5, rX, rY, rSize);
                gradRacket.addColorStop(0, '#e74c3c'); gradRacket.addColorStop(1, '#c0392b');
                ctx.fillStyle = gradRacket; 
                ctx.beginPath(); ctx.arc(rX, rY, rSize, 0, Math.PI*2); ctx.fill();
                
                ctx.strokeStyle = '#f39c12'; ctx.lineWidth = 5; ctx.stroke();
            }

            // EFEITOS
            particles.forEach((p, i) => {
                p.x += p.vx; p.y += p.vy; p.life -= 0.05;
                if(p.life <= 0) particles.splice(i, 1);
                else {
                    ctx.globalAlpha = p.life; ctx.fillStyle = '#fff'; ctx.fillRect(p.x, p.y, 4, 4);
                }
            });
            ctx.globalAlpha = 1;

            if(this.flash > 0) {
                ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.2})`; ctx.fillRect(0,0,w,h); this.flash--;
            }

            return this.score;
        }
    };

    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('tennis', 'Otto PingPong', '🏓', Logic, {camOpacity: 0.5, showWheel: false});
            clearInterval(regLoop);
        }
    }, 100);
})();
