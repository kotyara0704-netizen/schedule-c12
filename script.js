const timeSlots = [
    "08:30 - 10:05",
    "10:25 - 12:00",
    "12:20 - 13:55",
    "15:25 - 17:00"
];

const daysNames = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота'];
let currentDayIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEditModal();
});

function initApp() {
    const uploadInput = document.getElementById('pdfUpload');
    if (uploadInput) uploadInput.addEventListener('change', handleFileUpload);
    
    const downloadBtn = document.getElementById('downloadJsonBtn');
    if (downloadBtn) downloadBtn.addEventListener('click', downloadScheduleJSON);
    
    const jsonUpload = document.getElementById('jsonUpload');
    if (jsonUpload) jsonUpload.addEventListener('change', handleJsonUpload);

    const dayBtns = document.querySelectorAll('.day-btn');
    dayBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentDayIndex = parseInt(btn.dataset.day);
            updateActiveDay();
            renderSchedule();
        });
    });

    let today = new Date().getDay() - 1; 
    if (today < 0 || today > 5) today = 0; 
    currentDayIndex = today;

    fetch('schedule.json')
        .then(response => {
            if (!response.ok) throw new Error('Файл schedule.json не знайдено на сервері');
            return response.json();
        })
        .then(data => {
            window.scheduleData = {};
            for (let key in data) {
                window.scheduleData[parseInt(key)] = data[key];
            }
            console.log('Розклад успішно завантажено з сервера!');
            updateActiveDay();
            renderSchedule();
        })
        .catch(err => {
            console.log(err.message + '. Перевіряємо локальне сховище...');
            let savedSchedule = localStorage.getItem('schedule_c12');
            if (savedSchedule) {
                window.scheduleData = JSON.parse(savedSchedule);
            } else {
                window.scheduleData = {
                    0: [], 1: [], 2: [], 3: [], 4: [], 5: []
                };
            }
            updateActiveDay();
            renderSchedule();
        });
}

