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
            const proj = data.project_receipts.find(p => p.group === g);
            const count = fundedProjects.filter(p => p.group === g).length;
            const color = proj ? proj.color : '#888';
            const border = g === 'SCHWARZ' ? 'border: 1px solid rgba(255,255,255,0.2);' : '';
            return `<span style="background: ${color}; color: white; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.88rem; font-weight: 700; margin-right: 0.3rem; white-space: nowrap; ${border}">${g}: ${count}</span>`;
        }).join(' ');
        const groupSpendStats = groups.map(g => {
            const proj = data.project_receipts.find(p => p.group === g);
            const spent = fundedProjects
                .filter(p => p.group === g)
                .reduce((sum, p) => sum + p.total_raised, 0);
            const color = proj ? proj.color : '#888';
            const border = g === 'SCHWARZ' ? 'border: 1px solid rgba(255,255,255,0.2);' : '';
            return `<span style="background: ${color}; color: white; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.88rem; font-weight: 700; margin-right: 0.3rem; white-space: nowrap; ${border}">${g}: CHF ${spent.toLocaleString('en-CH', { maximumFractionDigits: 0 })}</span>`;
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
            
            <div class="intro-stats" style="margin-top: 1.5rem;">
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

        // Build a global rank map from KK26_OUTCOMES for sorting
        const rankMap = {};
        if (window.KK26_OUTCOMES) {
            Object.values(window.KK26_OUTCOMES).forEach(groupArray => {
                groupArray.forEach(p => {
                    // Store rank as number for sorting, using padded ID for matching
                    rankMap[p.Project_ID] = parseInt(p.Rank);
                });
            });
        }

        const padId = (id) => id.toString().padStart(3, '0');

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
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) {
        const newTooltip = document.createElement('div');
        newTooltip.id = 'tooltip';
        newTooltip.className = 'tooltip';
        document.body.appendChild(newTooltip);
    }

    document.querySelectorAll('.item-row.funded').forEach(el => {
        const voterId = el.querySelector('.item-title').textContent.trim().split('(')[0].trim();
        const budget = el.querySelector('.item-title span').textContent.trim();
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
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.item-title') && !e.target.closest('.tooltip')) {
            tooltip.classList.remove('show');
        }
    });

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

    const supporterRows = p.supporters.map(s => `
        <tr class="item-row funded" style="border-bottom: 1px solid #f5f5f5;">
            <td class="item-title" style="padding: 0.28rem 0.55rem; color: #222; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.92rem;">
                <span>${s.voter_id}</span>
                <span style="color: #999; font-size: 0.78rem; font-weight: normal; margin-left: 0.2rem;">
                    (${s.budget_at_consideration.toLocaleString('de-CH', { maximumFractionDigits: 0 })} CHF)
                </span>
            </td>
            <td class="item-vote" style="padding: 0.28rem 0.45rem; text-align: right; color: #444; font-weight: 700; font-size: 0.9rem;">${getVoteLabel(s.vote)}</td>
            <td class="item-amount" style="padding: 0.28rem 0.55rem; text-align: right; color: #222; font-weight: 800; font-size: 0.92rem;">${s.contribution.toLocaleString('en-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
        </tr>
    `).join('');

    const statusObj = p.is_funded
        ? { label: 'GEFÖRDERT', class: 'funded', topBorder: '#a8dadc', bannerBg: '#a8dadc', bannerText: '#1d3557' }
        : { label: 'NICHT FINANZIERT', class: 'unfunded', topBorder: '#4a4a4a', bannerBg: '#4a4a4a', bannerText: '#f8f9fa' };

    div.innerHTML = `
        <div class="receipt-modern ${statusObj.class}" style="
            background: ${p.is_funded ? '#fff' : 'repeating-linear-gradient(-45deg, #fff, #fff 10px, #fdfdfd 10px, #fdfdfd 20px)'}; 
            border-radius: 12px; 
            overflow: hidden; 
            box-shadow: ${p.is_funded ? '0 10px 30px rgba(0,0,0,0.06)' : 'none'}; 
            border: 1px solid ${p.is_funded ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.05)'};
            border-top: 5px solid ${statusObj.topBorder};
            position: relative;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            font-family: 'JetBrains Mono', monospace;
        ">
            <div class="status-modern-banner" style="
                background: ${statusObj.bannerBg}; 
                color: ${statusObj.bannerText}; 
                font-size: 0.9rem; 
                font-weight: 900; 
                padding: 0.45rem 1.05rem; 
                letter-spacing: 0.14em;
                display: inline-block;
                border-bottom-right-radius: 12px;
                position: absolute;
                top: 0;
                left: 0;
                z-index: 10;
                box-shadow: ${p.is_funded ? '0 8px 20px rgba(29,53,87,0.14)' : '0 8px 20px rgba(0,0,0,0.08)'};
            ">
                ${statusObj.label}
            </div>

            <div class="receipt-content" style="padding: ${p.is_funded ? '2.25rem 1.28rem 0.55rem' : '2.15rem 1.28rem 0.55rem'};">
                <div class="receipt-header-modern" style="margin-bottom: 0.55rem; display: flex; justify-content: space-between; align-items: flex-start;">
                    <div class="logo-area">
                        <div class="receipt-brand-line" style="display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; padding-top: ${p.is_funded ? '0.4rem' : '0.65rem'};">
                            <div class="logo-small" style="font-size: 1rem; font-weight: 800; letter-spacing: 0.07em; color: ${p.is_funded ? '#8a8f98' : '#9aa3ad'};">KK26</div>
                            <div class="subtitle-small" style="font-size: 0.88rem; color: ${p.is_funded ? '#a3a9b1' : '#b1b7bf'}; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600;">Winterthur</div>
                        </div>
                    </div>
                    <div class="receipt-top-meta" style="display: flex; align-items: center; gap: 0.42rem; flex-wrap: wrap; justify-content: flex-end;">
                        <span class="group-pill" style="background: ${p.color}; color: ${p.group === 'SCHWARZ' ? '#f1faee' : '#fff'}; font-weight: 800; font-size: 0.92rem; padding: 0.24rem 0.56rem; border-radius: 4px; letter-spacing: 0.05em;">${p.group}</span>
                        <span style="display: inline-block; padding: 0.22rem 0.52rem; border-radius: 999px; background: ${p.is_funded ? 'rgba(29,53,87,0.08)' : 'rgba(0,0,0,0.05)'}; color: ${p.is_funded ? '#1d3557' : '#666'}; font-size: 0.92rem; font-weight: 900; letter-spacing: 0.06em; font-family: 'JetBrains Mono', monospace;">ID ${p.project_id}</span>
                    </div>
                </div>

                <div class="project-info-modern" style="margin-bottom: 0.32rem;">
                    <div class="project-title" style="font-family: 'JetBrains Mono', monospace; font-size: 1.42rem; font-weight: 850; line-height: 1.18; color: #111; margin-bottom: 0.35rem;">${p.title}</div>
                </div>
                
                <div style="margin-bottom: 0.48rem;">
                    <div style="font-size: 0.9rem; color: #8d949c; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; margin-bottom: 0.3rem;">Unterstützer:innen (${p.supporters.length})</div>
                    <div style="border: 1px solid #eaeaea; border-radius: 6px; overflow: hidden;">
                        <table class="items-table" style="width: 100%; font-size: 0.92rem; border-collapse: collapse; background: #fff;">
                            <thead style="background: #fafafa;">
                                <tr style="border-bottom: 1px solid #eaeaea;">
                                    <th style="width: 55%; padding: 0.3rem 0.55rem; text-align: left; color: #7b828c; font-size: 0.82rem; text-transform: uppercase; font-weight: 800;">ID</th>
                                    <th style="width: 15%; padding: 0.3rem 0.45rem; text-align: right; color: #7b828c; font-size: 0.82rem; text-transform: uppercase; font-weight: 800;">Stimme</th>
                                    <th style="width: 30%; padding: 0.3rem 0.55rem; text-align: right; color: #7b828c; font-size: 0.82rem; text-transform: uppercase; font-weight: 800;">Beitrag</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${supporterRows}
                                <tr class="supporter-total-row" style="background: #fafafa; border-top: 1px solid #eaeaea;">
                                    <td style="padding: 0.34rem 0.55rem; color: #777; font-size: 0.76rem; text-transform: uppercase; font-weight: 900; letter-spacing: 0.05em;">Summe</td>
                                    <td style="padding: 0.34rem 0.45rem; text-align: right;">
                                        <span style="display: block; color: #888; font-size: 0.62rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.04em;">Punkte</span>
                                        <span class="supporter-total-points-value" style="color: #1d3557; font-size: 0.92rem; font-weight: 900;">${totalPointsDisplay}</span>
                                    </td>
                                    <td style="padding: 0.34rem 0.55rem; text-align: right;">
                                        <span style="display: block; color: #888; font-size: 0.62rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.04em;">Kosten</span>
                                        <span class="supporter-total-cost-value" style="color: #555; font-size: 0.92rem; font-weight: 900;">${totalCostDisplay}</span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                ${p.unified_explanation_de ? `
                    <div class="reasoning-box" style="background: ${p.is_funded ? 'rgba(168, 218, 220, 0.1)' : '#fff'}; border: 1px solid ${p.is_funded ? 'rgba(168, 218, 220, 0.3)' : 'rgba(0,0,0,0.05)'}; padding: 0.6rem 0.75rem; border-radius: 8px; margin-bottom: 0.5rem;">
                        <div style="font-size: 0.72rem; line-height: 1.4; color: #444; font-style: italic;">
                            "${p.unified_explanation_de}"
                        </div>
                    </div>
                ` : ''}

                ${!p.is_funded ? `
                    <div class="rejection-box" style="background: #fdf0f0; border-left: 3px solid #e63946; padding: 0.32rem 0.55rem; border-radius: 0 8px 8px 0; margin-bottom: 0.42rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.18rem;">
                            <span style="font-size: 0.72rem; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 0.04em;">Budget-Abdeckung</span>
                            <span style="font-family: 'JetBrains Mono', monospace; font-weight: 900; color: #e76f51; font-size: 0.82rem;">${((p.supporter_budget_at_consideration / p.total_cost) * 100).toFixed(1)}%</span>
                        </div>
                        <div style="width: 100%; height: 4px; background: #eee; border-radius: 999px; overflow: hidden;">
                            <div style="width: ${Math.min(100, (p.supporter_budget_at_consideration / p.total_cost) * 100)}%; height: 100%; background: linear-gradient(90deg, #e76f51, #f4a261);"></div>
                        </div>
                    </div>
                ` : ''}

                <div class="project-bottom-bar" style="margin: 0 -1.25rem 0 -1.25rem; background: ${p.is_funded ? 'rgba(168, 218, 220, 0.12)' : '#f8f9fa'}; padding: 0.5rem 1rem; display: flex; justify-content: space-evenly; align-items: stretch; gap: 0.75rem; border-top: 1px solid ${p.is_funded ? 'rgba(168, 218, 220, 0.3)' : 'rgba(0,0,0,0.05)'};">
                    <div class="project-bottom-metric" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
                        <span style="font-size: 0.65rem; text-transform: uppercase; font-weight: 800; color: ${p.is_funded ? '#457b9d' : '#999'}; letter-spacing: 0.04em; margin-bottom: 0.1rem;">Punkte pro Person</span>
                        <div style="font-size: 1rem; font-weight: 900; color: ${p.is_funded ? '#1d3557' : '#555'}; line-height: 1; font-family: 'JetBrains Mono', monospace;">${pointsPerPersonDisplay} <span style="font-size: 0.65rem; font-weight: 600; opacity: 0.6;">Pnt</span></div>
                    </div>
                    <div class="project-bottom-metric" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
                        <span style="font-size: 0.65rem; text-transform: uppercase; font-weight: 800; color: ${p.is_funded ? '#457b9d' : '#999'}; letter-spacing: 0.04em; margin-bottom: 0.1rem;">CHF pro Punkt</span>
                        <div style="font-size: 1rem; font-weight: 900; color: ${p.is_funded ? '#1d3557' : '#555'}; line-height: 1; font-family: 'JetBrains Mono', monospace;">${chfPerPointDisplay} <span style="font-size: 0.65rem; font-weight: 600; opacity: 0.6;">CHF</span></div>
                    </div>
                    <div class="project-bottom-metric project-bottom-metric-primary" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: ${p.is_funded ? 'rgba(29,53,87,0.08)' : 'rgba(0,0,0,0.045)'}; border: 1px solid ${p.is_funded ? 'rgba(69,123,157,0.22)' : 'rgba(0,0,0,0.08)'}; border-radius: 8px; padding: 0.35rem 0.65rem; min-width: 5.5rem; box-shadow: inset 0 1px 0 rgba(255,255,255,0.45);">
                        <span style="font-size: 0.68rem; text-transform: uppercase; font-weight: 900; color: ${p.is_funded ? '#1d3557' : '#555'}; letter-spacing: 0.05em; margin-bottom: 0.1rem;">Punkte</span>
                        <div style="font-size: 1.3rem; font-weight: 900; color: ${p.is_funded ? '#1d3557' : '#333'}; line-height: 1; font-family: 'JetBrains Mono', monospace;">${totalPointsDisplay} <span style="font-size: 0.7rem; font-weight: 700; opacity: 0.68;">Pnt</span></div>
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
document.addEventListener('DOMContentLoaded', loadProjects);
