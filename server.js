const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const logoDir = path.join(__dirname, 'public', 'templates', 'logos');
        try {
            await fs.mkdir(logoDir, { recursive: true });
            cb(null, logoDir);
        } catch (error) {
            console.error('Error creating logos directory:', error);
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const team = req.params.team;
        const ext = path.extname(file.originalname);
        cb(null, `${team}_logo${ext}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 2 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PNG, JPG, JPEG, SVG files are allowed'));
        }
    }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/templates', express.static('public/templates'));
app.use('/logos', express.static(path.join(__dirname, 'public', 'templates', 'logos')));

// Явные маршруты для HTML страниц
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/display', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

// API для загрузки логотипа
app.post('/api/upload-logo/:team', (req, res) => {
    const team = req.params.team;
    
    upload.single('logo')(req, res, async (err) => {
        if (err) {
            console.error('Upload error:', err);
            return res.status(400).json({ error: err.message });
        }
        
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }
            
            const ext = path.extname(req.file.filename);
            const logoUrl = `/logos/${team}_logo${ext}`;
            
            if (team === 'home') {
                currentState.homeTeam.logo = logoUrl;
                // Конвертируем логотип в base64 один раз
                currentState.homeTeam.logoBase64 = await imageToBase64(logoUrl);
            } else if (team === 'away') {
                currentState.awayTeam.logo = logoUrl;
                currentState.awayTeam.logoBase64 = await imageToBase64(logoUrl);
            }
            
            broadcastUpdate();
            
            res.json({ success: true, logoUrl: logoUrl });
        } catch (error) {
            console.error('Error processing upload:', error);
            res.status(500).json({ error: 'Failed to process upload' });
        }
    });
});

// API для удаления логотипа
app.delete('/api/delete-logo/:team', async (req, res) => {
    try {
        const team = req.params.team;
        const logoDir = path.join(__dirname, 'public', 'templates', 'logos');
        
        try {
            await fs.access(logoDir);
        } catch (e) {
            return res.json({ success: true });
        }
        
        const files = await fs.readdir(logoDir);
        const logoFile = files.find(f => f.startsWith(`${team}_logo`));
        
        if (logoFile) {
            await fs.unlink(path.join(logoDir, logoFile));
        }
        
        if (team === 'home') {
            currentState.homeTeam.logo = null;
            currentState.homeTeam.logoBase64 = null;
        } else if (team === 'away') {
            currentState.awayTeam.logo = null;
            currentState.awayTeam.logoBase64 = null;
        }
        
        broadcastUpdate();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting logo:', error);
        res.status(500).json({ error: 'Failed to delete logo' });
    }
});

// API для получения текущего табло в SVG
app.get('/api/scoreboard', async (req, res) => {
    try {
        const svg = await generateScoreboardSvg();
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(svg);
    } catch (error) {
        console.error('❌ Error generating scoreboard:', error);
        res.status(500).send('Error generating scoreboard');
    }
});

// Переменные таймера
let gameTimer = null;
let isTimerRunning = false;
let currentMinutes = 0;
let currentSeconds = 0;
let currentHalf = 1;
let isHalftime = false;
let halfDuration = 45;
let additionalTimeFirstHalf = 0;
let additionalTimeSecondHalf = 0;

// Хранилище текущего состояния
let currentState = {
    homeTeam: {
        name: 'КОМАНДА А',
        score: 0,
        color: '#FF0000',
        logo: null,
        logoBase64: null
    },
    awayTeam: {
        name: 'КОМАНДА Б',
        score: 0,
        color: '#0000FF',
        logo: null,
        logoBase64: null
    },
    matchTime: '00:00',
    half: 1,
    halfType: 'first',
    halfText: '1-й тайм',
    halfDuration: 45,
    additionalTimeFirstHalf: 0,
    additionalTimeSecondHalf: 0,
    lastEvent: null,
    activeTitle: null,
    titleVisible: false,
    timerRunning: false
};

// История событий
let eventsHistory = [];

// Кеш шаблонов SVG
let svgTemplates = {};

// Функция форматирования времени
function formatTime(minutes, seconds) {
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Функция обновления текста статуса
function updateHalfText() {
    switch(currentState.halfType) {
        case 'first':
            currentState.halfText = '1-й тайм';
            break;
        case 'second':
            currentState.halfText = '2-й тайм';
            break;
        case 'halftime':
            currentState.halfText = 'ПЕРЕРЫВ';
            break;
        case 'ended':
            currentState.halfText = 'МАТЧ ОКОНЧЕН';
            break;
        default:
            currentState.halfText = '1-й тайм';
    }
}

// Получение текста добавленного времени для отображения
function getAdditionalTimeText() {
    if (currentHalf === 1 && additionalTimeFirstHalf > 0 && currentMinutes >= halfDuration) {
        const extraMinutes = currentMinutes - halfDuration;
        if (extraMinutes > 0) {
            return `+${extraMinutes}'`;
        }
        return `+${additionalTimeFirstHalf}'`;
    } else if (currentHalf === 2 && additionalTimeSecondHalf > 0 && currentMinutes >= (halfDuration * 2)) {
        const extraMinutes = currentMinutes - (halfDuration * 2);
        if (extraMinutes > 0) {
            return `+${extraMinutes}'`;
        }
        return `+${additionalTimeSecondHalf}'`;
    }
    return '';
}