function updateActiveDay() {
    const dayBtns = document.querySelectorAll('.day-btn');
    dayBtns.forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.day-btn[data-day="${currentDayIndex}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    const title = document.getElementById('currentDayTitle');
    if (title) title.innerText = daysNames[currentDayIndex];
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.remove('hidden');

    try {
        const arrayBuffer = await file.arrayBuffer();
        const schedule = await parsePDF(arrayBuffer);
        
        window.scheduleData = schedule;
        localStorage.setItem('schedule_c12', JSON.stringify(schedule));
        
        renderSchedule();
    } catch (err) {
        console.error(err);
        alert('Помилка при обробці PDF: ' + err.message);
    } finally {
        overlay.classList.add('hidden');
        e.target.value = '';
    }
}

function setupEditModal() {
    const modal = document.getElementById('editModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    const form = document.getElementById('editForm');
    const typeSelect = document.getElementById('editType');
    
    typeSelect.addEventListener('change', (e) => {
        const type = e.target.value;
        const inputs = form.querySelectorAll('input:not([type="hidden"])');
        inputs.forEach(input => {
            if (type === 'empty' || (type === 'free' && input.id !== 'editSubject' && input.id !== 'editRoom' && input.id !== 'editTeacher')) {
                input.parentElement.style.display = 'none';
            } else {
                input.parentElement.style.display = 'block';
            }
        });
    });

    const closeModal = () => {
        modal.classList.add('hidden');
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const dayIdx = parseInt(document.getElementById('editDayIdx').value);
        const pairIdx = parseInt(document.getElementById('editPairIdx').value);
        
        const type = typeSelect.value;
        const newPair = { type: type };
        
        if (type === 'class') {
            newPair.subject = document.getElementById('editSubject').value.trim();
            newPair.teacher = document.getElementById('editTeacher').value.trim();
            newPair.room = document.getElementById('editRoom').value.trim();
            newPair.classType = document.getElementById('editClassType').value.trim();
        } else if (type === 'free') {
            newPair.isSelfStudy = true;
            newPair.subject = document.getElementById('editSubject').value.trim();
            newPair.room = document.getElementById('editRoom').value.trim();
            newPair.teacher = document.getElementById('editTeacher').value.trim();
        }
        
        window.scheduleData[dayIdx][pairIdx] = newPair;
        localStorage.setItem('schedule_c12', JSON.stringify(window.scheduleData));
        
        renderSchedule();
        closeModal();
    });
}

window.openEditModal = function(dayIdx, pairIdx) {
    const pair = window.scheduleData[dayIdx][pairIdx] || { type: 'empty' };
    const modal = document.getElementById('editModal');
    
    document.getElementById('editDayIdx').value = dayIdx;
    document.getElementById('editPairIdx').value = pairIdx;
    
    const typeSelect = document.getElementById('editType');
    if (pair.type === 'empty') typeSelect.value = 'empty';
    else if (pair.type === 'free') typeSelect.value = 'free';
    else typeSelect.value = 'class';
    
    document.getElementById('editClassType').value = pair.classType || '';
    document.getElementById('editSubject').value = pair.subject || '';
    document.getElementById('editTeacher').value = pair.teacher || '';
    document.getElementById('editRoom').value = pair.room || '';
    
    typeSelect.dispatchEvent(new Event('change'));
    modal.classList.remove('hidden');
};

async function parsePDF(typedarray) {
    let pdf = await pdfjsLib.getDocument(typedarray).promise;
    let schedule = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] };
    const dayKeywords = ['понеділок', 'вівторок', 'середа', 'четвер', 'п\'ятниця', 'субота', 'пятниця'];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        let page = await pdf.getPage(pageNum);
        let textContent = await page.getTextContent();
        let items = textContent.items.map(item => ({
            text: item.str, x: item.transform[4], y: item.transform[5], width: item.width
        })).filter(item => item.text.trim().length > 0);

        let c12_y = items.find(i => i.text.toLowerCase().replace(/с/g, 'c').replace(/\s+/g, '') === 'c-12')?.y;
        if (!c12_y) continue;

        let dy = 60;
        let c11_y = items.find(i => i.text.toLowerCase().replace(/с/g, 'c').replace(/\s+/g, '') === 'c-11')?.y;
        let c13_y = items.find(i => i.text.toLowerCase().replace(/с/g, 'c').replace(/\s+/g, '') === 'c-13')?.y;
        if (c12_y && c13_y) dy = Math.abs(c12_y - c13_y);
        else if (c11_y && c12_y) dy = Math.abs(c11_y - c12_y);

        let yGoesUp = (c11_y && c11_y > c12_y) || (c12_y && c13_y && c12_y > c13_y);
        let topBoundary = yGoesUp ? (c11_y || c12_y + dy) - 5 : (c11_y || c12_y - dy) + 5;
        let bottomBoundary = c12_y + (yGoesUp ? 3 : -3);
        let c12Items = items.filter(i => i.y >= Math.min(topBoundary, bottomBoundary) && i.y <= Math.max(topBoundary, bottomBoundary));

        let colHeaders = items.filter(i => /^(I|II|III|IV)$/.test(i.text.trim().toUpperCase().replace(/І/g, 'I')));
        if (colHeaders.length < 4) continue;
        let targetY = parseInt(Object.keys(colHeaders.reduce((acc, h) => { let b = Math.round(h.y/5)*5; acc[b] = (acc[b]||0)+1; return acc; }, {})).reduce((a, b, _, arr) => arr.indexOf(a) > arr.indexOf(b) ? a : b));
        colHeaders = colHeaders.filter(h => Math.abs(h.y - targetY) < 15).sort((a,b) => a.x - b.x);

        let dayHeaders = items.filter(i => dayKeywords.some(kw => i.text.toLowerCase().startsWith(kw))).sort((a,b) => a.x - b.x);

        for (let di = 0; di < dayHeaders.length; di++) {
            let dayIdx = dayKeywords.findIndex(kw => dayHeaders[di].text.toLowerCase().startsWith(kw));
            if (dayIdx === 6) dayIdx = 4;
            if (dayIdx === -1) continue;

            for (let p = 0; p < 4; p++) {
                let colW = 60;
                let colStartX = colHeaders[p].x - colW/2;
                let colEndX = colHeaders[p].x + colW/2;
                let cellItems = c12Items.filter(i => (i.x + (i.width || 0)/2) >= colStartX && (i.x + (i.width || 0)/2) < colEndX);
                schedule[dayIdx][p] = parseCellItems(cellItems);
            }
        }
    }
    for (let d = 0; d < 6; d++) for (let p = 0; p < 4; p++) if (!schedule[d][p]) schedule[d][p] = { type: 'empty' };
    return schedule;
}

