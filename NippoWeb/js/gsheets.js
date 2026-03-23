/**
 * Nippo Web - Google Sheets Sync Logic
 */

const SYNC_CONFIG = {
    enabled: true,
    scriptUrl: 'https://script.google.com/macros/s/AKfycbxuFwDe9IVD_ZMgVQMnpKjHLgoI8ui5qRnRW-VqSCnsx8B8HPUWbiE3gT-8_RPSMxNQgQ/exec',
};

async function syncToGSheets(data) {
    if (!SYNC_CONFIG.enabled || !SYNC_CONFIG.scriptUrl) return;
    console.log('--- syncToGSheets logic started ---');
    try {
        await fetch(SYNC_CONFIG.scriptUrl, {
            method: 'POST',
            body: JSON.stringify(data),
            mode: 'no-cors'
        });
        console.log('Synced to Google Sheets (no-cors)');
    } catch (error) {
        console.error('Sync failed:', error);
    }
}

async function loadFromGSheets() {
    console.log('--- loadFromGSheets called ---');
    if (!SYNC_CONFIG.enabled || !SYNC_CONFIG.scriptUrl) {
        console.warn('GSheets sync is disabled or URL missing');
        return null;
    }

    try {
        console.log('Fetching from GSheets:', SYNC_CONFIG.scriptUrl);
        const response = await fetch(SYNC_CONFIG.scriptUrl);
        console.log('Fetch response received. Status:', response.status);
        
        if (!response.ok) {
            console.error('Network response was not ok:', response.statusText);
            return null;
        }

        const rawData = await response.json();
        console.log('Raw data from GSheets (SUCCESS):', rawData);

        if (!Array.isArray(rawData)) {
            console.error('Data fetched is not an array:', typeof rawData);
            return null;
        }

        const enKeys = ['id', 'date', 'worker', 'project', 'content', 'est', 'act', 'progress', 'remarks'];

        // 形式1: 配列の配列
        // 形式1: 配列の配列 (推奨: [ [id, date...], [id, date...] ])
        if (rawData.length > 0 && Array.isArray(rawData[0])) {
            const firstRow = rawData[0];
            const hasHeader = (firstRow[0] === 'ID' || firstRow[1] === '日付');
            const dataRows = hasHeader ? rawData.slice(1) : rawData;
            
            return dataRows.map(row => {
                const entry = {};
                let targetKeys;
                if (row.length === 8) {
                    targetKeys = ['date', 'worker', 'project', 'content', 'est', 'act', 'progress', 'remarks'];
                    entry['id'] = 'legacy-' + Math.random().toString(36).substr(2, 9);
                } else {
                    targetKeys = ['id', 'date', 'worker', 'project', 'content', 'est', 'act', 'progress', 'remarks'];
                }
                targetKeys.forEach((k, i) => entry[k] = (row[i] !== undefined && row[i] !== null) ? row[i] : '');
                return normalizeEntry(entry);
            });
        }

        // 形式2: オブジェクトの配列
        console.log('Processing Array-of-Objects format');
        const mapping = {
            'ID': 'id', '日付': 'date', '作業者': 'worker', 'プロジェクト名': 'project',
            '作業内容': 'content', '予想工数': 'est', '実績工数': 'act',
            '進捗': 'progress', '備考': 'remarks'
        };

        return rawData.map((row, idx) => {
            const entry = {};
            const keys = Object.keys(row);
            
            const hasJpKeys = keys.some(k => mapping[k]);
            if (hasJpKeys) {
                for (const [jp, en] of Object.entries(mapping)) {
                    entry[en] = row[jp] !== undefined ? row[jp] : (row[en] || '');
                }
            } else {
                // 列数に応じたスマートマッピング
                let fallbackKeys;
                if (keys.length === 8) {
                    // 旧形式 (IDなし): 日付, 作業者, プロジェクト, 内容, 予定, 実績, 進捗, 備考
                    fallbackKeys = ['date', 'worker', 'project', 'content', 'est', 'act', 'progress', 'remarks'];
                    entry['id'] = 'legacy-' + idx;
                } else {
                    // 新形式 (IDあり): ID, 日付, 作業者, プロジェクト, 内容, 予定, 実績, 進捗, 備考
                    fallbackKeys = ['id', 'date', 'worker', 'project', 'content', 'est', 'act', 'progress', 'remarks'];
                }

                fallbackKeys.forEach((k, i) => {
                    entry[k] = (row[keys[i]] !== undefined) ? row[keys[i]] : '';
                });
            }
            return normalizeEntry(entry);
        });
    } catch (error) {
        console.error('Critical load failure in gsheets.js:', error);
        return null;
    }
}

function normalizeEntry(entry) {
    if (entry.date) {
        try {
            const d = new Date(entry.date);
            if (!isNaN(d.getTime())) {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                entry.date = `${y}-${m}-${day}`;
            }
        } catch (e) {}
    }
    entry.est = parseFloat(entry.est) || 0;
    entry.act = parseFloat(entry.act) || 0;
    return entry;
}
