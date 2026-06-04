const socket = io();

// Элементы DOM
const homeNameInput = document.getElementById('homeName');
const awayNameInput = document.getElementById('awayName');
const homeColorPicker = document.getElementById('homeColor');
const awayColorPicker = document.getElementById('awayColor');
const homeColorValue = document.getElementById('homeColorValue');
const awayColorValue = document.getElementById('awayColorValue');
const homeScoreSpan = document.getElementById('homeScore');
const awayScoreSpan = document.getElementById('awayScore');
const halfSelect = document.getElementById('half');
const matchTimeInput = document.getElementById('matchTime');
const halfDurationInput = document.getElementById('halfDuration');
const updateTimeBtn = document.getElementById('updateTimeBtn');
const hideTitleBtn = document.getElementById('hideTitleBtn');
const hideScoreboardBtn = document.getElementById('hideScoreboardBtn');
const resetMatchBtn = document.getElementById('resetMatchBtn');
const eventButtons = document.querySelectorAll('.event-btn');
const eventForm = document.getElementById('eventForm');
const submitEventBtn = document.getElementById('submitEvent');
const cancelEventBtn = document.getElementById('cancelEvent');
const historyList = document.getElementById('historyList');
const connectionStatus = document.getElementById('connectionStatus');

// Кнопки таймера
const startTimerBtn = document.getElementById('startTimerBtn');
const stopTimerBtn = document.getElementById('stopTimerBtn');
const resetTimerBtn = document.getElementById('resetTimerBtn');
const switchHalfBtn = document.getElementById('switchHalfBtn');
const timerDisplay = document.getElementById('timerDisplay');
const halfStatus = document.getElementById('halfStatus');

// Элементы добавленного времени
const additionalTimeFirst = document.getElementById('additionalTimeFirst');
const additionalTimeSecond = document.getElementById('additionalTimeSecond');
const applyAdditionalTimeFirst = document.getElementById('applyAdditionalTimeFirst');
const applyAdditionalTimeSecond = document.getElementById('applyAdditionalTimeSecond');

// Элементы логотипов
const homeLogoInput = document.getElementById('homeLogoInput');
const awayLogoInput = document.getElementById('awayLogoInput');
const homeLogoBtn = document.getElementById('homeLogoBtn');
const awayLogoBtn = document.getElementById('awayLogoBtn');
const homeLogoRemoveBtn = document.getElementById('homeLogoRemoveBtn');
const awayLogoRemoveBtn = document.getElementById('awayLogoRemoveBtn');
const homeLogoPreview = document.getElementById('homeLogoPreview');
const awayLogoPreview = document.getElementById('awayLogoPreview');

let currentEventType = null;

// Флаги блокировки автообновления
let blockAutoUpdateFirst = false;
let blockAutoUpdateSecond = false;
let autoUpdateTimeoutFirst = null;
let autoUpdateTimeoutSecond = null;

function blockAutoUpdateFirstTemporarily() {
    if (autoUpdateTimeoutFirst) clearTimeout(autoUpdateTimeoutFirst);
    blockAutoUpdateFirst = true;
    autoUpdateTimeoutFirst = setTimeout(() => {
        blockAutoUpdateFirst = false;
        autoUpdateTimeoutFirst = null;
    }, 2000);
}

function blockAutoUpdateSecondTemporarily() {
    if (autoUpdateTimeoutSecond) clearTimeout(autoUpdateTimeoutSecond);
    blockAutoUpdateSecond = true;
    autoUpdateTimeoutSecond = setTimeout(() => {
        blockAutoUpdateSecond = false;
        autoUpdateTimeoutSecond = null;
    }, 2000);
}

function updateConnectionStatus(status) {
    if (connectionStatus) {
        connectionStatus.className = 'online-status ' + status;
        switch(status) {
            case 'online':
                connectionStatus.innerHTML = '🟢 Online';
                break;
            case 'offline':
                connectionStatus.innerHTML = '🔴 Offline';
                break;
            case 'reconnecting':
                connectionStatus.innerHTML = '🟡 Reconnecting...';
                break;
        }
    }
}

