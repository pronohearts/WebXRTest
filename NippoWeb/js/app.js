/**
 * Nippo Web - Frontend Logic
 */

// --- State Management ---
let nippoData = [];
let chartInstance = null;

// --- DOM Elements ---
const tabs = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const registerForm = document.getElementById('register-form');
const updateListContainer = document.getElementById('update-list-container');
const nippoList = document.getElementById('nippo-list');
const toastContainer = document.getElementById('toast-container');
const pageTitle = document.getElementById('page-title');

// Statistics elements
const statTotalEst = document.getElementById('stat-total-est');
const statTotalAct = document.getElementById('stat-total-act');
const statDiffAct = document.getElementById('stat-diff-act');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    const regDateInput = document.getElementById('reg-date');
    const viewDateFilter = document.getElementById('view-date-filter');
    
    if (regDateInput) regDateInput.value = today;
    if (viewDateFilter) viewDateFilter.value = today;

    // Load data
    await loadData();

    // Initial Render
    renderNippoList();
    renderUpdateList();
    updateAnalysis();

    // Event Listeners
    setupEventListeners();
});

async function loadData() {
    // 1. Try Google Sheets
    if (typeof SYNC_CONFIG !== 'undefined' && SYNC_CONFIG.enabled) {
        try {
            const remoteData = await loadFromGSheets();
            if (remoteData) {
                nippoData = remoteData;
                saveToLocalStorage(); // Sync local cache
                updateFiltersAndSuggestions();
                return;
            }
        } catch (e) {
            console.error("GSheets load failed:", e);
        }
    }
    
    // 2. Fallback to LocalStorage
    loadFromLocalStorage();
    updateFiltersAndSuggestions();
}

function setupEventListeners() {
    // Tab Switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    // Plan Registration Submission
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveRegister();
        });
    }

    // Filters
    const dateFilter = document.getElementById('view-date-filter');
    const workerFilter = document.getElementById('view-worker-filter');
    if (dateFilter) dateFilter.addEventListener('change', renderNippoList);
    if (workerFilter) workerFilter.addEventListener('change', renderNippoList);

    // Analysis Filters
    const anaDateFrom = document.getElementById('ana-date-from');
    const anaDateTo = document.getElementById('ana-date-to');
    if (anaDateFrom) anaDateFrom.addEventListener('change', updateAnalysis);
    if (anaDateTo) anaDateTo.addEventListener('change', updateAnalysis);

    const anaWorkerMulti = document.getElementById('ana-worker-multi');
    const anaProjectMulti = document.getElementById('ana-project-multi');
    if (anaWorkerMulti) {
        anaWorkerMulti.addEventListener('change', updateAnalysis);
    }
    if (anaProjectMulti) {
        anaProjectMulti.addEventListener('change', updateAnalysis);
    }
}

// --- Tab Logic ---
function switchTab(tabId) {
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    const activeTabButton = document.querySelector(`[data-tab="${tabId}"]`);
    if (activeTabButton) activeTabButton.classList.add('active');
    
    const activeContent = document.getElementById(tabId);
    if (activeContent) activeContent.classList.add('active');

    // Update Header Title
    if (activeTabButton) {
        const tabName = activeTabButton.textContent.trim();
        pageTitle.textContent = tabName;
    }

    if (tabId === 'analysis-tab') {
        updateAnalysis();
    } else if (tabId === 'update-tab') {
        renderUpdateList();
    }
}

// --- Data Logic: Register Plan ---
async function saveRegister() {
    const randomId = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
    
    const newEntry = {
        id: randomId,
        date: document.getElementById('reg-date').value,
        worker: document.getElementById('reg-worker').value,
        project: document.getElementById('reg-project').value,
        content: document.getElementById('reg-content').value,
        est: parseFloat(document.getElementById('reg-est').value) || 0,
        act: 0,
        progress: '⚪ 未着手',
        remarks: ''
    };

    nippoData.push(newEntry);
    saveToLocalStorage();
    
    if (typeof SYNC_CONFIG !== 'undefined' && SYNC_CONFIG.enabled) {
        showToast('同期中...');
        await syncToGSheets(newEntry);
    }
    
    showToast('予定を登録しました！');
    registerForm.reset();
    document.getElementById('reg-date').value = new Date().toISOString().split('T')[0];
    
    updateFiltersAndSuggestions();
    renderNippoList();
}