// Функция преобразования изображения в base64 (один раз при загрузке)
async function imageToBase64(imagePath) {
    if (!imagePath) return '';
    try {
        const cleanPath = imagePath.split('?')[0];
        const fullPath = path.join(__dirname, 'public', 'templates', cleanPath);
        
        try {
            await fs.access(fullPath);
        } catch (e) {
            return '';
        }
        
        const imageBuffer = await fs.readFile(fullPath);
        const ext = path.extname(fullPath).toLowerCase();
        let mimeType = 'image/png';
        
        if (ext === '.svg') {
            mimeType = 'image/svg+xml';
        } else if (ext === '.jpg' || ext === '.jpeg') {
            mimeType = 'image/jpeg';
        } else if (ext === '.png') {
            mimeType = 'image/png';
        } else if (ext === '.gif') {
            mimeType = 'image/gif';
        }
        
        const base64 = imageBuffer.toString('base64');
        console.log(`✅ Logo converted to base64: ${cleanPath}`);
        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        console.error(`❌ Error converting image to base64: ${imagePath}`, error.message);
        return '';
    }
}

// Генерация SVG для табло (используем кэшированные base64)
async function generateScoreboardSvg() {
    let template = svgTemplates['scoreboard'];
    
    if (!template) {
        return `<svg width="800" height="200" xmlns="http://www.w3.org/2000/svg">
            <rect width="800" height="200" fill="#333" rx="10"/>
            <text x="400" y="110" text-anchor="middle" fill="red" font-size="20">Ошибка: шаблон табло не загружен</text>
        </svg>`;
    }
    
    let result = template;
    const displayTime = formatTime(currentMinutes, currentSeconds);
    const additionalText = getAdditionalTimeText();
    
    // Используем уже сконвертированные base64 логотипы
    const homeLogoBase64 = currentState.homeTeam.logoBase64 || '';
    const awayLogoBase64 = currentState.awayTeam.logoBase64 || '';
    
    const replacements = {
        '{{homeTeamName}}': currentState.homeTeam.name,
        '{{awayTeamName}}': currentState.awayTeam.name,
        '{{homeTeamScore}}': currentState.homeTeam.score,
        '{{awayTeamScore}}': currentState.awayTeam.score,
        '{{homeTeamColor}}': currentState.homeTeam.color,
        '{{awayTeamColor}}': currentState.awayTeam.color,
        '{{homeTeamLogo}}': homeLogoBase64,
        '{{awayTeamLogo}}': awayLogoBase64,
        '{{matchTime}}': displayTime,
        '{{additionalTimeText}}': additionalText,
        '{{halfText}}': currentState.halfText,
        '{{halfType}}': currentState.halfType
    };
    
    for (const [key, value] of Object.entries(replacements)) {
        result = result.replace(new RegExp(key, 'g'), value);
    }
    
    return result;
}

// Функция обновления времени
function updateTimer() {
    if (!isTimerRunning) return;
    
    currentSeconds++;
    
    if (currentSeconds >= 60) {
        currentSeconds = 0;
        currentMinutes++;
    }
    
    let maxMinutes = 0;
    
    if (currentHalf === 1) {
        maxMinutes = halfDuration + additionalTimeFirstHalf;
    } else if (currentHalf === 2) {
        maxMinutes = (halfDuration * 2) + additionalTimeSecondHalf;
    }
    
    if (currentMinutes >= maxMinutes) {
        if (currentHalf === 1) {
            stopTimer();
            isHalftime = true;
            currentState.halfType = 'halftime';
            currentState.matchTime = formatTime(maxMinutes, 0);
            updateHalfText();
            addEvent('halfEnd', { half: 1, message: `Конец первого тайма (+${additionalTimeFirstHalf}')` });
            console.log('⏹️ First half ended');
        } else if (currentHalf === 2) {
            stopTimer();
            currentState.halfType = 'ended';
            currentState.matchTime = formatTime(maxMinutes, 0);
            updateHalfText();
            addEvent('matchEnd', { message: `Конец матча (+${additionalTimeFirstHalf}' +${additionalTimeSecondHalf}')` });
            console.log('🏁 Match ended');
        }
    } else {
        currentState.matchTime = formatTime(currentMinutes, currentSeconds);
    }
    
    broadcastUpdate();
}

