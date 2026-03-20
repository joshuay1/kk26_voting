const OUTCOME_GROUP_COLORS = {
    ROT: '#e63946',
    BLAU: '#457b9d',
    SCHWARZ: '#1d3557'
};

async function loadGroupData(group) {
    window.currentGroup = group;
    // Update UI state
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.group === group);
    });

    try {
        const data = window.KK26_OUTCOMES[group];
        if (!data) throw new Error(`No data found for group: ${group}`);
        renderTable(data);
    } catch (err) {
        console.error('Error loading data:', err);
        const tableBody = document.getElementById('table-body');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 3rem; color: #f72585;">Fehler beim Laden der Daten.<br><small>${err.message}</small></td></tr>`;
        }
    }
}

function getSortedOutcomeData(data) {
    // Sort by Total_Utility (Punkte) descending
    return [...data].sort((a, b) => {
        const utilA = parseFloat(a.Total_Utility || 0);
        const utilB = parseFloat(b.Total_Utility || 0);
        return utilB - utilA;
    });
}

function getOutcomeTableHeaderMarkup() {
    return `
        <thead>
            <tr>
                <th class="th-rank">RANG</th>
                <th class="th-project">PROJEKT</th>
                <th class="th-budget text-right">BUDGET</th>
                <th class="th-points text-center">PUNKTE</th>
                <th class="th-efficiency text-center">CHF/PUNKT</th>
                <th class="th-status text-center">MES</th>
                <th class="th-coverage text-center">ABDECKUNG</th>
                <th class="th-budget-flow">BUDGET-ABFLUSS</th>
            </tr>
        </thead>
    `;
}