function parseCellItems(cellItems) {
    if (!cellItems || cellItems.length === 0) return { type: 'empty' };
    cellItems.sort((a,b) => b.y - a.y);
    let texts = cellItems.map(it => it.text.trim()).filter(t => t.length > 0);
    let isSelfStudy = texts.some(t => t.toLowerCase().includes('ср'));
    texts = texts.map(t => t.replace(/ср\.?/gi, '').trim()).filter(t => t.length > 0);
    
    let room = texts.find(t => /^(\d+[а-яa-z]*|-)$/i.test(t)) || "";
    let teacher = texts.find(t => /[А-ЯІЄЇҐ]\.[А-ЯІЄЇҐ]\./.test(t)) || "";
    let classTypeMatch = texts.find(t => /лз|пз|лек|прак/i.test(t));
    let classType = classTypeMatch ? (classTypeMatch.toLowerCase().includes('лз') ? 'Лекція' : 'Практичне') : 'Лекція';
    let subject = texts.filter(t => t !== room && t !== teacher && !t.toLowerCase().includes('лз') && !t.toLowerCase().includes('пз')).join(' ');

    if (isSelfStudy) return { type: 'free', subject, room, teacher, isSelfStudy: true };
    if (!subject && !room) return { type: 'empty' };
    return { type: 'class', subject, teacher, room, classType };
}

function renderSchedule() {
    const container = document.getElementById('scheduleCards');
    container.innerHTML = '';
    const pairs = window.scheduleData[currentDayIndex] || [];
    
    pairs.forEach((pair, index) => {
        const card = document.createElement('div');
        card.className = 'class-card' + (pair.type === 'free' ? ' free-time' : '');
        let timeStr = timeSlots[index] || "Невідомий час";
        let editBtnHTML = `<button class="edit-btn" onclick="openEditModal(${currentDayIndex}, ${index})" title="Редагувати пару">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>`;

        if (!pair || pair.type === 'empty') {
            card.innerHTML = `
                ${editBtnHTML}
                <div class="class-time">
                    <span class="pair-num">Пара ${index + 1}</span>
                    <span class="time-range">${timeStr}</span>
                </div>
                <div class="class-details empty-pair">
                    <p style="opacity: 0.4;">Немає пари</p>
                </div>
            `;
        } else if (pair.type === 'free') {
            card.innerHTML = `
                ${editBtnHTML}
                <div class="class-time">
                    <span class="pair-num">Пара ${index + 1}</span>
                    <span class="time-range">${timeStr}</span>
                </div>
                <div class="class-details" title="${pair._debug || ''}">
                    <div class="class-type-badge-container" style="text-align: center;">
                        <div class="class-type-badge self-study">САМОСТІЙНА РОБОТА</div>
                    </div>
                    
                    ${pair.subject ? `<h3 class="subject" style="text-align: center; margin-bottom: 1rem;">${pair.subject}</h3>` : ''}
                    
                    <div class="class-meta">
                        ${pair.teacher ? `<div class="meta-item">
                            <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            <span>Викладач: <strong>${pair.teacher}</strong></span>
                        </div>` : ''}
                        
                        ${pair.room ? `<div class="meta-item">
                            <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            <span>Аудиторія: <strong>${pair.room}</strong></span>
                        </div>` : ''}
                    </div>
                </div>
            `;
        } else {
            let typeClass = pair.classType === 'Лекція' ? 'lecture' : (pair.classType === 'Практичне' ? 'practice' : 'lab');
            card.innerHTML = `
                ${editBtnHTML}
                <div class="class-time">
                    <span class="pair-num">Пара ${index + 1}</span>
                    <span class="time-range">${timeStr}</span>
                </div>
                <div class="class-details" title="${pair._debug || ''}">
                    <div class="class-type-badge-container" style="text-align: center;">
                        <div class="class-type-badge ${typeClass}">${pair.classType || ''}</div>
                    </div>
                    <h3 class="subject" style="text-align: center; margin-bottom: 1rem;">${pair.subject}</h3>
                    
                    <div class="class-meta">
                        ${pair.teacher ? `<div class="meta-item">
                            <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            <span>Викладач: <strong>${pair.teacher}</strong></span>
                        </div>` : ''}
                        
                        ${pair.room ? `<div class="meta-item">
                            <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            <span>Аудиторія: <strong>${pair.room}</strong></span>
                        </div>` : ''}
                    </div>
                </div>
            `;
        }
        
        container.appendChild(card);
    });
}

function downloadScheduleJSON() {
    if (!window.scheduleData) {
        alert('Немає даних для скачування! Спочатку завантажте PDF або відредагуйте розклад.');
        return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.scheduleData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "schedule.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function handleJsonUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const parsedData = JSON.parse(event.target.result);
            window.scheduleData = parsedData;
            localStorage.setItem('schedule_c12', JSON.stringify(parsedData));
            
            let today = new Date().getDay() - 1;
            if (today < 0 || today > 5) today = 0;
            currentDayIndex = today;
            updateActiveDay();
            renderSchedule();
            alert('JSON розклад успішно застосовано локально!');
        } catch (error) {
            alert('Помилка читання JSON файлу.');
        }
    };
    reader.readAsText(file);
}
