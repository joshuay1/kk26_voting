function loadProjects() {
    const introDiv = document.getElementById('intro-text');
    const grid = document.getElementById('receipts-grid');

    // Only boot on the projects page.
    if (!introDiv || !grid) return;

    try {
        const data = window.KK26_PROJECTS;
        if (!data) throw new Error('KK26_PROJECTS data not found');

        // Calculate stats
        const fundedProjects = data.project_receipts.filter(p => p.is_funded);
        const totalFunded = fundedProjects.length;
        const totalSpent = fundedProjects.reduce((sum, p) => sum + p.total_raised, 0);
        const avgCost = totalFunded > 0 ? totalSpent / totalFunded : 0;

        const groups = [...new Set(data.project_receipts.map(p => p.group))];
        const groupStats = groups.map(g => {
            const count = fundedProjects.filter(p => p.group === g).length;
            return `<span>${g}: ${count}</span>`;
        }).join(' ');
        const groupSpendStats = groups.map(g => {
            const spent = fundedProjects
                .filter(p => p.group === g)
                .reduce((sum, p) => sum + p.total_raised, 0);
            return `<span>${g}: CHF ${spent.toLocaleString('de-CH', { maximumFractionDigits: 0 })}</span>`;
        }).join(' ');

        // Calculate cutoff efficiency per group (last funded project's cost per point)
        const groupCutoffs = {};
        groups.forEach(g => {
            const fundedInGroup = data.project_receipts.filter(p => p.group === g && p.is_funded);
            if (fundedInGroup.length > 0) {
                const efficiencies = fundedInGroup.map(p => p.total_cost / (p.total_utility || 1));
                groupCutoffs[g] = Math.max(...efficiencies);
            } else {
                groupCutoffs[g] = 0;
            }
        });

        // Update header/intro
        introDiv.className = 'intro-section';
        introDiv.innerHTML = `
            <p class="philosophy">Das MES-Verfahren hilft dabei, "einfache" Entscheidungen frühzeitig zu identifizieren. So bleibt am Diskussionstag mehr Zeit, um die komplexeren Projekte gemeinsam im Dialog zu klären.</p>
            <p>Hier sehen Sie alle eingereichten Projekte. Die durchschnittlichen Projektkosten belaufen sich auf <strong>CHF ${avgCost.toLocaleString('en-CH', { maximumFractionDigits: 0 })}</strong>. Bisher wurden insgesamt <strong>${totalFunded} Projekte</strong> mit einem Gesamtbudget von <strong>CHF ${totalSpent.toLocaleString('en-CH', { maximumFractionDigits: 0 })}</strong> finanziert.</p>

            <div class="intro-stats">
                <div class="stat-group-breakdown">
                    <span class="label">Geförderte Projekte pro Gruppe</span>
                    <div class="badges">
                        ${groupStats}
                    </div>
                </div>
                <div class="stat-group-breakdown">
                    <span class="label">Bisher ausgegebenes Budget pro Gruppe</span>
                    <div class="badges">
                        ${groupSpendStats}
                    </div>
                </div>
            </div>
        `;
        document.querySelectorAll('.filter-bar').forEach(bar => bar.style.display = 'flex');

        // Update Filter counts
        const allBtn = document.querySelector('.combined-filters .filter-btn[data-filter-group="ALL"]');
        if (allBtn) {
            allBtn.textContent = `Alle Gruppen (${data.project_receipts.length})`;
        }

        window.receiptsData = data;

        // grid.innerHTML = ''; // DO NOT CLEAR (it has columns)

        // Sort projects by their MES rank within their group columns
        [...data.project_receipts]
            .sort((a, b) => {
                const rankA = a.rank || 999;
                const rankB = b.rank || 999;
                return rankA - rankB;
            })
            .forEach(project => {
                // Use the MES rank (p.rank) for display
                const card = renderProjectReceipt(project, groupCutoffs, project.rank);
                const col = document.getElementById('col-' + project.group);
                if (col) col.appendChild(card);
            });

        updateFilters();

    } catch (err) {
        console.error('Error loading projects:', err);
        if (introDiv) {
            introDiv.innerHTML = `<p style="color:var(--accent-red)">Fehler beim Laden der Projektdaten.</p>`;
        }
    }
}