function renderOutcomeRows(tbody, data, group) {
    tbody.innerHTML = '';

    const sortedData = getSortedOutcomeData(data);

    const totalGroupSpend = sortedData
        .filter(item => item.MES_Winner === 'Yes')
        .reduce((sum, item) => sum + parseFloat(item.Cost_CHF || 0), 0);
    
    let runningSpend = 0;

    sortedData.forEach((item, index) => {
        const row = document.createElement('tr');
        
        const isFunded = item.MES_Winner === 'Yes';
        if (isFunded) row.classList.add('row-funded');
        
        const costVal = parseFloat(item.Cost_CHF || 0);
        const cost = costVal.toLocaleString('en-CH', { maximumFractionDigits: 0 });
        
        const ja = item.Vote_Ja || '0';
        const eherJa = item.Vote_EherJa || '0';
        const totalUtility = parseFloat(item.Total_Utility || 0);

        const spentBefore = runningSpend;
        if (isFunded) runningSpend += costVal;
        const spentAfter = runningSpend;

        // Calculate percentages relative to the total SPENT budget
        const spentBeforePct = totalGroupSpend > 0 ? (spentBefore / totalGroupSpend) * 100 : 0;
        const currentCostPct = totalGroupSpend > 0 ? (costVal / totalGroupSpend) * 100 : 0;
        const remainingAfterPct = totalGroupSpend > 0
            ? Math.max(0, ((totalGroupSpend - spentAfter) / totalGroupSpend) * 100)
            : 0;
        const currentStartPct = remainingAfterPct;
        const currentEndPct = Math.min(100, currentStartPct + (isFunded ? currentCostPct : 0));

        const groupColor = OUTCOME_GROUP_COLORS[group] || '#444';
        const budgetFlowBackground = isFunded
            ? `linear-gradient(to right,
                ${groupColor}22 0%,
                ${groupColor}22 ${currentStartPct}%,
                ${groupColor} ${currentStartPct}%,
                ${groupColor} ${currentEndPct}%,
                rgba(0,0,0,0.16) ${currentEndPct}%,
                rgba(0,0,0,0.16) 100%)`
            : `linear-gradient(to right,
                #ececec 0%,
                #ececec ${remainingAfterPct}%,
                rgba(0,0,0,0.16) ${remainingAfterPct}%,
                rgba(0,0,0,0.16) 100%)`;

        // Calculate Coverage (Abdeckung) - Use numerical field from backend
        let coverage = 100;
        if (!isFunded) {
            const budgetVal = parseFloat(item.supporter_budget_at_consideration || 0);
            const costVal = parseFloat(item.Cost_CHF);
            coverage = costVal > 0 ? (budgetVal / costVal) * 100 : 0;
            
            // Safety: ensure it doesn't arbitrarily show 100% for unfunded
            if (coverage > 99.9) coverage = 99.9;
        }

        row.innerHTML = `
            <td class="col-rank" style="text-align: center; font-weight: 800; color: var(--text-primary); font-size: 1.1rem;">${index + 1}</td>
            <td class="col-project">
                <div style="display: flex; align-items: baseline;">
                    <span class="col-id" style="color: #bbb; font-size: 0.8rem; margin-right: 0.4rem;">[${item.Project_ID}]</span>
                    <span class="col-title" style="font-weight: 700; color: var(--text-primary);">${item.Title}</span>
                </div>
            </td>
            <td class="col-cost" style="text-align: right; font-weight: 700; font-family: 'JetBrains Mono', monospace;">${cost}</td>
            <td class="col-points" style="text-align: center;">
                <div style="font-size: 1rem; font-weight: 800; color: var(--text-primary);">${totalUtility}</div>
                <div style="font-size: 0.78rem; color: var(--text-dim);">${ja} Ja / ${eherJa} Eher</div>
            </td>
            <td class="col-efficiency" style="text-align: center;">${totalUtility > 0 ? parseFloat(item.Efficiency || 0).toFixed(0) : '—'}</td>
            <td class="col-status" style="text-align: center;">
                ${isFunded ? `<span class="status-pill" title="Vom MES finanziert" aria-label="Vom MES finanziert" style="display: inline-flex; align-items: center; justify-content: center; font-size: 0.95rem; line-height: 1;">✅</span>` : '<span style="color: #ccc;">—</span>'}
            </td>
            <td class="col-coverage" style="text-align: center;">
                <div style="font-weight: 700; color: ${isFunded ? '#2a9d8f' : '#e76f51'};">
                    ${coverage.toFixed(1)}%
                </div>
                <div style="width: 100%; height: 4px; background: #eee; border-radius: 2px; margin-top: 4px; overflow: hidden;">
                    <div style="width: ${Math.min(100, coverage)}%; height: 100%; background: ${isFunded ? '#2a9d8f' : '#e76f51'};"></div>
                </div>
            </td>
            <td class="col-budget-flow">
                <div class="budget-flow-stack" style="display: flex; flex-direction: column; gap: 0.25rem;">
                    <div class="budget-flow-bar" style="height: 12px; border-radius: 3px; overflow: hidden; background: ${budgetFlowBackground}; border: 1px solid rgba(0,0,0,0.12);"></div>
                    <div class="budget-flow-labels" style="display: flex; justify-content: space-between; font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: #888;">
                        <div>
                            <span style="color: #bbb; margin-right: 0.5rem;">Übrig:</span>
                            <span style="font-weight: 800; color: var(--text-primary);">${Math.max(0, totalGroupSpend - spentAfter).toLocaleString('en-CH', { maximumFractionDigits: 0 })}</span>
                        </div>
                        <span style="visibility: ${spentBefore > 0 ? 'visible' : 'hidden'}">${spentBefore.toLocaleString('en-CH', { maximumFractionDigits: 0 })}</span>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderTable(data) {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    renderOutcomeRows(tbody, data, window.currentGroup);
}

function buildOutcomeTable(data, group) {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    tableContainer.innerHTML = `
        <table>
            ${getOutcomeTableHeaderMarkup()}
            <tbody></tbody>
        </table>
    `;

    const tbody = tableContainer.querySelector('tbody');
    renderOutcomeRows(tbody, data, group);
    return tableContainer;
}

function renderOutcomeTableForGroup(group, container = document.getElementById('outcome-table-container')) {
    if (!container) return;

    const outcomeData = window.KK26_OUTCOMES?.[group] || [];
    container.innerHTML = '';
    container.appendChild(buildOutcomeTable(outcomeData, group));
}

window.renderOutcomeTableForGroup = renderOutcomeTableForGroup;

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    if (window.KK26_OUTCOMES && document.getElementById('table-body')) {
        loadGroupData('ROT');
    } else {
        if (!window.KK26_OUTCOMES) {
            console.error('KK26_OUTCOMES not found. Check data.js loading.');
        }
    }
});
