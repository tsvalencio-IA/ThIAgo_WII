/**
 * ARQUIVO: js/game_kart.js
 * CORREÇÃO: Oráculo Dev Sênior
 * * Correções aplicadas:
 * 1. Desacoplamento do Loop de Renderização da Detecção de Pose (Evita travamentos).
 * 2. Limpeza de elementos de UI (Botão Nitro) ao sair/trocar de jogo.
 * 3. Ajuste de Hitbox e Física de colisão.
 */

(function() {
    // --- Configurações do Jogo ---
    const CONF = {
        segmentLength: 200, // Comprimento de cada segmento da pista
        rumbleLength: 3,    // Frequência das zebras
        roadWidth: 2000,    // Largura da pista (lógica)
        lanes: 3,           // Faixas
        fieldOfView: 100,   // Campo de visão
        cameraHeight: 1000, // Altura da câmera
        cameraDepth: 0.84,  // Profundidade da câmera
        drawDistance: 300,  // Quantos segmentos desenhar
        maxSpeed: 12000,    // Velocidade máxima
        accel: 30,          // Aceleração
        breaking: -80,      // Freio
        decel: -15,         // Desaceleração natural
        offRoadDecel: -130, // Desaceleração fora da pista
        offRoadLimit: 2000, // Velocidade máx fora da pista
        centrifugal: 0.3    // Força centrífuga nas curvas
    };

    // --- Estado do Jogo ---
    let width, height, canvas, ctx;
    let segments = [];
    let cars = []; // Oponentes
    let playerX = 0; // Posição X do jogador (-1 a 1)
    let position = 0; // Posição Z na pista
    let speed = 0;    // Velocidade atual
    let playerZ = null;
    let trackLength = null;
    let nitroButton = null;
    let isNitro = false;
    let nitroFuel = 100;
    let animationFrameId = null;
    let lastTime = 0;

    // Elementos DOM
    const divNitroId = "btn-nitro-overlay";

    // Cores
    const COLORS = {
        SKY: '#72D7EE',
        TREE: '#005108',
        FOG: '#005108',
        LIGHT: { road: '#6B6B6B', grass: '#10AA10', rumble: '#555555', lane: '#CCCCCC' },
        DARK:  { road: '#696969', grass: '#009A00', rumble: '#BBBBBB' },
        START: { road: '#FFF',    grass: '#FFF',    rumble: '#FFF'    },
        FINISH:{ road: '#000',    grass: '#000',    rumble: '#000'    }
    };

    // --- Funções Utilitárias Matemáticas ---
    const Util = {
        project: function(p, cameraX, cameraY, cameraZ, cameraDepth, width, height, roadWidth) {
            p.camera.x = (p.world.x || 0) - cameraX;
            p.camera.y = (p.world.y || 0) - cameraY;
            p.camera.z = (p.world.z || 0) - cameraZ;
            p.screen.scale = cameraDepth / p.camera.z;
            p.screen.x = Math.round((width / 2) + (p.screen.scale * p.camera.x * width / 2));
            p.screen.y = Math.round((height / 2) - (p.screen.scale * p.camera.y * height / 2));
            p.screen.w = Math.round(p.screen.scale * roadWidth * width / 2);
        },
        overlap: function(x1, w1, x2, w2, percent) {
            const half = (percent || 1) / 2;
            const min1 = x1 - (w1 * half);
            const max1 = x1 + (w1 * half);
            const min2 = x2 - (w2 * half);
            const max2 = x2 + (w2 * half);
            return !((max1 < min2) || (min1 > max2));
        },
        easeIn: (a, b, percent) => a + (b - a) * Math.pow(percent, 2),
        easeInOut: (a, b, percent) => a + (b - a) * ((-Math.cos(percent * Math.PI) / 2) + 0.5),
        increase: (start, increment, max) => {
            let result = start + increment;
            while (result >= max) result -= max;
            while (result < 0) result += max;
            return result;
        },
        accelerate: (v, accel, dt) => v + (accel * dt * 60),
        limit: (value, min, max) => Math.max(min, Math.min(value, max))
    };

    // --- Geração da Pista ---
    function resetRoad() {
        segments = [];
        const addSegment = (curve, y) => {
            const n = segments.length;
            segments.push({
                index: n,
                p1: { world: { y: lastY, z: n * CONF.segmentLength }, camera: {}, screen: {} },
                p2: { world: { y: y, z: (n + 1) * CONF.segmentLength }, camera: {}, screen: {} },
                curve: curve,
                sprites: [],
                cars: [],
                color: Math.floor(n / CONF.rumbleLength) % 2 ? COLORS.DARK : COLORS.LIGHT
            });
            lastY = y;
        };

        const addRoad = (enter, hold, leave, curve, y) => {
            const startY = lastY;
            const endY = startY + (y * CONF.segmentLength);
            const total = enter + hold + leave;
            for(let n = 0; n < enter; n++) addSegment(Util.easeIn(0, curve, n/enter), Util.easeInOut(startY, endY, n/total));
            for(let n = 0; n < hold;  n++) addSegment(curve, Util.easeInOut(startY, endY, (enter+n)/total));
            for(let n = 0; n < leave; n++) addSegment(Util.easeInOut(curve, 0, n/leave), Util.easeInOut(startY, endY, (enter+hold+n)/total));
        };

        let lastY = 0;
        // Desenho da Pista
        addRoad(50, 50, 50, 0, 0);       // Reta Inicial
        addRoad(50, 50, 50, -2, 0);      // Esquerda
        addRoad(50, 50, 50, 2, 40);      // Direita e Subida
        addRoad(50, 50, 50, -4, -40);    // Esquerda Forte e Descida
        addRoad(100, 100, 100, 3, 20);   // Curva longa
        addRoad(50, 50, 50, 0, 0);       // Reta Final

        // Adicionar sprites (árvores, pedras) aqui futuramente
        trackLength = segments.length * CONF.segmentLength;
        
        // Adicionar Oponentes
        resetCars();
    }

    function resetCars() {
        cars = [];
        for(let n = 0; n < 20; n++) {
            const offset = Math.random() * Util.increase(0, trackLength, trackLength);
            const z = Util.increase(position, offset, trackLength); // Espalhar pela pista
            const sprite = { offset: Math.random() * 0.8 - 0.4, z: z, speed: 6000 + Math.random() * 4000 };
            const segment = findSegment(z);
            segment.cars.push(sprite);
            cars.push(sprite);
        }
    }

    function findSegment(z) {
        return segments[Math.floor(z / CONF.segmentLength) % segments.length];
    }

    // --- Lógica Principal ---
    
    // Iniciar Jogo
    window.StartKartGame = function(canvasElement) {
        canvas = canvasElement;
        ctx = canvas.getContext('2d', { alpha: false });
        width = canvas.width;
        height = canvas.height;
        
        // Limpar qualquer lixo anterior
        cleanupUI();
        createNitroButton();

        resetRoad();
        playerZ = CONF.cameraHeight * CONF.cameraDepth;
        lastTime = performance.now();
        
        // Iniciar Loop
        animationFrameId = requestAnimationFrame(gameLoop);
    };

    // Parar Jogo (Chamado pelo Core ao sair)
    window.StopKartGame = function() {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        cleanupUI();
    };

    function cleanupUI() {
        const existingBtn = document.getElementById(divNitroId);
        if (existingBtn) existingBtn.remove();
    }

    function createNitroButton() {
        nitroButton = document.createElement("div");
        nitroButton.id = divNitroId;
        nitroButton.style.position = "absolute";
        nitroButton.style.bottom = "50px";
        nitroButton.style.right = "20px";
        nitroButton.style.width = "80px";
        nitroButton.style.height = "80px";
        nitroButton.style.borderRadius = "50%";
        nitroButton.style.backgroundColor = "rgba(255, 0, 0, 0.5)";
        nitroButton.style.border = "2px solid white";
        nitroButton.style.display = "flex";
        nitroButton.style.alignItems = "center";
        nitroButton.style.justifyContent = "center";
        nitroButton.style.color = "white";
        nitroButton.style.fontWeight = "bold";
        nitroButton.style.fontFamily = "Arial, sans-serif";
        nitroButton.style.fontSize = "14px";
        nitroButton.innerText = "NITRO";
        nitroButton.style.zIndex = "1000";
        nitroButton.style.userSelect = "none";
        
        // Eventos Touch/Click
        const activateNitro = (e) => { e.preventDefault(); isNitro = true; nitroButton.style.backgroundColor = "rgba(255, 50, 0, 0.8)"; };
        const deactivateNitro = (e) => { e.preventDefault(); isNitro = false; nitroButton.style.backgroundColor = "rgba(255, 0, 0, 0.5)"; };

        nitroButton.addEventListener("mousedown", activateNitro);
        nitroButton.addEventListener("touchstart", activateNitro);
        nitroButton.addEventListener("mouseup", deactivateNitro);
        nitroButton.addEventListener("touchend", deactivateNitro);

        document.body.appendChild(nitroButton);
    }

    // --- Loop de Jogo Robusto ---
    function gameLoop(now) {
        const dt = Math.min(1, (now - lastTime) / 1000);
        lastTime = now;

        update(dt);
        render();

        animationFrameId = requestAnimationFrame(gameLoop);
    }

    function update(dt) {
        // --- INPUT VIA POSE (COM SEGURANÇA) ---
        // Se 'window.pose' não existir, usamos valores neutros para não travar o jogo.
        
        let steerInput = 0;
        
        if (window.pose && window.pose.keypoints) {
            // Lógica de direção baseada no nariz ou pulsos
            const nose = window.pose.keypoints.find(k => k.name === 'nose');
            if (nose && nose.score > 0.5) {
                // Mapeia posição do nariz na tela (0 a 640/videoWidth) para -1 a 1
                // Assumindo que o vídeo tem aspect ratio padrão
                const normalizedX = (nose.x / 640) * 2 - 1; 
                // Inverter se necessário (espelho)
                steerInput = normalizedX * 1.5; // Sensibilidade
            }
        }
        
        // --- FÍSICA ---
        position = Util.increase(position, dt * speed, trackLength);
        
        // Variação da velocidade baseada no input (aceleração automática + nitro)
        let targetAccel = CONF.accel;
        if (isNitro && nitroFuel > 0) {
            targetAccel *= 3;
            nitroFuel -= dt * 10;
        }
        
        // Se a velocidade estiver alta, aplicamos deslocamento lateral
        const dx = dt * 2 * (speed / CONF.maxSpeed);
        
        // Aplicar Input de Direção
        playerX = playerX - (dx * steerInput);
        
        // Força Centrífuga (Jogar para fora na curva)
        const playerSegment = findSegment(position + playerZ);
        playerX = playerX - (dx * speed / CONF.maxSpeed * playerSegment.curve * CONF.centrifugal);
        
        // Aceleração e Atrito
        if (speed > 0) {
            speed = Util.accelerate(speed, targetAccel, dt); // Aceleração constante (estilo endless runner)
        } else {
            speed = Util.accelerate(speed, CONF.accel, dt); // Start
        }

        // Off-road (Sair da pista)
        if ((playerX < -1) || (playerX > 1)) {
            if (speed > CONF.offRoadLimit)
                speed = Util.accelerate(speed, CONF.offRoadDecel, dt);
        }

        // Limites
        playerX = Util.limit(playerX, -2, 2);
        speed = Util.limit(speed, 0, CONF.maxSpeed);
        
        // Atualizar Oponentes (IA Simples)
        updateCars(dt, playerSegment);
    }

    function updateCars(dt, playerSegment) {
        for(let n = 0; n < cars.length; n++) {
            const car = cars[n];
            // Mover carro na pista
            const oldSeg = findSegment(car.z);
            car.z = Util.increase(car.z, dt * car.speed, trackLength);
            const newSeg = findSegment(car.z);
            
            // Transferir carro de segmento se ele mudou
            if (oldSeg.index !== newSeg.index) {
                const index = oldSeg.cars.indexOf(car);
                oldSeg.cars.splice(index, 1);
                newSeg.cars.push(car);
            }
            
            // Colisão simples com jogador (Bounding Box)
            // Se o carro está no mesmo segmento (ou muito próximo) e no mesmo X
            if (Util.overlap(playerX, 0.6, car.offset, 0.6, 1.0)) { // Larguras hardcoded para teste
                const distZ = Math.abs(position - car.z);
                if (distZ < 500) { // Muito perto em Z
                    speed = speed * 0.5; // Batida reduz velocidade
                    // Efeito sonoro ou visual aqui
                }
            }
        }
    }

    // --- RENDERIZAÇÃO ---
    function render() {
        ctx.clearRect(0, 0, width, height);

        // Renderiza Fundo (Céu e Terra Simples)
        ctx.fillStyle = COLORS.SKY;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = COLORS.TREE; // Horizonte
        ctx.fillRect(0, height / 2, width, height / 2);

        const baseSegment = findSegment(position);
        const basePercent = (position % CONF.segmentLength) / CONF.segmentLength;
        const playerSegment = findSegment(position + playerZ);
        const playerPercent = (position + playerZ) % CONF.segmentLength / CONF.segmentLength;
        
        let maxy = height;
        let x = 0;
        let dx = -(baseSegment.curve * basePercent);

        // Desenhar Pista (Do fundo para frente - Painter's Algo)
        for(let n = 0; n < CONF.drawDistance; n++) {
            const segment = segments[(baseSegment.index + n) % segments.length];
            segment.looped = segment.index < baseSegment.index;
            segment.fog = 1 - (n / CONF.drawDistance); // Neblina simples
            
            Util.project(segment.p1, (playerX * CONF.roadWidth) - x, CONF.cameraHeight + playerZ, position - (segment.looped ? trackLength : 0), CONF.cameraDepth, width, height, CONF.roadWidth);
            Util.project(segment.p2, (playerX * CONF.roadWidth) - x - dx, CONF.cameraHeight + playerZ, position - (segment.looped ? trackLength : 0), CONF.cameraDepth, width, height, CONF.roadWidth);

            x += dx;
            dx += segment.curve;

            if(segment.p1.camera.z <= CONF.cameraDepth || segment.p2.screen.y >= maxy || segment.p2.screen.y >= segment.p1.screen.y)
                continue;

            renderSegment(segment);
            maxy = segment.p1.screen.y;
        }

        // Desenhar Oponentes (Loop separado de trás pra frente)
        for(let n = (CONF.drawDistance-1); n > 0; n--) {
            const segment = segments[(baseSegment.index + n) % segments.length];
            for(let i = 0; i < segment.cars.length; i++) {
                const car = segment.cars[i];
                const spriteScale = segment.p1.screen.scale;
                const spriteX = segment.p1.screen.x + (spriteScale * car.offset * CONF.roadWidth * width / 2);
                const spriteY = segment.p1.screen.y;
                renderCarSprite(car, spriteX, spriteY, spriteScale);
            }
        }

        // Desenhar Jogador
        renderPlayer();
        
        // HUD Básico
        ctx.fillStyle = "white";
        ctx.font = "20px Arial";
        ctx.fillText("Speed: " + Math.floor(speed/100) + " km/h", 20, 30);
        ctx.fillText("Nitro: " + Math.floor(nitroFuel) + "%", 20, 60);
    }

    function renderSegment(segment) {
        const x1 = segment.p1.screen.x;
        const y1 = segment.p1.screen.y;
        const w1 = segment.p1.screen.w;
        const x2 = segment.p2.screen.x;
        const y2 = segment.p2.screen.y;
        const w2 = segment.p2.screen.w;

        ctx.fillStyle = segment.color.grass;
        ctx.fillRect(0, y2, width, y1 - y2);

        // Zebra
        const r1 = w1 / Math.max(6, 2 * CONF.lanes);
        const r2 = w2 / Math.max(6, 2 * CONF.lanes);
        
        ctx.fillStyle = segment.color.rumble;
        ctx.beginPath();
        ctx.moveTo(x1 - w1 - r1, y1); ctx.lineTo(x1 - w1, y1); ctx.lineTo(x2 - w2, y2); ctx.lineTo(x2 - w2 - r2, y2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x1 + w1 + r1, y1); ctx.lineTo(x1 + w1, y1); ctx.lineTo(x2 + w2, y2); ctx.lineTo(x2 + w2 + r2, y2); ctx.fill();

        // Estrada
        ctx.fillStyle = segment.color.road;
        ctx.beginPath();
        ctx.moveTo(x1 - w1, y1); ctx.lineTo(x1 + w1, y1); ctx.lineTo(x2 + w2, y2); ctx.lineTo(x2 - w2, y2); ctx.fill();
    }

    function renderCarSprite(car, destX, destY, scale) {
        // Renderiza oponente como um retângulo colorido por enquanto (placeholder)
        // Substitua por drawImage se tiver os assets carregados
        const spriteW = 300 * scale * width;
        const spriteH = 150 * scale * width;
        
        ctx.fillStyle = "blue";
        ctx.fillRect(destX - spriteW/2, destY - spriteH, spriteW, spriteH);
    }

    function renderPlayer() {
        // Carro do Jogador (Parte inferior central)
        const scale = 3 * (width / CONF.roadWidth); // Aproximação
        const spriteW = 400 * scale * 0.6; // Ajuste visual
        const spriteH = 200 * scale * 0.6;
        
        const destX = width / 2 - spriteW / 2;
        const destY = height - spriteH - 10;
        
        // Desenho Simples do Carro Vermelho (Estilo Ferrari Outrun)
        ctx.fillStyle = "#CC0000";
        ctx.fillRect(destX, destY + spriteH/2, spriteW, spriteH/2); // Chassi
        ctx.fillStyle = "#990000";
        ctx.fillRect(destX + 10, destY, spriteW - 20, spriteH/2); // Cabine

        // Rodas
        ctx.fillStyle = "black";
        ctx.fillRect(destX - 10, destY + spriteH - 20, 20, 20);
        ctx.fillRect(destX + spriteW - 10, destY + spriteH - 20, 20, 20);

        if (isNitro) {
            // Fogo do nitro
            ctx.fillStyle = "orange";
            ctx.beginPath();
            ctx.arc(destX + spriteW/2, destY + spriteH, 20 + Math.random()*10, 0, Math.PI * 2);
            ctx.fill();
        }
    }

})();