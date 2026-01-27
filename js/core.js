/**
 * =============================================================================
 * CORE DO SISTEMA (KERNEL) - OTTO KERNEL v11.0
 * =============================================================================
 * - Gestão de Pose Detection (TensorFlow MoveNet)
 * - Gráficos Globais e Shake de Ecrã
 * - Sistema de Áudio Oscilador
 * - Registo e Execução de Jogos Dinâmicos
 * =============================================================================
 */

window.Sfx = {
    ctx: null,
    init: function() {
        if(this.ctx) return;
        window.AudioContext = window.AudioContext || window.webkitAudioContext; 
        this.ctx = new AudioContext(); 
    },
    play: function(freq, type, dur, vol=0.1) {
        if(!this.ctx) return;
        const osc = this.ctx.createOscillator(); 
        const gain = this.ctx.createGain();
        osc.type = type; 
        osc.frequency.value = freq; 
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        osc.connect(gain); 
        gain.connect(this.ctx.destination); 
        osc.start(); 
        osc.stop(this.ctx.currentTime + dur);
    },
    click: function() { this.play(800, 'sine', 0.1, 0.1); },
    coin: function() { 
        this.play(1500, 'square', 0.1, 0.05); 
        setTimeout(() => this.play(2000, 'square', 0.1, 0.05), 80); 
    },
    crash: function() { 
        this.play(60, 'sawtooth', 0.5, 0.4); 
        this.play(40, 'square', 0.6, 0.4); 
    },
    hit: function() { this.play(200, 'triangle', 0.15, 0.2); }
};

window.Gfx = {
    shakeAmt: 0,
    // Mapeamento de coordenadas MoveNet (640x480) para o Canvas dinâmico
    map: function(p, w, h) { 
        return { x: w - (p.x / 640 * w), y: p.y / 480 * h }; 
    },
    shake: function(amt) { this.shakeAmt = amt; },
    updateShake: function(ctx) {
        if(this.shakeAmt > 0) {
            const dx = (Math.random() - 0.5) * this.shakeAmt;
            const dy = (Math.random() - 0.5) * this.shakeAmt;
            ctx.translate(dx, dy);
            this.shakeAmt *= 0.9;
        }
    },
    drawSkeleton: function(ctx, pose, w, h) {
        if(!pose) return;
        const kp = pose.keypoints;
        ctx.strokeStyle = '#00ff00'; 
        ctx.lineWidth = 2;
        const drawL = (a, b) => {
            const p1 = kp.find(k => k.name === a), p2 = kp.find(k => k.name === b);
            if(p1 && p2 && p1.score > 0.3 && p2.score > 0.3) {
                const m1 = this.map(p1, w, h), m2 = this.map(p2, w, h);
                ctx.beginPath(); 
                ctx.moveTo(m1.x, m1.y); 
                ctx.lineTo(m2.x, m2.y); 
                ctx.stroke();
            }
        };
        drawL('left_shoulder', 'right_shoulder');
        drawL('left_shoulder', 'left_elbow'); 
        drawL('left_elbow', 'left_wrist');
        drawL('right_shoulder', 'right_elbow'); 
        drawL('right_elbow', 'right_wrist');
    }
};

window.System = {
    video: null, 
    canvas: null, 
    ctx: null, 
    detector: null,
    activeGame: null, 
    loopId: null, 
    sens: 1.0, 
    games: {},

    registerGame: function(id, name, icon, logic, settings) {
        this.games[id] = { name, icon, logic, settings };
        console.log(`[CORE] Jogo Registrado: ${name}`);
    },

    boot: async function() {
        const log = document.getElementById('boot-log');
        log.innerText = "A detectar hardware...";
        window.Sfx.init();
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 640, height: 480 },
                audio: false
            });
            
            this.video = document.getElementById('video-source');
            this.video.srcObject = stream;
            document.getElementById('webcam').srcObject = stream;
            
            await new Promise(r => this.video.onloadedmetadata = r);
            this.video.play(); 
            document.getElementById('webcam').play();

            document.getElementById('screen-safety').classList.add('hidden');
            document.getElementById('screen-load').classList.remove('hidden');

            log.innerText = "A carregar modelos de IA...";
            await tf.setBackend('webgl');
            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
            );

            this.canvas = document.getElementById('game-canvas');
            this.ctx = this.canvas.getContext('2d');
            this.resize();

            document.getElementById('screen-load').classList.add('hidden');
            this.renderMenu();
            this.menu();
            
            window.Sfx.play(1000, 'sine', 0.2, 0.1);
        } catch(e) { 
            alert("Erro fatal: " + e.message + "\n\nO thIAguinho Wii precisa de acesso à câmara."); 
        }
    },

    renderMenu: function() {
        const grid = document.getElementById('channel-grid'); 
        grid.innerHTML = '';
        Object.keys(this.games).forEach(id => {
            const g = this.games[id];
            const div = document.createElement('div');
            div.className = 'channel';
            div.innerHTML = `<div class="channel-icon">${g.icon}</div><div class="channel-name">${g.name}</div>`;
            div.onclick = () => this.launch(id);
            grid.appendChild(div);
        });
        
        // Preenche espaços vazios estilo Wii
        for(let i = 0; i < (12 - Object.keys(this.games).length); i++) {
            const empty = document.createElement('div'); 
            empty.className = 'channel channel-empty';
            grid.appendChild(empty);
        }
    },

    menu: function() {
        this.stop();
        document.getElementById('screen-menu').classList.remove('hidden');
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.add('hidden');
        document.getElementById('webcam').style.opacity = '0';
    },

    launch: function(id) {
        window.Sfx.click();
        const g = this.games[id];
        this.activeGame = g;
        
        document.getElementById('screen-menu').classList.add('hidden');
        document.getElementById('game-ui').classList.remove('hidden');
        document.getElementById('webcam').style.opacity = g.settings.camOpacity;
        
        g.logic.init();
        this.loop();
    },

    loop: async function() {
        if(!this.activeGame) return;
        
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        let pose = null;

        try {
            const poses = await this.detector.estimatePoses(this.video, { flipHorizontal: false });
            if(poses.length > 0) pose = poses[poses[0].score > 0.2 ? 0 : null];
        } catch(e) {}

        ctx.clearRect(0, 0, w, h);
        ctx.save();
        window.Gfx.updateShake(ctx);
        
        // A lógica do jogo processa a pose e retorna a pontuação para o HUD
        const score = this.activeGame.logic.update(ctx, w, h, pose);
        ctx.restore();

        document.getElementById('hud-score').innerText = Math.floor(score);
        this.loopId = requestAnimationFrame(() => this.loop());
    },

    stop: function() { 
        if(this.loopId) cancelAnimationFrame(this.loopId); 
        this.activeGame = null; 
    },

    gameOver: function(score) {
        this.stop(); 
        window.Sfx.crash();
        document.getElementById('final-score').innerText = Math.floor(score);
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.remove('hidden');
    },

    home: function() { 
        window.Sfx.click(); 
        this.menu(); 
    },
    
    msg: function(text) {
        const el = document.getElementById('game-msg');
        el.innerText = text; 
        el.classList.add('pop');
        setTimeout(() => el.classList.remove('pop'), 1500);
    },
    
    resize: function() {
        if(this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    },
    
    setSens: function(v) { 
        this.sens = parseFloat(v); 
    }
};

window.addEventListener('resize', () => window.System.resize());