let currentGroupFilter = 'ALL';
let currentStatusFilter = 'ALL';

function setGroupFilter(group) {
    currentGroupFilter = group;
    updateFilters();
}

function setStatusFilter(status) {
    currentStatusFilter = status;
    updateFilters();
}

function updateFilters() {
    // Update button states
    document.querySelectorAll('.filter-bar .filter-btn').forEach(btn => {
        if (btn.dataset.filterGroup) {
            btn.classList.toggle('active', btn.dataset.filterGroup === currentGroupFilter);
        }
        if (btn.dataset.filterStatus) {
            btn.classList.toggle('active', btn.dataset.filterStatus === currentStatusFilter);
        }
    });

    // Update grid mode - always keep all-groups-view to show 3 columns
    const grid = document.getElementById('receipts-grid');
    if (!grid) return;
    grid.classList.add('all-groups-view');

    // Keep all columns visible
    document.querySelectorAll('.group-column').forEach(col => {
        col.classList.remove('hidden');
    });

    // Add tooltip functionality for supporter rows
    let tooltip = document.getElementById('tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'tooltip';
        tooltip.className = 'tooltip';
        document.body.appendChild(tooltip);
    }

    document.querySelectorAll('.item-row.funded').forEach(el => {
        const voterId = el.querySelector('.supporter-id')?.textContent.trim()
            || el.querySelector('.item-title').textContent.trim().split('(')[0].trim();
        const budget = el.querySelector('.supporter-budget')?.textContent.trim()
            || el.querySelector('.item-title span')?.textContent.trim()
            || '';
        const vote = el.querySelector('.item-vote').textContent.trim();
        const contribution = el.querySelector('.item-amount').textContent.trim();

        el.addEventListener('mouseenter', (e) => {
            if (!('ontouchstart' in window)) { // Only show on hover for non-touch devices
                tooltip.innerHTML = `
                    <div style="font-weight: 700; margin-bottom: 0.25rem;">${voterId}</div>
                    <div style="font-size: 0.9em; color: #ccc;">Stimme: ${vote}</div>
                    <div style="font-size: 0.9em; color: #ccc;">Budget bei Betrachtung: ${budget}</div>
                    <div style="font-size: 0.9em; color: #ccc;">Beitrag: ${contribution} CHF</div>
                `;
                tooltip.classList.add('show');
                positionTooltip(e, tooltip);
            }
        });

        el.addEventListener('mousemove', (e) => {
            if (!('ontouchstart' in window)) {
                positionTooltip(e, tooltip);
            }
        });

        el.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent default touch behavior (like scrolling)
            tooltip.innerHTML = `
                <div style="font-weight: 700; margin-bottom: 0.25rem;">${voterId}</div>
                <div style="font-size: 0.9em; color: #ccc;">Stimme: ${vote}</div>
                <div style="font-size: 0.9em; color: #ccc;">Budget bei Betrachtung: ${budget}</div>
                <div style="font-size: 0.9em; color: #ccc;">Beitrag: ${contribution} CHF</div>
            `;
            tooltip.classList.add('show');
            positionTooltip(e, tooltip);

            // For mobile: stop propagation to prevent immediate closing by global click handler
            e.stopPropagation();
        });

        el.addEventListener('mouseleave', () => {
            if (!('ontouchstart' in window)) {
                tooltip.classList.remove('show');
            }
        });

        el.addEventListener('click', (e) => {
            if ('ontouchstart' in window) {
                e.preventDefault();
            }
        });
    });

    // Close tooltip on click outside
    if (!window.projectTooltipClickHandlerAttached) {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.item-title') && !e.target.closest('.tooltip')) {
                const activeTooltip = document.getElementById('tooltip');
                if (activeTooltip) activeTooltip.classList.remove('show');
            }
        });
        window.projectTooltipClickHandlerAttached = true;
    }

    // Filter and redistribute receipts across all three columns
    const allReceipts = Array.from(document.querySelectorAll('.receipt'));

    // Filter receipts by both group and status
    const visibleReceipts = allReceipts.filter(card => {
        const groupMatch = (currentGroupFilter === 'ALL' || card.dataset.group === currentGroupFilter);
        const statusMatch = (currentStatusFilter === 'ALL' ||
            (currentStatusFilter === 'FUNDED' && card.dataset.status === 'funded') ||
            (currentStatusFilter === 'UNFUNDED' && card.dataset.status === 'unfunded'));
        return groupMatch && statusMatch;
    });

    // Hide all receipts first
    allReceipts.forEach(card => card.classList.add('hidden'));

    if (currentGroupFilter === 'ALL') {
        // When showing all groups, keep original column placement
        visibleReceipts.forEach(card => card.classList.remove('hidden'));
    } else {
        // When filtering by specific group, redistribute across all three columns
        const columns = [
            document.getElementById('col-ROT'),
            document.getElementById('col-SCHWARZ'),
            document.getElementById('col-BLAU')
        ];

        // Clear columns (remove all receipts temporarily)
        columns.forEach(col => {
            const receipts = Array.from(col.querySelectorAll('.receipt'));
            receipts.forEach(receipt => receipt.remove());
        });

        // Distribute visible receipts evenly across three columns
        visibleReceipts.forEach((card, index) => {
            card.classList.remove('hidden');
            const columnIndex = index % 3;
            columns[columnIndex].appendChild(card);
        });

        // Add back hidden receipts to their original columns to preserve data
        allReceipts.forEach(card => {
            if (!visibleReceipts.includes(card)) {
                const originalGroup = card.dataset.group;
                const originalColumn = document.getElementById('col-' + originalGroup);
                if (originalColumn && !originalColumn.contains(card)) {
                    originalColumn.appendChild(card);
                }
            }
        });
    }
}