// --- Data Logic: Update Progress ---
function renderUpdateList() {
    const today = new Date().toISOString().split('T')[0];
    // Show tasks for today that are not completed, OR any task that is not completed
    // The spec implies "Today's registered tasks"
    const todaysTasks = nippoData.filter(d => d.date === today && d.progress !== '⚫ 完了');

    if (!updateListContainer) return;

    if (todaysTasks.length === 0) {
        updateListContainer.innerHTML = `
            <div class="empty-state">
                <p>更新が必要な本日の予定はありません。</p>
            </div>
        `;
        return;
    }

    updateListContainer.innerHTML = todaysTasks.map(task => `
        <div class="update-row" data-id="${task.id}">
            <div class="update-row-info">
                <span class="badge project-badge">${task.project}</span>
                <p class="task-content"><strong>${task.content}</strong></p>
                <p class="task-meta">予定: ${task.est}h | 作業者: ${task.worker}</p>
            </div>
            <div class="update-row-inputs">
                <div class="inp-grp">
                    <label>実績 (h)</label>
                    <input type="number" class="upd-act" step="0.5" value="${task.act}" min="0">
                </div>
                <div class="inp-grp">
                    <label>進捗</label>
                    <select class="upd-progress">
                        <option value="⚪ 未着手" ${task.progress === '⚪ 未着手' ? 'selected' : ''}>⚪ 未着手</option>
                        <option value="🟡 遅延" ${task.progress === '🟡 遅延' ? 'selected' : ''}>🟡 遅延</option>
                        <option value="🟢 順調" ${task.progress === '🟢 順調' ? 'selected' : ''}>🟢 順調</option>
                        <option value="⚫ 完了" ${task.progress === '⚫ 完了' ? 'selected' : ''}>⚫ 完了</option>
                    </select>
                </div>
                <div class="inp-grp full">
                    <label>備考</label>
                    <input type="text" class="upd-remarks" value="${task.remarks || ''}" placeholder="一言メモ">
                </div>
                <button class="btn primary btn-sm" onclick="handleUpdate('${task.id}')">更新</button>
            </div>
        </div>
    `).join('');
}

async function handleUpdate(id) {
    const row = document.querySelector(`.update-row[data-id="${id}"]`);
    if (!row) return;

    const actValue = parseFloat(row.querySelector('.upd-act').value);
    const progressValue = row.querySelector('.upd-progress').value;
    const remarksValue = row.querySelector('.upd-remarks').value;

    const index = nippoData.findIndex(d => d.id === id);
    if (index !== -1) {
        nippoData[index].act = actValue;
        nippoData[index].progress = progressValue;
        nippoData[index].remarks = remarksValue;
        
        saveToLocalStorage();
        
        if (typeof SYNC_CONFIG !== 'undefined' && SYNC_CONFIG.enabled) {
            showToast('同期中...');
            // Need to handle update in syncToGSheets (assuming it appends by default, we might need a generic update)
            // For now, let's just call it. If syncToGSheets only appends, duplicates will occur. 
            // In a real app, we'd need a row-id based update.
            await syncToGSheets(nippoData[index], true); 
        }
        
        showToast('更新しました！');
        renderUpdateList();
        renderNippoList();
        updateAnalysis();
    }
}

// Make globally accessible for inline onclick
window.handleUpdate = handleUpdate;

// --- Persistence ---
function loadFromLocalStorage() {
    const saved = localStorage.getItem('nippo_db');
    if (saved) {
        try {
            const rawData = JSON.parse(saved);
            if (!Array.isArray(rawData)) return;

            const mapping = {
                'ID': 'id', '日付': 'date', '作業者': 'worker', 'プロジェクト名': 'project',
                '作業内容': 'content', '予想工数': 'est', '実績工数': 'act',
                '進捗': 'progress', '備考': 'remarks'
            };

            nippoData = rawData.map(row => {
                const entry = {};
                for (const [jpKey, enKey] of Object.entries(mapping)) {
                    const val = row[jpKey] !== undefined ? row[jpKey] : row[enKey];
                    entry[enKey] = val !== undefined ? val : '';
                }
                return entry;
            });
        } catch (e) {
            console.error("Local storage parse failed:", e);
        }
    }
}

function saveToLocalStorage() {
    localStorage.setItem('nippo_db', JSON.stringify(nippoData));
}

function updateFiltersAndSuggestions() {
    const workers = [...new Set(nippoData.map(d => d.worker))].filter(w => w).sort();
    const projects = [...new Set(nippoData.map(d => d.project))].filter(p => p).sort();

    console.log("Updating suggestions:", { workers, projects });

    // Suggestions
    let wList = document.getElementById('worker-suggestions');
    if (wList) wList.innerHTML = workers.map(w => `<option value="${w}">`).join('');

    let pList = document.getElementById('project-suggestions');
    if (pList) pList.innerHTML = projects.map(p => `<option value="${p}">`).join('');

    // Multi-select for Analysis
    renderMultiSelect('ana-worker-multi', workers);
    renderMultiSelect('ana-project-multi', projects);

    // Filter selectors
    const wFilter = document.getElementById('view-worker-filter');
    if (wFilter) {
        const current = wFilter.value;
        wFilter.innerHTML = '<option value="all">全員</option>' + 
            workers.map(w => `<option value="${w}" ${w === current ? 'selected' : ''}>${w}</option>`).join('');
        wFilter.value = current || 'all';
    }
}

