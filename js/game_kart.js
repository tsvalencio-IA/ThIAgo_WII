// =============================================================================
// LÓGICA DO JOGO: OTTO KART GP (COMMERCIAL WII PHYSICS ENGINE)
// ARQUITETO: ESPECIALISTA EM JOGOS CORPORAIS (CODE 177)
// =============================================================================

(function() {
    // --- CONSTANTES DE TUNING (GAME DESIGN - NINTENDO FEEL) ---
    const CONF = {
        TRACK_LENGTH: 18000,   // Comprimento da volta (unidades virtuais)
        LAPS: 3,               // Total de voltas
        MAX_SPEED: 145,        // Velocidade máxima (balanceada para controle)
        ACCEL: 0.65,           // Aceleração por frame
        FRICTION: 0.96,        // Desaceleração natural (freio motor)
        OFFROAD_DRAG: 0.90,    // Penalidade de velocidade na grama
        TURN_SENS: 0.085,      // Sensibilidade de curva
        CENTRIFUGAL: 0.85,     // Força centrífuga base da pista
        GRIP_BONUS: 0.45,      // Ganho de aderência ao curvar corretamente
        CENTER_ASSIST: 0.06,   // Força "invisível" que puxa para o centro em retas
        STEER_INERTIA: 0.12,   // Peso do volante (quanto menor, mais pesado)
        AI_COUNT: 5,           // Número de oponentes (CPU)
        AI_DIFFICULTY: 0.03    // Intensidade do Rubber Banding da IA
    };

    // --- VARIÁVEIS GLOBAIS DO MÓDULO ---
    let particles = [];
    let opponents = [];

    // --- CLASSE DE OPONENTES (IA COMPETITIVA) ---
    class Opponent {
        constructor(id, color, startZ) {
            this.id = id;
            this.color = color;
            this.z = startZ; // Distância absoluta
            this.x = (Math.random() - 0.5) * 1.5; // Posição lateral
            this.speed = CONF.MAX_SPEED * 0.9;
            this.baseSpeed = CONF.MAX_SPEED * (0.85 + Math.random() * 0.15);
            this.lap = 1;
            this.finished = false;
        }

        update(playerZ, trackCurve) {
            if (this.finished) return;

            // Rubber Banding: IA ajusta velocidade para manter a corrida emocionante
            const diff = playerZ - this.z;
            let targetSpeed = this.baseSpeed;
            
            // Se o jogador estiver muito longe na frente, IA acelera (Turbo)
            if (diff > 2500) targetSpeed *= 1.3;
            // Se o jogador estiver muito atrás, IA espera
            if (diff < -2500) targetSpeed *= 0.8;

            // Aceleração suave
            this.speed += (targetSpeed - this.speed) * CONF.AI_DIFFICULTY;
            this.z += this.speed;

            // IA segue a curva da pista (com imperfeições humanas)
            const idealLine = -trackCurve * 0.4;
            this.x += (idealLine - this.x) * 0.025;
            
            // IA evita sair da pista
            if (this.x < -1.3) this.x += 0.05;
            if (this.x > 1.3) this.x -= 0.05;
        }
    }

    const Logic = {
        // --- ESTADO DO JOGADOR ---
        speed: 0,
        x: 0,           // Posição Lateral (-1.5 a 1.5)
        steer: 0,       // Volante Virtual Suavizado (-1.0 a 1.0)
        
        // --- ESTADO DA CORRIDA ---
        z: 0,           // Distância na volta atual
        totalZ: 0,      // Distância total percorrida (absoluta)
        lap: 1,
        rank: 1,        // Posição atual (1º a 6º)
        time: 0,        // Tempo de corrida em ms
        state: 'START', // START, RACE, FINISH
        startTimer: 4000,

        // --- ESTADO DO MUNDO ---
        curve: 0,       // Curvatura atual da pista
        
        // --- INPUT & VISUAL ---
        inputState: 0,  // 0=Nenhuma mão, 1=Uma mão, 2=Duas mãos (Volante)
        hands: { left: null, right: null },
        wheel: { x: 0, y: 0, r: 0, a: 0, opacity: 0 },
        visualTilt: 0,  // Inclinação do chassi
        bounce: 0,      // Vibração do motor
        
        // --- OBJETOS ---
        obs: [],

        init: function() {
            // Reset de todas as variáveis para evitar lixo de memória
            this.speed = 0; this.x = 0; this.steer = 0;
            this.z = 0; this.totalZ = 0; this.lap = 1; this.time = 0;
            this.rank = 1; this.curve = 0;
            this.state = 'START'; this.startTimer = 4000;
            this.visualTilt = 0; this.bounce = 0;
            
            this.obs = []; particles = []; opponents = [];
            
            // Cria Oponentes com cores distintas
            const colors = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#2ecc71'];
            for(let i=0; i<CONF.AI_COUNT; i++) {
                // Posiciona oponentes atrás para largada
                opponents.push(new Opponent(i, colors[i%5], (i+1) * -300));
            }

            if(window.System) window.System.msg("LIGUEM OS MOTORES!");
            if(window.Sfx) window.Sfx.play(100, 'sawtooth', 0.5, 0.2);
        },

        update: function(ctx, w, h, pose) {
            const d = Logic;
            const cx = w / 2;
            const horizon = h * 0.35; // Horizonte fixo (Padrão Mario Kart)

            // =================================================================
            // 1. SISTEMA DE INPUT E FÍSICA DO VOLANTE (COM PESO E INÉRCIA)
            // =================================================================
            d.inputState = 0;
            d.hands.left = null; d.hands.right = null;
            let targetAngle = 0;

            // Razão de velocidade (0.0 a 1.0+)
            const speedRatio = Math.min(1.2, d.speed / CONF.MAX_SPEED);

            if(pose) {
                const kp = pose.keypoints;
                const lw = kp.find(k=>k.name==='left_wrist');
                const rw = kp.find(k=>k.name==='right_wrist');

                // Mapeamento com confiança
                if(lw && lw.score > 0.4) d.hands.left = window.Gfx.map(lw, w, h);
                if(rw && rw.score > 0.4) d.hands.right = window.Gfx.map(rw, w, h);

                if(d.hands.left && d.hands.right) {
                    d.inputState = 2; // Volante Detectado
                    
                    const p1 = d.hands.left; const p2 = d.hands.right;
                    
                    // Cálculo do Centro e Raio do Volante Visual
                    const wheelCX = (p1.x + p2.x) / 2;
                    const wheelCY = (p1.y + p2.y) / 2;
                    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                    
                    // Suavização Visual do Volante (Lerp)
                    d.wheel.x += (wheelCX - d.wheel.x) * 0.25;
                    d.wheel.y += (wheelCY - d.wheel.y) * 0.25;
                    let targetR = Math.max(w*0.1, Math.min(w*0.28, dist/2));
                    d.wheel.r += (targetR - d.wheel.r) * 0.15;
                    d.wheel.opacity = Math.min(1, d.wheel.opacity + 0.15);

                    // Cálculo do Ângulo Bruto (Trigonometria)
                    const dy = p2.y - p1.y; 
                    const dx = p2.x - p1.x;
                    let rawCalc = Math.atan2(dy, dx);

                    // [FÍSICA 1] DEADZONE PROGRESSIVA
                    // Quanto maior a velocidade, maior a deadzone central para estabilidade
                    const deadzone = 0.05 + (0.12 * speedRatio);
                    if(Math.abs(rawCalc) < deadzone) rawCalc = 0;
                    else rawCalc -= Math.sign(rawCalc) * deadzone;

                    // [FÍSICA 2] CURVA DE RESPOSTA EXPONENCIAL
                    // Centro preciso, pontas agressivas
                    targetAngle = Math.sign(rawCalc) * Math.pow(Math.abs(rawCalc), 1.7) * 2.3 * window.System.sens;

                    // Auto-Aceleração (Simulação de pedal)
                    if(d.state === 'RACE' && d.speed < CONF.MAX_SPEED) {
                        d.speed += CONF.ACCEL;
                    }

                } else {
                    // Sem mãos: Freio motor
                    d.inputState = d.hands.left || d.hands.right ? 1 : 0;
                    d.wheel.opacity *= 0.9;
                    d.speed *= CONF.FRICTION; 
                }
            } else {
                d.wheel.opacity *= 0.9;
                d.speed *= CONF.FRICTION;
            }

            // [FÍSICA 3] SIMULAÇÃO DE INÉRCIA DO SISTEMA DE DIREÇÃO
            // O volante não muda instantaneamente. Ele tem massa.
            // Em alta velocidade, ele fica mais "firme".
            const inertia = CONF.STEER_INERTIA + (0.1 * speedRatio);
            d.steer += (targetAngle - d.steer) * inertia;
            
            // Trava física (Lock-to-Lock)
            d.steer = Math.max(-1.5, Math.min(1.5, d.steer));
            d.wheel.a = d.steer;

            // Remove volante antigo da UI se existir
            const uiWheel = document.getElementById('visual-wheel');
            if(uiWheel) uiWheel.style.opacity = '0';

            // =================================================================
            // 2. ENGINE DE FÍSICA DO KART (WII FEEL & ASSISTÊNCIAS)
            // =================================================================
            
            // Lógica de Largada
            if(d.state === 'START') {
                d.startTimer -= 16;
                if(d.startTimer <= 0) {
                    d.state = 'RACE';
                    if(window.System) window.System.msg("VAI!!");
                    if(window.Sfx) window.Sfx.play(600, 'square', 1.0, 0.1);
                } else {
                    const sec = Math.ceil(d.startTimer/1000);
                    if(sec <= 3 && window.System) window.System.msg(sec);
                }
            }

            if(d.state === 'RACE') {
                d.time += 16;
                d.z += d.speed;
                d.totalZ += d.speed;

                // Gerador de Pista Procedural (Senoides Compostas)
                // Cria retas longas e curvas suaves
                d.curve = (Math.sin(d.totalZ * 0.001) * 1.5) + (Math.sin(d.totalZ * 0.0003) * 0.5);

                // --- NÚCLEO DA FÍSICA DE MÁRIO KART (MAGIC GRIP) ---
                
                // 1. Detectar Intenção de Ir Reto (Volante próximo ao centro)
                const intentStraight = Math.abs(d.steer) < 0.2;
                
                // 2. Calcular Força Centrífuga (A força que joga para fora)
                // A curva da pista tenta empurrar o kart lateralmente
                let centrifugal = d.curve * speedRatio * CONF.CENTRIFUGAL;

                // 3. Aplicar Assistências Invisíveis (Regra de Ouro)
                if(intentStraight && speedRatio > 0.4) {
                    // MODO CRUZEIRO (RETAS):
                    // Se o jogador quer ir reto e está rápido, "desligamos" a força lateral
                    centrifugal *= 0.15; 
                    
                    // Auto-Alinhamento (Lane Assist): Puxa suavemente para o centro
                    d.x -= d.x * CONF.CENTER_ASSIST * speedRatio;
                } else {
                    // MODO CURVA:
                    // Se o volante aponta para a direção da curva (sinais diferentes),
                    // o jogador ganha GRIP EXTRA (recompensa por pilotar bem)
                    if(Math.sign(d.steer) !== Math.sign(d.curve)) {
                        centrifugal *= (1.0 - CONF.GRIP_BONUS);
                    }
                }

                // 4. Integração Final de Movimento Lateral
                // X += (Direção do Jogador) - (Força da Pista Resultante)
                // Grip reduz levemente em velocidade máxima para manter tensão
                const grip = 1.0 - (speedRatio * 0.1);
                d.x += (d.steer * CONF.TURN_SENS * grip) - centrifugal;

                // 5. Colisão com Bordas (Grama/Areia)
                let isOffRoad = false;
                if(Math.abs(d.x) > 1.4) {
                    d.speed *= CONF.OFFROAD_DRAG;
                    isOffRoad = true;
                    d.x = Math.max(-1.5, Math.min(1.5, d.x)); // Parede elástica
                    if(d.speed > 20 && window.Gfx) window.Gfx.shake(2);
                }

                // 6. Processamento de Voltas
                if(d.z >= CONF.TRACK_LENGTH) {
                    d.z -= CONF.TRACK_LENGTH;
                    d.lap++;
                    if(window.Sfx) window.Sfx.coin();
                    if(d.lap > CONF.LAPS) {
                        d.state = 'FINISH';
                        if(window.System) window.System.gameOver(`CHEGADA! ${d.rank}º LUGAR`);
                    } else {
                        if(window.System) window.System.msg("VOLTA " + d.lap);
                    }
                }
            }

            // Atualiza IA e Ranks
            // Calcula posição relativa baseada na distância total absoluta
            const myAbsZ = ((d.lap-1) * CONF.TRACK_LENGTH) + d.z;
            let currentRank = 1;
            
            opponents.forEach(bot => {
                if(!bot.finished) {
                    bot.update(myAbsZ, d.curve);
                    if(bot.z >= CONF.TRACK_LENGTH * CONF.LAPS) bot.finished = true;
                }
                
                // Calcula Rank
                if(bot.z > myAbsZ) currentRank++;
                
                // Colisão Física Simples (Jogador x IA)
                const relZ = bot.z - myAbsZ;
                if(Math.abs(relZ) < 200 && Math.abs(bot.x - d.x) < 0.5) {
                    if(window.Sfx) window.Sfx.crash();
                    if(window.Gfx) window.Gfx.shake(5);
                    d.speed *= 0.9; // Perde velocidade
                    d.x += (d.x - bot.x) * 0.25; // Empurrão lateral
                }
            });
            d.rank = currentRank;

            // Efeitos Visuais Físicos
            d.bounce = Math.sin(Date.now()/30) * (speedRatio * 3);
            if(isOffRoad) d.bounce = (Math.random()-0.5) * 15;
            d.visualTilt += (d.steer - d.visualTilt) * 0.15; // Body Roll suave

            // =================================================================
            // 3. RENDERIZAÇÃO (ENGINE GRÁFICA OTIMIZADA)
            // =================================================================
            
            // Céu e Horizonte
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, "#3498db"); gradSky.addColorStop(1, "#87ceeb");
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

            // Nuvens Parallax (Movem-se opostas à curva para dar sensação de giro)
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            const bgX = d.steer * 60 + (d.curve * 200);
            const drawCloud = (x,y,s) => {
                ctx.beginPath(); ctx.arc(x,y,30*s,0,Math.PI*2); ctx.arc(x+25*s,y-10*s,35*s,0,Math.PI*2); ctx.arc(x+50*s,y,30*s,0,Math.PI*2); ctx.fill();
            };
            drawCloud(w*0.2 - bgX, horizon*0.6, 1.2); drawCloud(w*0.8 - bgX, horizon*0.4, 0.9);

            // Chão (Grama)
            ctx.fillStyle = '#2ecc71'; ctx.fillRect(0, horizon, w, h);

            // PISTA (Trapézio com projeção de perspectiva)
            const roadW_Far = w * 0.02; 
            const roadW_Near = w * 2.2;
            const curveVis = d.curve * (w * 0.6); 

            // Efeito Zebrado (Stripes de velocidade)
            const segSize = 50;
            const phase = Math.floor(d.z / segSize) % 2;
            const zebraColor = phase === 0 ? '#e74c3c' : '#ffffff';
            const grassColor = phase === 0 ? '#27ae60' : '#2ecc71';

            // Faixas laterais no chão
            ctx.fillStyle = grassColor; ctx.fillRect(0, horizon, w, h);

            // Desenha Pista
            ctx.beginPath();
            ctx.fillStyle = zebraColor;
            const curbW = w * 0.35;
            ctx.moveTo(cx + curveVis - roadW_Far - curbW*0.15, horizon);
            ctx.lineTo(cx + curveVis + roadW_Far + curbW*0.15, horizon);
            ctx.lineTo(cx + roadW_Near + curbW, h);
            ctx.lineTo(cx - roadW_Near - curbW, h);
            ctx.fill();

            ctx.beginPath();
            ctx.fillStyle = '#555'; // Asfalto
            ctx.moveTo(cx + curveVis - roadW_Far, horizon);
            ctx.lineTo(cx + curveVis + roadW_Far, horizon);
            ctx.lineTo(cx + roadW_Near, h);
            ctx.lineTo(cx - roadW_Near, h);
            ctx.fill();

            // Linha Central
            if(phase === 0) {
                ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = w * 0.015;
                ctx.beginPath(); ctx.moveTo(cx + curveVis, horizon); ctx.lineTo(cx, h); ctx.stroke();
            }

            // =================================================================
            // 4. OBJETOS (Z-BUFFER & SORTING)
            // =================================================================
            let drawQueue = [];

            // Adiciona Oponentes à fila de desenho
            opponents.forEach(bot => {
                const relZ = bot.z - myAbsZ;
                // Só desenha se estiver visível (na frente ou logo atrás)
                if(relZ > -400 && relZ < 3000) drawQueue.push({ type:'car', obj:bot, z:relZ });
            });

            // Árvores Decorativas (Geração procedural baseada na posição)
            for(let i=0; i<12; i++) {
                // Árvores a cada 300 unidades
                const treeZ = (Math.floor((d.z+3000)/300) * 300) - (i * 300);
                const relZ = treeZ - d.z;
                if(relZ > 100 && relZ < 3000) {
                    drawQueue.push({ type:'tree', x:-2.5, z:relZ }); // Esq
                    drawQueue.push({ type:'tree', x:2.5, z:relZ });  // Dir
                }
            }

            // Ordena do mais longe para o mais perto (Painter's Algorithm)
            drawQueue.sort((a, b) => b.z - a.z);

            drawQueue.forEach(item => {
                const scale = 600 / (item.z + 600);
                const curveOffset = d.curve * w * (item.z / 3000);
                
                // Posição X relativa ao centro da pista
                let relX = 0;
                if(item.type === 'car') relX = (item.obj.x - d.x); // Carros movem-se com a pista
                else relX = (item.x - d.x); // Árvores são fixas

                const objX = cx + curveOffset + (relX * w * 1.0 * scale);
                const objY = horizon + (30 * scale);
                const size = (w * 0.2) * scale;

                if(item.type === 'car') {
                    const bot = item.obj;
                    // Sombra
                    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(objX, objY+size*0.6, size*0.8, size*0.2, 0, 0, Math.PI*2); ctx.fill();
                    // Carro
                    ctx.fillStyle = bot.color; ctx.fillRect(objX - size/2, objY - size/2, size, size*0.7);
                    // Rodas
                    ctx.fillStyle = '#222'; 
                    ctx.fillRect(objX - size*0.6, objY, size*0.2, size*0.3);
                    ctx.fillRect(objX + size*0.4, objY, size*0.2, size*0.3);
                    // Label Posição (se estiver perto)
                    if(scale > 0.4) {
                        ctx.fillStyle = '#fff'; ctx.font = `bold ${10*scale}px Arial`; ctx.textAlign='center';
                        ctx.fillText(`P${bot.id+1}`, objX, objY - size*0.8);
                    }
                } 
                else if (item.type === 'tree') {
                    // Árvore estilo 8-bit
                    ctx.fillStyle = '#1e8449'; 
                    ctx.beginPath(); ctx.moveTo(objX, objY - size*2); ctx.lineTo(objX-size*0.8, objY); ctx.lineTo(objX+size*0.8, objY); ctx.fill();
                    ctx.fillStyle = '#5d4037'; ctx.fillRect(objX - size*0.2, objY, size*0.4, size*0.4);
                }
            });

            // =================================================================
            // 5. PLAYER KART & HUD (INTERFACE)
            // =================================================================
            const carScale = w * 0.0055;
            const carX = cx; 
            const carY = h * 0.85 + d.bounce;

            ctx.save();
            ctx.translate(carX, carY);
            ctx.scale(carScale, carScale);
            // Inclina o visual do kart nas curvas
            ctx.rotate((d.steer * 0.25) - (d.curve * 0.15));

            // Partículas (Se derrapando ou na grama)
            if(isOffRoad || Math.abs(d.steer) > 0.9) {
                const color = isOffRoad ? '#2ecc71' : '#bdc3c7';
                particles.push({ x: carX-40, y: carY+20, vx: -2, vy: 5, life: 10, c: color });
                particles.push({ x: carX+40, y: carY+20, vx: 2, vy: 5, life: 10, c: color });
            }

            // Sombra do Kart
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 25, 65, 18, 0, 0, Math.PI*2); ctx.fill();
            
            // Rodas Traseiras
            ctx.fillStyle = '#111'; ctx.fillRect(-55, 5, 30, 30); ctx.fillRect(25, 5, 30, 30); 
            // Motor
            ctx.fillStyle = '#333'; ctx.fillRect(-30, 20, 60, 20); 
            // Escapamentos
            ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-15, 35, 8, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(15, 35, 8, 0, Math.PI*2); ctx.fill();

            // Chassi Aerodinâmico
            const bodyGrad = ctx.createLinearGradient(-40, -40, 40, 40);
            bodyGrad.addColorStop(0, '#e74c3c'); bodyGrad.addColorStop(1, '#c0392b');
            ctx.fillStyle = bodyGrad;
            ctx.beginPath(); ctx.moveTo(-20, -60); ctx.lineTo(20, -60); ctx.lineTo(45, 10); ctx.lineTo(50, 30); ctx.lineTo(-50, 30); ctx.lineTo(-45, 10); ctx.fill();

            // Rodas Dianteiras (Esterçam com o volante)
            ctx.fillStyle = '#111';
            ctx.save(); ctx.translate(-45, -30); ctx.rotate(d.steer * 0.8); ctx.fillRect(-12, -15, 24, 30); ctx.restore(); 
            ctx.save(); ctx.translate(45, -30); ctx.rotate(d.steer * 0.8); ctx.fillRect(-12, -15, 24, 30); ctx.restore(); 

            // Capacete do Piloto (Gira com a cabeça/volante)
            ctx.save(); ctx.rotate(d.steer * 0.5);
            ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(0, -25, 20, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#111'; ctx.fillRect(-14, -30, 28, 10); // Visor
            ctx.fillStyle = 'red'; ctx.font="bold 14px Arial"; ctx.fillText("M", -6, -40);
            ctx.restore();
            ctx.restore(); // Fim do Contexto do Carro

            // Renderiza Partículas
            particles.forEach((p, i) => {
                p.x += p.vx; p.y += p.vy; p.life--;
                if(p.life <= 0) particles.splice(i, 1);
                else { ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 5, 5); }
            });

            // --- HUD (Interface de Usuário) ---
            const speedX = w - 80; const speedY = h - 80;
            // Fundo do Velocímetro
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(speedX, speedY, 50, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
            
            // Ponteiro
            const ang = Math.PI + (d.speed / CONF.MAX_SPEED) * Math.PI;
            ctx.strokeStyle = '#ff0000'; ctx.beginPath(); ctx.moveTo(speedX, speedY); ctx.lineTo(speedX + Math.cos(ang)*45, speedY + Math.sin(ang)*45); ctx.stroke();
            
            // Texto Velocidade
            ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.font="bold 16px Arial";
            ctx.fillText(Math.floor(d.speed), speedX, speedY + 20);
            ctx.font="10px Arial"; ctx.fillText("KM/H", speedX, speedY + 35);

            // Informações de Corrida (Esquerda)
            const infoX = 30; const infoY = 80;
            ctx.textAlign = 'left';
            
            // Posição (Rank)
            ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 6;
            ctx.font = "italic 900 60px 'Russo One'";
            const rankTxt = d.rank + "º";
            ctx.strokeText(rankTxt, infoX, infoY); ctx.fillText(rankTxt, infoX, infoY);

            // Voltas
            ctx.font = "bold 24px Arial";
            ctx.strokeText(`LAP ${d.lap}/${CONF.LAPS}`, infoX, infoY + 40);
            ctx.fillText(`LAP ${d.lap}/${CONF.LAPS}`, infoX, infoY + 40);

            // Tempo
            const mins = Math.floor(d.time/60000);
            const secs = Math.floor((d.time%60000)/1000);
            const ms = Math.floor((d.time%1000)/10);
            const timeStr = `${mins}:${secs.toString().padStart(2,'0')}:${ms.toString().padStart(2,'0')}`;
            ctx.font = "20px monospace"; ctx.textAlign='right';
            ctx.fillText(timeStr, w - 20, 40);

            // =================================================================
            // 6. VOLANTE VIRTUAL (VISUALIZAÇÃO DO INPUT)
            // =================================================================
            if(d.inputState === 1) {
                // Aviso de uma mão
                if(d.hands.left) drawHand(ctx, d.hands.left.x, d.hands.left.y, 'L');
                if(d.hands.right) drawHand(ctx, d.hands.right.x, d.hands.right.y, 'R');
                ctx.fillStyle = "#fff"; ctx.font="bold 20px Arial"; ctx.textAlign="center";
                ctx.fillText("SEGURE O VOLANTE COM AS DUAS MÃOS", cx, h*0.2);
            }
            else if(d.inputState === 2 && d.wheel.opacity > 0.05) {
                // Desenha Volante Completo
                ctx.save();
                ctx.globalAlpha = d.wheel.opacity;
                ctx.translate(d.wheel.x, d.wheel.y);
                ctx.rotate(d.wheel.a);
                const r = d.wheel.r;

                // Sombra 3D
                ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 10;
                
                // Aro
                ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
                ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0,0,r*0.75,0,Math.PI*2); ctx.fill();
                ctx.strokeStyle = '#aaa'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke();
                
                // Detalhes do Volante (Estilo Racing)
                ctx.fillStyle = '#ff3333'; ctx.fillRect(-r*0.1, -r, r*0.2, r*0.25); // Marcador central
                ctx.fillStyle = '#3498db'; // Grips laterais
                ctx.beginPath(); ctx.arc(-r*0.9, 0, r*0.18, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(r*0.9, 0, r*0.18, 0, Math.PI*2); ctx.fill();
                
                // Logo Central
                ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0,0,r*0.22,0,Math.PI*2); ctx.fill();
                ctx.fillStyle = '#000'; ctx.font=`bold ${r*0.15}px Arial`; ctx.textBaseline='middle'; ctx.textAlign='center';
                ctx.fillText("Wii", 0, 2);

                ctx.restore();
            }

            return Math.floor(d.speed); // Retorna score (velocidade) para o sistema
        }
    };

    // Helper: Desenha luva individual
    function drawHand(ctx, x, y, l) {
        ctx.save();
        ctx.shadowColor='#3498db'; ctx.shadowBlur=10;
        ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y,20,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#3498db'; ctx.font="bold 12px Arial"; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(l, x, y);
        ctx.restore();
    }

    // REGISTRO NA ENGINE CENTRAL
    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('drive', 'Otto Kart GP', '🏎️', Logic, {camOpacity: 0.4, showWheel: false});
            clearInterval(regLoop);
        }
    }, 100);
})();