// Функции для логотипов
async function uploadLogo(team, file) {
    const formData = new FormData();
    formData.append('logo', file);
    
    try {
        const response = await fetch(`/api/upload-logo/${team}`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            if (team === 'home') {
                homeLogoPreview.src = data.logoUrl + '?t=' + Date.now();
            } else {
                awayLogoPreview.src = data.logoUrl + '?t=' + Date.now();
            }
            socket.emit('requestState');
            alert('Логотип успешно загружен');
        } else {
            const error = await response.json();
            alert('Ошибка загрузки логотипа: ' + (error.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Error uploading logo:', error);
        alert('Ошибка загрузки логотипа');
    }
}

async function deleteLogo(team) {
    try {
        const response = await fetch(`/api/delete-logo/${team}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            if (team === 'home') {
                homeLogoPreview.src = '/logos/placeholder.png';
            } else {
                awayLogoPreview.src = '/logos/placeholder.png';
            }
            socket.emit('requestState');
            alert('Логотип удален');
        } else {
            alert('Ошибка удаления логотипа');
        }
    } catch (error) {
        console.error('Error deleting logo:', error);
        alert('Ошибка удаления логотипа');
    }
}

function applyAdditionalTime(half) {
    let value;
    if (half === 'first') {
        value = parseInt(additionalTimeFirst.value) || 0;
        if (value < 0) value = 0;
        if (value > 15) {
            value = 15;
            additionalTimeFirst.value = 15;
            alert('Максимальное добавленное время - 15 минут');
        }
        socket.emit('updateAdditionalTime', { firstHalf: value });
        setTimeout(() => {
            blockAutoUpdateFirst = false;
            if (autoUpdateTimeoutFirst) {
                clearTimeout(autoUpdateTimeoutFirst);
                autoUpdateTimeoutFirst = null;
            }
        }, 1000);
    } else if (half === 'second') {
        value = parseInt(additionalTimeSecond.value) || 0;
        if (value < 0) value = 0;
        if (value > 15) {
            value = 15;
            additionalTimeSecond.value = 15;
            alert('Максимальное добавленное время - 15 минут');
        }
        socket.emit('updateAdditionalTime', { secondHalf: value });
        setTimeout(() => {
            blockAutoUpdateSecond = false;
            if (autoUpdateTimeoutSecond) {
                clearTimeout(autoUpdateTimeoutSecond);
                autoUpdateTimeoutSecond = null;
            }
        }, 1000);
    }
}

function setTimeByHalfStatus(selectedHalf) {
    let newTime = '00:00';
    let currentHalfDuration = halfDurationInput ? parseInt(halfDurationInput.value) : 45;
    let additionalFirst = additionalTimeFirst ? parseInt(additionalTimeFirst.value) : 0;
    let additionalSecond = additionalTimeSecond ? parseInt(additionalTimeSecond.value) : 0;
    
    const firstHalfEnd = currentHalfDuration + additionalFirst;
    const secondHalfEnd = (currentHalfDuration * 2) + additionalSecond;
    
    switch(selectedHalf) {
        case '1':
            newTime = '00:00';
            break;
        case '2':
            newTime = `${String(currentHalfDuration).padStart(2, '0')}:00`;
            break;
        case 'ht':
            newTime = `${String(firstHalfEnd).padStart(2, '0')}:00`;
            break;
        case 'ft':
            newTime = `${String(secondHalfEnd).padStart(2, '0')}:00`;
            break;
    }
    
    if (matchTimeInput) matchTimeInput.value = newTime;
    return newTime;
}

// Обработчики событий
function initScoreButtons() {
    document.querySelectorAll('.score-btn').forEach(btn => {
        btn.removeEventListener('click', handleScoreClick);
        btn.addEventListener('click', handleScoreClick);
    });
}

function handleScoreClick(e) {
    const btn = e.currentTarget;
    const team = btn.dataset.team;
    const isPlus = btn.classList.contains('plus');
    const currentScore = parseInt(document.getElementById(`${team}Score`).textContent);
    const newScore = isPlus ? currentScore + 1 : Math.max(0, currentScore - 1);
    socket.emit('updateScore', { [team === 'home' ? 'homeTeam' : 'awayTeam']: newScore });
}

function initTeamNameInputs() {
    if (homeNameInput) {
        homeNameInput.removeEventListener('change', handleHomeNameChange);
        homeNameInput.addEventListener('change', handleHomeNameChange);
    }
    if (awayNameInput) {
        awayNameInput.removeEventListener('change', handleAwayNameChange);
        awayNameInput.addEventListener('change', handleAwayNameChange);
    }
}

function handleHomeNameChange(e) {
    socket.emit('updateTeamNames', { homeName: e.target.value });
}

function handleAwayNameChange(e) {
    socket.emit('updateTeamNames', { awayName: e.target.value });
}

function initColorPickers() {
    if (homeColorPicker) {
        homeColorPicker.removeEventListener('input', handleHomeColorChange);
        homeColorPicker.addEventListener('input', handleHomeColorChange);
    }
    if (awayColorPicker) {
        awayColorPicker.removeEventListener('input', handleAwayColorChange);
        awayColorPicker.addEventListener('input', handleAwayColorChange);
    }
}

function handleHomeColorChange(e) {
    const color = e.target.value;
    if (homeColorValue) homeColorValue.textContent = color;
    socket.emit('updateTeamColors', { homeColor: color, awayColor: awayColorPicker ? awayColorPicker.value : '#0000FF' });
}

function handleAwayColorChange(e) {
    const color = e.target.value;
    if (awayColorValue) awayColorValue.textContent = color;
    socket.emit('updateTeamColors', { homeColor: homeColorPicker ? homeColorPicker.value : '#FF0000', awayColor: color });
}

// Socket события
socket.on('stateUpdate', (state) => {
    if (homeScoreSpan) homeScoreSpan.textContent = state.homeTeam.score;
    if (awayScoreSpan) awayScoreSpan.textContent = state.awayTeam.score;
    
    if (homeNameInput && homeNameInput.value !== state.homeTeam.name) homeNameInput.value = state.homeTeam.name;
    if (awayNameInput && awayNameInput.value !== state.awayTeam.name) awayNameInput.value = state.awayTeam.name;
    
    if (homeColorPicker && state.homeTeam.color) {
        homeColorPicker.value = state.homeTeam.color;
        if (homeColorValue) homeColorValue.textContent = state.homeTeam.color;
    }
    if (awayColorPicker && state.awayTeam.color) {
        awayColorPicker.value = state.awayTeam.color;
        if (awayColorValue) awayColorValue.textContent = state.awayTeam.color;
    }
    
    if (timerDisplay) timerDisplay.textContent = state.matchTime;
    if (matchTimeInput && matchTimeInput.value !== state.matchTime) matchTimeInput.value = state.matchTime;
    if (halfDurationInput && halfDurationInput.value != state.halfDuration) halfDurationInput.value = state.halfDuration;
    
    if (additionalTimeFirst && state.additionalTimeFirstHalf !== undefined && !blockAutoUpdateFirst) {
        additionalTimeFirst.value = state.additionalTimeFirstHalf;
    }
    if (additionalTimeSecond && state.additionalTimeSecondHalf !== undefined && !blockAutoUpdateSecond) {
        additionalTimeSecond.value = state.additionalTimeSecondHalf;
    }
    
    // Обновление логотипов
    if (homeLogoPreview) {
        homeLogoPreview.src = state.homeTeam.logo ? state.homeTeam.logo + '?t=' + Date.now() : '/logos/placeholder.png';
    }
    if (awayLogoPreview) {
        awayLogoPreview.src = state.awayTeam.logo ? state.awayTeam.logo + '?t=' + Date.now() : '/logos/placeholder.png';
    }
    
    if (halfStatus) {
        switch(state.halfType) {
            case 'first': halfStatus.textContent = '1-й тайм'; halfStatus.style.color = '#4CAF50'; break;
            case 'second': halfStatus.textContent = '2-й тайм'; halfStatus.style.color = '#FFC107'; break;
            case 'halftime': halfStatus.textContent = 'ПЕРЕРЫВ'; halfStatus.style.color = '#FF9800'; break;
            case 'ended': halfStatus.textContent = 'МАТЧ ОКОНЧЕН'; halfStatus.style.color = '#f44336'; break;
        }
    }
    
    if (halfSelect) {
        let halfValue = '1';
        switch(state.halfType) {
            case 'first': halfValue = '1'; break;
            case 'second': halfValue = '2'; break;
            case 'halftime': halfValue = 'ht'; break;
            case 'ended': halfValue = 'ft'; break;
        }
        if (halfSelect.value !== halfValue) halfSelect.value = halfValue;
    }
});

socket.on('historyUpdate', (history) => {
    if (!historyList) return;
    if (history.length === 0) {
        historyList.innerHTML = '<div class="history-empty">Нет событий</div>';
        return;
    }
    
    historyList.innerHTML = '';
    history.slice(0, 20).forEach(event => {
        const eventDiv = document.createElement('div');
        eventDiv.className = 'history-item';
        let eventText = '';
        
        switch(event.type) {
            case 'goal': eventText = `⚽ ГОЛ - ${event.data.player} (${event.data.minute}')`; break;
            case 'substitution': eventText = `🔄 ЗАМЕНА - ${event.data.playerOut} → ${event.data.playerIn} (${event.data.minute}')`; break;
            case 'yellow-card': eventText = `🟨 ЖК - ${event.data.player} (${event.data.minute}')`; break;
            case 'red-card': eventText = `🟥 КК - ${event.data.player} (${event.data.minute}')`; break;
            case 'scoreUpdate': eventText = `📊 Счет: ${event.data.homeTeam.name} ${event.data.homeTeam.score} - ${event.data.awayTeam.score} ${event.data.awayTeam.name}`; break;
            case 'halfEnd': eventText = `⏹️ ${event.data.message}`; break;
            case 'halfStart': eventText = `▶️ ${event.data.message}`; break;
            case 'matchEnd': eventText = `🏁 ${event.data.message}`; break;
            case 'additionalTimeSet': eventText = `⏱️ Добавленное время: ${event.data.half === 1 ? '1-й тайм' : '2-й тайм'} +${event.data.time}'`; break;
            default: eventText = `📌 ${event.type}`;
        }
        
        eventDiv.innerHTML = `<strong>${event.timestamp}</strong> - ${eventText}`;
        historyList.appendChild(eventDiv);
    });
});

// Инициализация обработчиков
if (startTimerBtn) startTimerBtn.addEventListener('click', () => socket.emit('startTimer'));
if (stopTimerBtn) stopTimerBtn.addEventListener('click', () => socket.emit('stopTimer'));
if (resetTimerBtn) resetTimerBtn.addEventListener('click', () => {
    if (confirm('Сбросить таймер и добавленное время?')) {
        socket.emit('resetTimer');
        socket.emit('updateAdditionalTime', { firstHalf: 0, secondHalf: 0 });
        socket.emit('updateHalfDuration', { duration: 45 });
        if (additionalTimeFirst) additionalTimeFirst.value = 0;
        if (additionalTimeSecond) additionalTimeSecond.value = 0;
        if (halfDurationInput) halfDurationInput.value = 45;
        if (matchTimeInput) matchTimeInput.value = '00:00';
    }
});
if (switchHalfBtn) switchHalfBtn.addEventListener('click', () => socket.emit('switchHalf'));
if (halfDurationInput) halfDurationInput.addEventListener('change', () => {
    let duration = parseInt(halfDurationInput.value) || 45;
    if (duration < 1) duration = 1;
    if (duration > 60) duration = 60;
    halfDurationInput.value = duration;
    socket.emit('updateHalfDuration', { duration });
});
if (halfSelect) halfSelect.addEventListener('change', () => {
    const selectedHalf = halfSelect.value;
    const newTime = setTimeByHalfStatus(selectedHalf);
    socket.emit('updateTime', { time: newTime, half: selectedHalf });
});
if (updateTimeBtn) updateTimeBtn.addEventListener('click', () => {
    const time = matchTimeInput ? matchTimeInput.value : '00:00';
    const half = halfSelect ? halfSelect.value : '1';
    const timeRegex = /^([0-9]{1,3}):([0-5][0-9])$/;
    if (!timeRegex.test(time)) {
        alert('Неверный формат времени. Используйте MM:SS (например: 45:00)');
        return;
    }
    socket.emit('updateTime', { time, half });
});
if (hideTitleBtn) hideTitleBtn.addEventListener('click', () => socket.emit('hideTitle'));
if (hideScoreboardBtn) hideScoreboardBtn.addEventListener('click', () => socket.emit('hideScoreboard'));
if (resetMatchBtn) resetMatchBtn.addEventListener('click', () => {
    if (confirm('Вы уверены, что хотите сбросить матч?')) {
        socket.emit('resetMatch');
        socket.emit('updateAdditionalTime', { firstHalf: 0, secondHalf: 0 });
        socket.emit('updateHalfDuration', { duration: 45 });
        if (additionalTimeFirst) additionalTimeFirst.value = 0;
        if (additionalTimeSecond) additionalTimeSecond.value = 0;
        if (halfDurationInput) halfDurationInput.value = 45;
        if (matchTimeInput) matchTimeInput.value = '00:00';
    }
});

// Обработчики добавленного времени
if (additionalTimeFirst) {
    additionalTimeFirst.addEventListener('focus', blockAutoUpdateFirstTemporarily);
    additionalTimeFirst.addEventListener('input', blockAutoUpdateFirstTemporarily);
    additionalTimeFirst.addEventListener('change', blockAutoUpdateFirstTemporarily);
    additionalTimeFirst.addEventListener('mouseenter', blockAutoUpdateFirstTemporarily);
}
if (additionalTimeSecond) {
    additionalTimeSecond.addEventListener('focus', blockAutoUpdateSecondTemporarily);
    additionalTimeSecond.addEventListener('input', blockAutoUpdateSecondTemporarily);
    additionalTimeSecond.addEventListener('change', blockAutoUpdateSecondTemporarily);
    additionalTimeSecond.addEventListener('mouseenter', blockAutoUpdateSecondTemporarily);
}
if (applyAdditionalTimeFirst) applyAdditionalTimeFirst.addEventListener('click', () => applyAdditionalTime('first'));
if (applyAdditionalTimeSecond) applyAdditionalTimeSecond.addEventListener('click', () => applyAdditionalTime('second'));

// Обработчики логотипов
if (homeLogoBtn) homeLogoBtn.addEventListener('click', () => homeLogoInput.click());
if (awayLogoBtn) awayLogoBtn.addEventListener('click', () => awayLogoInput.click());
if (homeLogoInput) homeLogoInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) uploadLogo('home', e.target.files[0]);
});
if (awayLogoInput) awayLogoInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) uploadLogo('away', e.target.files[0]);
});
if (homeLogoRemoveBtn) homeLogoRemoveBtn.addEventListener('click', () => {
    if (confirm('Удалить логотип домашней команды?')) deleteLogo('home');
});
if (awayLogoRemoveBtn) awayLogoRemoveBtn.addEventListener('click', () => {
    if (confirm('Удалить логотип гостевой команды?')) deleteLogo('away');
});