function renderMultiSelect(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Preserve checked state
    const checkedItems = Array.from(container.querySelectorAll('input:checked')).map(i => i.value);
    
    container.innerHTML = items.map(item => `
        <label class="multi-select-item">
            <input type="checkbox" value="${item}" ${checkedItems.includes(item) ? 'checked' : ''}>
            <span>${item}</span>
        </label>
    `).join('');
}

// --- Render Logic ---
function renderNippoList() {
    if (!nippoList) return;
    
    const dateFilter = document.getElementById('view-date-filter').value;
    const workerFilter = document.getElementById('view-worker-filter').value;

    const filtered = nippoData.filter(d => {
        const matchDate = !dateFilter || d.date === dateFilter;
        const matchWorker = workerFilter === 'all' || d.worker === workerFilter;
        return matchDate && matchWorker;
    });

    nippoList.innerHTML = filtered.length > 0 
        ? filtered.map(d => `
            <tr>
                <td style="font-family: monospace; font-size: 11px; color: var(--text-muted)">${d.id}</td>
                <td>${d.date}</td>
                <td>${d.worker}</td>
                <td style="font-weight:600">${d.project}</td>
                <td>${d.content}</td>
                <td>${d.est}</td>
                <td>${d.act}</td>
                <td class="status-cell">${getProgressBadge(d.progress)}</td>
                <td style="color:var(--text-muted); font-size:12px">${d.remarks || '-'}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="9" style="text-align:center; padding:40px; color:var(--text-muted)">データがありません</td></tr>';
}

function getProgressBadge(progress) {
    let color = '#95a5a6';
    if (progress.includes('順調')) color = '#2ecc71';
    if (progress.includes('遅延')) color = '#f1c40f';
    if (progress.includes('完了')) color = '#34495e';
    
    return `<span style="color:${color}; font-weight:700">${progress}</span>`;
}

// --- Analysis Logic ---
function updateAnalysis() {
    const statEst = document.getElementById('stat-total-est');
    const statAct = document.getElementById('stat-total-act');
    const statDiff = document.getElementById('stat-diff-act');
    
    // Get Filter Values
    const dateFrom = document.getElementById('ana-date-from')?.value;
    const dateTo = document.getElementById('ana-date-to')?.value;
    const selectedWorkers = Array.from(document.querySelectorAll('#ana-worker-multi input:checked')).map(i => i.value);
    const selectedProjects = Array.from(document.querySelectorAll('#ana-project-multi input:checked')).map(i => i.value);

    // Apply Filters
    const filteredData = nippoData.filter(d => {
        const matchDateFrom = !dateFrom || d.date >= dateFrom;
        const matchDateTo = !dateTo || d.date <= dateTo;
        const matchWorker = selectedWorkers.length === 0 || selectedWorkers.includes(d.worker);
        const matchProject = selectedProjects.length === 0 || selectedProjects.includes(d.project);
        return matchDateFrom && matchDateTo && matchWorker && matchProject;
    });

    if (filteredData.length === 0) {
        if (statEst) statEst.textContent = '0.0 h';
        if (statAct) statAct.textContent = '0.0 h';
        if (statDiff) statDiff.textContent = '0.0 h';
        if (statDiff) statDiff.className = 'stat-value highlight'; // Reset color if no data
        renderChart({});
        return;
    }

    const projAgg = {};
    let totalEst = 0;
    let totalAct = 0;

    filteredData.forEach(d => {
        const est = parseFloat(d.est) || 0;
        const act = parseFloat(d.act) || 0;
        const pName = d.project || '未分類';

        totalEst += est;
        totalAct += act;

        if (!projAgg[pName]) projAgg[pName] = { est: 0, act: 0 };
        projAgg[pName].est += est;
        projAgg[pName].act += act;
    });

    if (statEst) statEst.textContent = `${totalEst.toFixed(1)} h`;
    if (statAct) statAct.textContent = `${totalAct.toFixed(1)} h`;
    
    if (statDiff) {
        const diff = totalEst - totalAct;
        statDiff.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} h`;
        statDiff.style.color = diff < 0 ? '#e74c3c' : '#2ecc71';
    }

    renderChart(projAgg);
}

function renderChart(aggData) {
    const canvas = document.getElementById('project-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const labels = Object.keys(aggData);
    const estData = labels.map(l => aggData[l].est);
    const actData = labels.map(l => aggData[l].act);

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '予想工数 (h)',
                    data: estData,
                    backgroundColor: 'rgba(52, 152, 219, 0.3)',
                    borderColor: 'rgba(52, 152, 219, 0.8)',
                    borderWidth: 1
                },
                {
                    label: '実績工数 (h)',
                    data: actData,
                    backgroundColor: 'rgba(46, 204, 113, 0.6)',
                    borderColor: 'rgba(46, 204, 113, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            },
            scales: {
                x: { beginAtZero: true }
            }
        }
    });
}

// --- UI Helpers ---
function showToast(message) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