// Запуск таймера
function startTimer() {
    if (isTimerRunning) return;
    if (currentState.halfType === 'ended') return;
    if (currentState.halfType === 'halftime') return;
    
    isTimerRunning = true;
    currentState.timerRunning = true;
    
    if (gameTimer) clearInterval(gameTimer);
    gameTimer = setInterval(updateTimer, 1000);
    
    console.log('✅ Timer started');
    broadcastUpdate();
}

// Остановка таймера
function stopTimer() {
    if (!isTimerRunning) return;
    
    isTimerRunning = false;
    currentState.timerRunning = false;
    
    if (gameTimer) {
        clearInterval(gameTimer);
        gameTimer = null;
    }
    
    console.log('⏸️ Timer stopped');
    broadcastUpdate();
}

// Сброс таймера
function resetTimer() {
    stopTimer();
    currentMinutes = 0;
    currentSeconds = 0;
    currentHalf = 1;
    isHalftime = false;
    currentState.matchTime = '00:00';
    currentState.half = 1;
    currentState.halfType = 'first';
    currentState.timerRunning = false;
    updateHalfText();
    console.log('🔄 Timer reset');
    broadcastUpdate();
}

// Переключение тайма
function switchHalf() {
    if (currentState.halfType === 'ended') return;
    
    if (currentState.halfType === 'first') {
        stopTimer();
        currentState.halfType = 'halftime';
        const firstHalfEnd = halfDuration + additionalTimeFirstHalf;
        currentState.matchTime = formatTime(firstHalfEnd, 0);
        currentMinutes = firstHalfEnd;
        currentSeconds = 0;
        updateHalfText();
        addEvent('halfEnd', { half: 1, message: `Конец первого тайма (+${additionalTimeFirstHalf}')` });
        console.log('Switched to halftime');
    } else if (currentState.halfType === 'halftime') {
        currentHalf = 2;
        isHalftime = false;
        currentMinutes = halfDuration;
        currentSeconds = 0;
        currentState.matchTime = formatTime(currentMinutes, currentSeconds);
        currentState.half = 2;
        currentState.halfType = 'second';
        updateHalfText();
        addEvent('halfStart', { half: 2, message: 'Начало второго тайма' });
        console.log(`Switched to second half, starting at ${currentState.matchTime}`);
    } else if (currentState.halfType === 'second') {
        stopTimer();
        currentState.halfType = 'ended';
        const secondHalfEnd = (halfDuration * 2) + additionalTimeSecondHalf;
        currentState.matchTime = formatTime(secondHalfEnd, 0);
        updateHalfText();
        addEvent('matchEnd', { message: `Конец матча (+${additionalTimeFirstHalf}' +${additionalTimeSecondHalf}')` });
        console.log('Switched to ended');
    }
    
    broadcastUpdate();
}

// Загрузка SVG шаблонов
async function loadSvgTemplates() {
    const templateNames = ['scoreboard', 'goal', 'yellow-card', 'red-card', 'substitution'];
    
    for (const name of templateNames) {
        try {
            const svgPath = path.join(__dirname, 'public', 'templates', `${name}.svg`);
            const svgContent = await fs.readFile(svgPath, 'utf-8');
            svgTemplates[name] = svgContent;
            console.log(`✅ Loaded template: ${name}.svg`);
        } catch (error) {
            console.error(`❌ Error loading template ${name}.svg:`, error.message);
            svgTemplates[name] = null;
        }
    }
}