// Обработчики событий матча
eventButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        currentEventType = e.currentTarget.dataset.event;
        eventForm.style.display = 'block';
        const substitutionFields = document.getElementById('substitutionFields');
        if (currentEventType === 'substitution') {
            if (substitutionFields) substitutionFields.style.display = 'flex';
        } else {
            if (substitutionFields) substitutionFields.style.display = 'none';
        }
        document.getElementById('eventPlayer').value = '';
        document.getElementById('eventTeam').value = 'home';
        document.getElementById('eventMinute').value = timerDisplay ? timerDisplay.textContent.split(':')[0] : '00';
        if (document.getElementById('eventPlayerIn')) document.getElementById('eventPlayerIn').value = '';
    });
});

if (cancelEventBtn) cancelEventBtn.addEventListener('click', () => {
    eventForm.style.display = 'none';
    currentEventType = null;
});

if (submitEventBtn) submitEventBtn.addEventListener('click', () => {
    const player = document.getElementById('eventPlayer').value;
    const team = document.getElementById('eventTeam').value;
    const minute = document.getElementById('eventMinute').value;
    
    if (!player || !minute) {
        alert('Заполните обязательные поля!');
        return;
    }
    
    const eventData = { player, minute, team };
    
    if (currentEventType === 'substitution') {
        const playerIn = document.getElementById('eventPlayerIn').value;
        if (!playerIn) {
            alert('Укажите игрока, который вышел на замену!');
            return;
        }
        eventData.playerIn = playerIn;
        eventData.playerOut = player;
    }
    
    socket.emit('showTitle', { type: currentEventType, eventData });
    eventForm.style.display = 'none';
    currentEventType = null;
});

// Сохранение состояния select
function restoreSelectState() {
    if (halfSelect) {
        const savedValue = localStorage.getItem('halfSelectValue');
        if (savedValue) {
            halfSelect.value = savedValue;
            const newTime = setTimeByHalfStatus(savedValue);
            if (matchTimeInput) matchTimeInput.value = newTime;
        }
    }
}
if (halfSelect) {
    halfSelect.addEventListener('change', () => localStorage.setItem('halfSelectValue', halfSelect.value));
    restoreSelectState();
}

// Socket соединение
socket.on('connect', () => {
    updateConnectionStatus('online');
    socket.emit('requestState');
});
socket.on('disconnect', () => updateConnectionStatus('offline'));
socket.on('reconnecting', () => updateConnectionStatus('reconnecting'));
socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    updateConnectionStatus('offline');
});

// Инициализация
function init() {
    initScoreButtons();
    initTeamNameInputs();
    initColorPickers();
    socket.emit('requestState');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}