function renderProjectReceipt(p, groupCutoffs, displayRank) {
    const div = document.createElement('div');
    div.className = 'receipt';
    div.dataset.group = p.group;
    div.dataset.status = p.is_funded ? 'funded' : 'unfunded';

    const data = window.receiptsData || window.KK26_PROJECTS;
    const groupPeopleCount = data && Array.isArray(data.voter_receipts)
        ? data.voter_receipts.filter(v => v.group === p.group).length
        : Math.max(1, p.supporter_count);
    const totalPointsDisplay = p.total_utility.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    const totalCostDisplay = `${p.total_cost.toLocaleString('de-CH', { maximumFractionDigits: 0 })} CHF`;
    const pointsPerPersonDisplay = (p.total_utility / Math.max(1, groupPeopleCount)).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const chfPerPointValue = p.total_utility > 0 ? (p.total_cost / p.total_utility) : null;
    const chfPerPointDisplay = chfPerPointValue !== null
        ? chfPerPointValue.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : '–';

    const coveragePercent = p.total_cost > 0 && p.supporter_budget_at_consideration
        ? Math.min(100, (p.supporter_budget_at_consideration / p.total_cost) * 100)
        : 0;
    const coverageLabel = p.total_cost > 0 && p.supporter_budget_at_consideration
        ? ((p.supporter_budget_at_consideration / p.total_cost) * 100).toFixed(1)
        : '0.0';

    const supporterRows = p.supporters.map(s => `
        <tr class="item-row funded project-supporter-row">
            <td class="item-title">
                <span class="supporter-id">${s.voter_id}</span>
                <span class="supporter-budget">(${s.budget_at_consideration.toLocaleString('de-CH', { maximumFractionDigits: 0 })} CHF)</span>
            </td>
            <td class="item-vote">${getVoteLabel(s.vote)}</td>
            <td class="item-amount">${s.contribution.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
        </tr>
    `).join('');

    const statusObj = p.is_funded
        ? { label: 'FINANZIERT', class: 'funded' }
        : { label: 'NICHT FINANZIERT', class: 'unfunded' };

    div.innerHTML = `
        <div class="receipt-modern project-card ${statusObj.class}" style="--coverage: ${coveragePercent}%;">
            <div class="receipt-content project-card-content">
                <div class="project-card-topline">
                    <span class="project-card-status">${statusObj.label}</span>
                    <div class="receipt-top-meta">
                        <span class="group-pill">${p.group}</span>
                        <span class="project-id-pill">ID ${p.project_id}</span>
                    </div>
                </div>

                <div class="project-card-header">
                    <div class="receipt-brand-line">
                        <span class="logo-small">KK26</span>
                        <span class="subtitle-small">Winterthur</span>
                    </div>
                    <h2 class="project-title">${p.title}</h2>
                    <div class="project-supporter-count">Unterstützer:innen (${p.supporters.length})</div>
                </div>

                <div class="supporter-table-frame">
                    <table class="items-table project-supporters-table">
                        <thead>
                            <tr>
                                <th class="supporter-id-col">ID</th>
                                <th class="supporter-vote-col">Stimme</th>
                                <th class="supporter-amount-col">Beitrag</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${supporterRows}
                            <tr class="supporter-total-row">
                                <td>Summe</td>
                                <td>
                                    <span>Punkte</span>
                                    <strong class="supporter-total-points-value">${totalPointsDisplay}</strong>
                                </td>
                                <td>
                                    <span>Kosten</span>
                                    <strong class="supporter-total-cost-value">${totalCostDisplay}</strong>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                ${p.unified_explanation_de ? `
                    <div class="reasoning-box">
                        <p>"${p.unified_explanation_de}"</p>
                    </div>
                ` : ''}

                ${!p.is_funded ? `
                    <div class="rejection-box">
                        <div class="budget-coverage-topline">
                            <span>Budget-Abdeckung</span>
                            <strong>${coverageLabel}%</strong>
                        </div>
                        <div class="budget-coverage-track">
                            <div class="budget-coverage-fill"></div>
                        </div>
                    </div>
                ` : ''}

                <div class="project-bottom-bar">
                    <div class="project-bottom-metric">
                        <span>Punkte pro Person</span>
                        <strong>${pointsPerPersonDisplay}</strong>
                        <small>Pnt</small>
                    </div>
                    <div class="project-bottom-metric">
                        <span>CHF pro Punkt</span>
                        <strong>${chfPerPointDisplay}</strong>
                        <small>CHF</small>
                    </div>
                    <div class="project-bottom-metric project-bottom-metric-primary">
                        <span>Punkte</span>
                        <strong>${totalPointsDisplay}</strong>
                        <small>Pnt</small>
                    </div>
                </div>
            </div>
        </div>
    `;

    return div;
}

function getVoteLabel(vote) {
    return {
        "Ja": "✓✓",
        "EherJa": "✓",
        "EherNein": "✗",
        "Nein": "✗✗",
        "": "–"
    }[vote] || vote;
}

function filterReceipts(group) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.group === group);
    });
    document.querySelectorAll('.receipt').forEach(card => {
        if (group === 'ALL' || card.dataset.group === group) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    (window.KK26_DATA_READY || Promise.resolve())
        .then(loadProjects)
        .catch(err => {
            console.error('Error loading public data:', err);
            const introDiv = document.getElementById('intro-text');
            if (introDiv) {
                introDiv.innerHTML = `<p style="color:var(--accent-red)">Fehler beim Laden der öffentlichen Projektdaten.</p>`;
            }
        });
});