// Генерация SVG для событий
async function generateEventSvg(titleType, data) {
    let template = svgTemplates[titleType];
    
    if (!template) {
        return `<svg width="600" height="100" xmlns="http://www.w3.org/2000/svg">
            <rect width="600" height="100" fill="#f44336" rx="10"/>
            <text x="300" y="55" text-anchor="middle" fill="white" font-size="20">Ошибка: шаблон ${titleType}.svg не загружен</text>
        </svg>`;
    }
    
    let result = template;
    let matchStatusForTitle = `${currentState.matchTime} • ${currentState.halfText}`;
    
    const replacements = {
        '{{player}}': data.player || '',
        '{{playerOut}}': data.playerOut || data.player || '',
        '{{playerIn}}': data.playerIn || '',
        '{{minute}}': data.minute || currentState.matchTime.split(':')[0],
        '{{matchTime}}': currentState.matchTime,
        '{{matchStatus}}': matchStatusForTitle,
        '{{halfText}}': currentState.halfText,
        '{{homeTeamName}}': currentState.homeTeam.name,
        '{{awayTeamName}}': currentState.awayTeam.name,
        '{{homeTeamScore}}': currentState.homeTeam.score,
        '{{awayTeamScore}}': currentState.awayTeam.score,
        '{{homeTeamColor}}': currentState.homeTeam.color,
        '{{awayTeamColor}}': currentState.awayTeam.color,
        '{{homeTeamLogo}}': currentState.homeTeam.logoBase64 || '',
        '{{awayTeamLogo}}': currentState.awayTeam.logoBase64 || ''
    };
    
    for (const [key, value] of Object.entries(replacements)) {
        result = result.replace(new RegExp(key, 'g'), value);
    }
    
    return result;
}

// Обновление всех клиентов
function broadcastUpdate() {
    io.emit('stateUpdate', currentState);
    io.emit('historyUpdate', eventsHistory);
}

// Добавление события
function addEvent(eventType, data) {
    const event = {
        id: Date.now(),
        type: eventType,
        data: data,
        timestamp: new Date().toLocaleTimeString('ru-RU')
    };
    
    eventsHistory.unshift(event);
    if (eventsHistory.length > 50) eventsHistory.pop();
    
    broadcastUpdate();
}

// Загрузка существующих логотипов при старте
async function loadExistingLogos() {
    const logoDir = path.join(__dirname, 'public', 'templates', 'logos');
    
    try {
        await fs.mkdir(logoDir, { recursive: true });
        const files = await fs.readdir(logoDir);
        
        const homeLogo = files.find(f => f.startsWith('home_logo'));
        const awayLogo = files.find(f => f.startsWith('away_logo'));
        
        if (homeLogo) {
            currentState.homeTeam.logo = `/logos/${homeLogo}`;
            currentState.homeTeam.logoBase64 = await imageToBase64(`/logos/${homeLogo}`);
            console.log(`🖼️ Loaded home logo: ${homeLogo}`);
        }
        if (awayLogo) {
            currentState.awayTeam.logo = `/logos/${awayLogo}`;
            currentState.awayTeam.logoBase64 = await imageToBase64(`/logos/${awayLogo}`);
            console.log(`🖼️ Loaded away logo: ${awayLogo}`);
        }
    } catch (error) {
        console.log('📁 No logos directory yet');
    }
}

