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
            text: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width
        })).filter(item => item.text.trim().length > 0);

        // 1. Шукаємо С-12 на цій сторінці
        let c11_y, c12_y, c13_y;
        let leftColumnItems = items.filter(i => i.x < 150);
        
        for (let item of leftColumnItems) {
            let text = item.text.toLowerCase().replace(/с/g, 'c').replace(/\s+/g, '');
            if (text === 'c-11') c11_y = item.y;
            if (text === 'c-12') c12_y = item.y;
            if (text === 'c-13') c13_y = item.y;
        }

        if (!c12_y) continue; // С-12 немає на цій сторінці

        // 2. Визначаємо Y-межі для С-12
        let dy = 60;
        if (c12_y && c13_y) dy = Math.abs(c12_y - c13_y);
        else if (c11_y && c12_y) dy = Math.abs(c11_y - c12_y);

        let maxY = c12_y + (dy / 2) - 2;
        let minY = c12_y - (dy / 2) + 2;

        let c12Items = items.filter(i => i.y >= minY && i.y <= maxY);

        // 3. Шукаємо X-межі (колонки I, II, III, IV)
        let colHeaders = items.filter(i => {
            let text = i.text.trim().toUpperCase().replace(/І/g, 'I');
            return /^(I|II|III|IV)$/.test(text);
        });

        if (colHeaders.length < 4) continue;

        let yCounts = {};
        for (let h of colHeaders) {
            let bucket = Math.round(h.y / 5) * 5;
            yCounts[bucket] = (yCounts[bucket] || 0) + 1;
        }
        let bestYBucket = Object.keys(yCounts).reduce((a, b) => yCounts[a] > yCounts[b] ? a : b);
        let targetY = parseInt(bestYBucket);
        
        colHeaders = colHeaders.filter(h => Math.abs(h.y - targetY) < 15);
        colHeaders.sort((a,b) => a.x - b.x);

        let pageDaysCols = [];
        let currentDayCols = [];
        for (let c of colHeaders) {
            let text = c.text.trim().toUpperCase().replace(/І/g, 'I');
            if (text === 'I' && currentDayCols.length > 0) {
                pageDaysCols.push(currentDayCols);
                currentDayCols = [];
            }
            currentDayCols.push(c);
        }
        if (currentDayCols.length > 0) pageDaysCols.push(currentDayCols);

        // 4. Шукаємо назви днів, щоб зрозуміти, які дні на цій сторінці
        let dayHeaders = items.filter(i => {
            let t = i.text.toLowerCase();
            return dayKeywords.some(kw => t.startsWith(kw));
        });
        
        // Відкидаємо випадкові збіги, беремо лише ті, що високо (заголовки)
        if (dayHeaders.length > 0) {
            let dayYCounts = {};
            for (let h of dayHeaders) {
                let bucket = Math.round(h.y / 5) * 5;
                dayYCounts[bucket] = (dayYCounts[bucket] || 0) + 1;
            }
            let bestDayYBucket = Object.keys(dayYCounts).reduce((a, b) => dayYCounts[a] > dayYCounts[b] ? a : b);
            let targetDayY = parseInt(bestDayYBucket);
            dayHeaders = dayHeaders.filter(h => Math.abs(h.y - targetDayY) < 15);
        }
        
        dayHeaders.sort((a,b) => a.x - b.x);

        // Парсимо розклад для знайдених днів
        for (let di = 0; di < dayHeaders.length; di++) {
            let header = dayHeaders[di];
            let dayText = header.text.toLowerCase();
            let dayIdx = dayKeywords.findIndex(kw => dayText.startsWith(kw));
            if (dayIdx === 6) dayIdx = 4; // пятниця -> п'ятниця
            
            if (dayIdx !== -1 && di < pageDaysCols.length) {
                let cols = pageDaysCols[di];
                let colW = cols.length > 1 ? cols[1].x - cols[0].x : 60;
                let halfW = colW / 2;

                for (let p = 0; p < 4; p++) {
                    let centerItem = cols[p];
                    if (!centerItem) {
                        schedule[dayIdx][p] = { type: 'empty' };
                        continue;
                    }
                    
                    let colStartX = centerItem.x - halfW;
                    let colEndX = centerItem.x + halfW;

                    let cellItems = c12Items.filter(item => {
                        let cx = item.x + (item.width || 0) / 2;
                        return cx >= colStartX && cx < colEndX;
                    });

                    let parsed = parseCellItems(cellItems);
                    
                    // FALLBACK: Якщо аудиторію не знайшли (часто пишеться ліворуч або прямо на межі комірки)
                    if (!parsed.room) {
                        let colCenter = centerItem.x;
                        let colWidth = Math.abs(cols[1].x - cols[0].x);
                        
                        let cellMinY = minY - 15;
                        let cellMaxY = maxY + 15;
                        
                        let possibleRooms = items.filter(i => {
                            let t = i.text.trim();
                            let isRoom = (t.includes('-') && /\d/.test(t)) || /^\d+[а-яa-z]*$/i.test(t);
                            return isRoom && i.y >= cellMinY && i.y <= cellMaxY;
                        });
                        
                        if (possibleRooms.length > 0) {
                            possibleRooms.sort((a,b) => {
                                let cxA = a.x + (a.width || 0) / 2;
                                let cxB = b.x + (b.width || 0) / 2;
                                return Math.abs(cxA - colCenter) - Math.abs(cxB - colCenter);
                            });
                            
                            let closestRoom = possibleRooms[0];
                            let cx = closestRoom.x + (closestRoom.width || 0) / 2;
                            if (Math.abs(cx - colCenter) < colWidth * 0.7) {
                                parsed.room = closestRoom.text.trim();
                            }
                        }
                    }

                    parsed._debug = cellItems.map(i => `${i.text}(y:${Math.round(i.y)})`).join(' | ');
                    schedule[dayIdx][p] = parsed;
                }
            }
        }
    }

    // Заповнюємо пусті місця для днів, які не знайшли
    for (let d = 0; d < 6; d++) {
        for (let p = 0; p < 4; p++) {
            if (!schedule[d][p]) schedule[d][p] = { type: 'empty' };
        }
    }

    return schedule;
}

function parseCellItems(cellItems) {
    if (!cellItems || cellItems.length === 0) return { type: 'empty' };
    
    cellItems.sort((a,b) => b.y - a.y);
    let texts = cellItems.map(it => it.text.trim()).filter(t => t.length > 0);
    
    if (texts.length === 0) return { type: 'empty' };

    // Видаляємо назви груп (С-11, С-12, С-13), які могли випадково потрапити в комірку
    texts = texts.filter(t => !/^[СсcC]-1[123]$/i.test(t));

    let isSelfStudy = false;
    let srIdx = texts.findIndex(t => t.toLowerCase() === 'ср' || t.toLowerCase() === 'с.р.');
    if (srIdx !== -1) {
        isSelfStudy = true;
        texts.splice(srIdx, 1);
    } else if (texts.length > 0 && texts[0].toLowerCase().startsWith('ср ')) {
        isSelfStudy = true;
        texts[0] = texts[0].substring(3).trim();
    } else if (texts.length > 0 && texts[0].toLowerCase().startsWith('ср')) {
        isSelfStudy = true;
        texts[0] = texts[0].substring(2).trim();
    }
    
    texts = texts.filter(t => t.length > 0);

    let subject = "", teacher = "", room = "", classType = "";
    
    // 1. Шукаємо аудиторії (збираємо всі з їхніми координатами, щоб зберегти форматування як у PDF)
    let roomItems = [];
    for (let i = cellItems.length - 1; i >= 0; i--) {
        let t = cellItems[i].text.trim();
        // Аудиторія: або містить дефіс і цифру (411-27к), або цифри з 1-2 буквами (407а, 27к), або слово бокс
        if ((t.includes('-') && /\d/.test(t)) || /^\d+[а-яa-zієїґ]{0,2}$/i.test(t) || t.toLowerCase().includes('бокс')) {
            roomItems.push(cellItems[i]);
            
            // Видаляємо з texts
            let txtIdx = texts.indexOf(t);
            if (txtIdx !== -1) texts.splice(txtIdx, 1);
        }
    }
    
    if (roomItems.length > 0) {
        // Сортуємо по Y (зверху вниз), без групування по X ("стовпцями не рахуй, ми все беремо рядками")
        roomItems.sort((a,b) => b.y - a.y);
        
        let lines = roomItems.map(i => i.text);
        
        // Якщо ліній кілька, робимо їх по центру
        if (lines.length > 1) {
            room = `<span style="display:inline-block; text-align:center; vertical-align:top;">${lines.join('<br>')}</span>`;
        } else {
            room = lines[0];
        }
    } else {
        room = "";
    }

    // 2. Шукаємо тип заняття (навіть якщо це СР)
    let typeIdx = texts.findIndex(t => /\d+\s*\/\s*\d+\s*[а-яієіїґa-z\.]+/i.test(t));
    if (typeIdx !== -1) {
        let fullStr = texts[typeIdx];
        let regex = /(\d+\s*\/\s*\d+)\s*([а-яієіїґa-z\.]+)/i;
        let tMatch = fullStr.match(regex);
        if (tMatch) {
            let tStr = tMatch[2].toLowerCase();
            if (tStr.startsWith('лз')) classType = 'Лабораторне заняття';
            else if (tStr.startsWith('пз') || tStr.startsWith('п')) classType = 'Практичне заняття';
            else if (tStr.startsWith('л')) classType = 'Лекція';
            else classType = tMatch[0];
            
            // Видаляємо ЦЮ частину з рядка, щоб залишився чистий предмет (напр. "5ППТС")
            let newStr = fullStr.replace(regex, '').trim();
            if (newStr) {
                texts[typeIdx] = newStr;
            } else {
                texts.splice(typeIdx, 1);
            }
        }
    }

    // 3. Шукаємо викладачів
    let teachers = [];
    for (let i = 0; i < texts.length; i++) {
        let t = texts[i];
        let hasDigit = /\d/.test(t);
        let isTitleCase = /^[А-ЯІЄЇҐ][а-яієїґ]+$/.test(t);
        let hasInitials = /[А-ЯІЄЇҐ]\.[А-ЯІЄЇҐ]\./.test(t) || /^[А-ЯІЄЇҐ]\.$/.test(t);
        
        if (!hasDigit && (isTitleCase || hasInitials)) {
            teachers.push(t);
            texts.splice(i, 1);
            i--;
        }
    }
    
    let formattedTeachers = [];
    for (let i = 0; i < teachers.length; i++) {
        let t = teachers[i];
        if (i < teachers.length - 1 && (teachers[i+1].includes('.') || t.includes('.'))) {
            formattedTeachers.push(t + ' ' + teachers[i+1]);
            i++;
        } else {
            formattedTeachers.push(t);
        }
    }
    formattedTeachers = [...new Set(formattedTeachers)]; // Прибираємо дублікати
    teacher = formattedTeachers.join(', ');

    // 4. Предмет
    let uniqueTexts = [];
    texts.forEach(t => { if (!uniqueTexts.includes(t)) uniqueTexts.push(t); });
    
    // Якщо предметів кілька (напр., різні підгрупи), виводимо їх кожен з нового рядка
    subject = uniqueTexts.join('<br>');
    subject = subject.replace(/^[.-]+|[.-]+$/g, '').trim();

    if (subject.endsWith(' 3/3')) subject = subject.replace(' 3/3', '');

    // 5. Автоматичне визначення викладача за абревіатурою (якщо його немає в PDF)
    const SUBJECT_DICT = {
        "ППТС": "Бердников О.М.",
        "ІТ НСК": "Яковів І.Б.",
        "МІБ": "Гангал А.В.",
        "ЕСРЗ": "Головін Ю.О., Шолохов С.М.",
        "ООД": "Шолохов С.М.",
        "АБ ЕКМ": "Рибак А.В., Сбоєв Р.Ю.",
        "СІР": "Войтович",
        "ФВм": "Величко В.А.",
        "ЕП": "відповідно до наказу"
    };

    if (!teacher || teacher.trim() === "") {
        let matchedTeachers = [];
        for (let key in SUBJECT_DICT) {
            // Шукаємо абревіатуру в тексті предмета
            if (subject.includes(key)) {
                matchedTeachers.push(SUBJECT_DICT[key]);
            }
        }
        if (matchedTeachers.length > 0) {
            teacher = matchedTeachers.join(' / ');
        }
    }

    if (isSelfStudy && uniqueTexts.length === 0 && !room && !teacher) return { type: 'free' };
    if (uniqueTexts.length === 0 && !room && !teacher) return { type: 'empty' };

    return { type: 'class', subject, teacher, room, classType, isSelfStudy };
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
            let typeClass = pair.classType === 'Лекція' ? 'lecture' : (pair.classType === 'Практичне заняття' ? 'practice' : 'lab');
            let displayType = pair.classType || '';
            if (pair.isSelfStudy) {
                displayType = displayType ? displayType + ' + СР' : 'Самостійна робота';
                if (!pair.classType) typeClass = 'self-study';
            }
            card.innerHTML = `
                ${editBtnHTML}
                <div class="class-time">
                    <span class="pair-num">Пара ${index + 1}</span>
                    <span class="time-range">${timeStr}</span>
                </div>
                <div class="class-details" title="${pair._debug || ''}">
                    <div class="class-type-badge-container" style="text-align: center;">
                        <div class="class-type-badge ${typeClass}">${displayType}</div>
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