// Socket.IO обработчики
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    
    socket.emit('stateUpdate', currentState);
    socket.emit('historyUpdate', eventsHistory);
    
    socket.on('requestState', () => {
        socket.emit('stateUpdate', currentState);
        socket.emit('historyUpdate', eventsHistory);
    });
    
    socket.on('updateScore', (data) => {
        if (data.homeTeam !== undefined) currentState.homeTeam.score = data.homeTeam;
        if (data.awayTeam !== undefined) currentState.awayTeam.score = data.awayTeam;
        addEvent('scoreUpdate', currentState);
    });
    
    socket.on('updateTeamNames', (data) => {
        if (data.homeName) currentState.homeTeam.name = data.homeName;
        if (data.awayName) currentState.awayTeam.name = data.awayName;
        broadcastUpdate();
    });
    
    socket.on('updateTeamColors', (data) => {
        if (data.homeColor) currentState.homeTeam.color = data.homeColor;
        if (data.awayColor) currentState.awayTeam.color = data.awayColor;
        broadcastUpdate();
    });
    
    socket.on('updateHalfDuration', (data) => {
        if (data.duration && data.duration >= 1 && data.duration <= 60) {
            halfDuration = data.duration;
            currentState.halfDuration = halfDuration;
            broadcastUpdate();
        }
    });
    
    socket.on('updateAdditionalTime', (data) => {
        const wasRunning = isTimerRunning;
        if (wasRunning) stopTimer();
        
        if (data.firstHalf !== undefined) {
            additionalTimeFirstHalf = Math.min(Math.max(parseInt(data.firstHalf) || 0, 0), 15);
            currentState.additionalTimeFirstHalf = additionalTimeFirstHalf;
            addEvent('additionalTimeSet', { half: 1, time: additionalTimeFirstHalf });
        }
        
        if (data.secondHalf !== undefined) {
            additionalTimeSecondHalf = Math.min(Math.max(parseInt(data.secondHalf) || 0, 0), 15);
            currentState.additionalTimeSecondHalf = additionalTimeSecondHalf;
            addEvent('additionalTimeSet', { half: 2, time: additionalTimeSecondHalf });
        }
        
        if (wasRunning && currentState.halfType !== 'halftime' && currentState.halfType !== 'ended') {
            startTimer();
        }
        
        broadcastUpdate();
    });
    
    socket.on('updateTime', (data) => {
        if (data.time) {
            const [minutes, seconds] = data.time.split(':');
            currentMinutes = parseInt(minutes) || 0;
            currentSeconds = parseInt(seconds) || 0;
            currentState.matchTime = formatTime(currentMinutes, currentSeconds);
        }
        
        if (data.half) {
            switch(data.half) {
                case '1':
                    currentState.halfType = 'first';
                    currentHalf = 1;
                    isHalftime = false;
                    currentState.half = 1;
                    stopTimer();
                    break;
                case '2':
                    currentState.halfType = 'second';
                    currentHalf = 2;
                    isHalftime = false;
                    currentState.half = 2;
                    stopTimer();
                    break;
                case 'ht':
                    currentState.halfType = 'halftime';
                    isHalftime = true;
                    stopTimer();
                    break;
                case 'ft':
                    currentState.halfType = 'ended';
                    stopTimer();
                    break;
            }
            updateHalfText();
        }
        
        broadcastUpdate();
    });
    
    socket.on('startTimer', () => startTimer());
    socket.on('stopTimer', () => stopTimer());
    socket.on('resetTimer', () => resetTimer());
    socket.on('switchHalf', () => switchHalf());
    
    socket.on('showTitle', async (data) => {
        const { type, eventData } = data;
        
        if (!eventData.minute && currentState.matchTime !== '00:00') {
            eventData.minute = currentState.matchTime.split(':')[0];
        }
        
        const svg = await generateEventSvg(type, eventData);
        
        if (svg) {
            currentState.activeTitle = { type, svg, data: eventData };
            currentState.titleVisible = true;
            addEvent(type, eventData);
            
            setTimeout(() => {
                if (currentState.activeTitle?.type === type && currentState.titleVisible) {
                    currentState.titleVisible = false;
                    currentState.activeTitle = null;
                    broadcastUpdate();
                }
            }, 5000);
        }
    });
    
    socket.on('hideTitle', () => {
        currentState.titleVisible = false;
        currentState.activeTitle = null;
        broadcastUpdate();
    });
    
    socket.on('hideScoreboard', () => {
        io.emit('hideScoreboard');
    });
    
    socket.on('resetMatch', () => {
        resetTimer();
        currentState.homeTeam.score = 0;
        currentState.awayTeam.score = 0;
        currentState.activeTitle = null;
        currentState.titleVisible = false;
        additionalTimeFirstHalf = 0;
        additionalTimeSecondHalf = 0;
        currentState.additionalTimeFirstHalf = 0;
        currentState.additionalTimeSecondHalf = 0;
        halfDuration = 45;
        currentState.halfDuration = 45;
        eventsHistory = [];
        updateHalfText();
        broadcastUpdate();
    });
    
    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;

async function startServer() {
    updateHalfText();
    await loadExistingLogos();
    await loadSvgTemplates();
    
    server.listen(PORT, () => {
        console.log('\n' + '='.repeat(50));
        console.log('🚀 FOOTBALL TITLES SERVER');
        console.log('='.repeat(50));
        console.log(`📺 Control panel: http://localhost:${PORT}`);
        console.log(`🎬 Display URL: http://localhost:${PORT}/display`);
        console.log(`📊 Scoreboard SVG API: http://localhost:${PORT}/api/scoreboard`);
        console.log('='.repeat(50));
        console.log('✅ Server ready!');
        console.log(`📊 Current status: ${currentState.halfText} - Time: ${currentState.matchTime}`);
        console.log(`⏱️ Half duration: ${halfDuration} minutes`);
        console.log(`🎨 Home color: ${currentState.homeTeam.color}, Away color: ${currentState.awayTeam.color}`);
        console.log(`🖼️ Home logo: ${currentState.homeTeam.logo || 'not set'}`);
        console.log(`🖼️ Away logo: ${currentState.awayTeam.logo || 'not set'}`);
        console.log(`⏱️ Additional time: 1st half +${additionalTimeFirstHalf}', 2nd half +${additionalTimeSecondHalf}'\n`);
    });
}

startServer();