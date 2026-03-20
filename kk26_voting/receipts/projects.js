function loadProjects() {
    const introDiv = document.getElementById('intro-text');
    const grid = document.getElementById('receipts-grid');

    // This file is reused by the print view, so only boot on the projects page.
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
    document.querySelectorAll('.combined-filters .filter-btn').forEach(btn => {
        if (btn.dataset.filterGroup) {
            btn.classList.toggle('active', btn.dataset.filterGroup === currentGroupFilter);
        }
        if (btn.dataset.filterStatus) {
            btn.classList.toggle('active', btn.dataset.filterStatus === currentStatusFilter);
        }
    });

    // Update grid mode
    const grid = document.getElementById('receipts-grid');
    if (!grid) return;
    if (currentGroupFilter === 'ALL') {
        grid.classList.add('all-groups-view');
    } else {
        grid.classList.remove('all-groups-view');
    }

    // Update column visibility
    document.querySelectorAll('.group-column').forEach(col => {
        const group = col.id.replace('col-', '');
        if (currentGroupFilter === 'ALL' || currentGroupFilter === group) {
            col.classList.remove('hidden');
        } else {
            col.classList.add('hidden');
        }
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

    // Filter receipts within visible columns
    document.querySelectorAll('.receipt').forEach(card => {
        const statusMatch = (currentStatusFilter === 'ALL' ||
            (currentStatusFilter === 'FUNDED' && card.dataset.status === 'funded') ||
            (currentStatusFilter === 'UNFUNDED' && card.dataset.status === 'unfunded'));

        if (statusMatch) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
}

function renderProjectReceipt(p, groupCutoffs, displayRank) {
    const div = document.createElement('div');
    div.className = 'receipt';
    div.dataset.group = p.group;
    div.dataset.status = p.is_funded ? 'funded' : 'unfunded';

    const supporterRows = p.supporters.map(s => `
        <tr class="item-row funded" style="border-bottom: 1px solid #f5f5f5;">
            <td class="item-title voter-link" style="padding: 0.2rem 0.5rem; color: #222; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.82rem; cursor: pointer;" onclick="window.location.href='personal_report.html?voter=${encodeURIComponent(s.voter_id)}'" title="Zum persönlichen Bericht">
                <span style="text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 2px;">${s.voter_id}</span>
                <span style="color: #999; font-size: 0.72rem; font-weight: normal; margin-left: 0.2rem;">
                    (${s.budget_at_consideration.toLocaleString('de-CH', { maximumFractionDigits: 0 })} CHF)
                </span>
            </td>
            <td class="item-vote" style="padding: 0.2rem 0.4rem; text-align: right; color: #444; font-weight: 600; font-size: 0.82rem;">${getVoteLabel(s.vote)}</td>
            <td class="item-amount" style="padding: 0.2rem 0.5rem; text-align: right; color: #222; font-weight: 700; font-size: 0.82rem;">${s.contribution.toLocaleString('en-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
        </tr>
    `).join('');

    const statusObj = p.is_funded
        ? { label: 'GEFÖRDERT', class: 'funded', topBorder: '#a8dadc', bannerBg: '#a8dadc', bannerText: '#1d3557' }
        : { label: 'NICHT FINANZIERT', class: 'unfunded', topBorder: '#e0e0e0', bannerBg: '#f0f0f0', bannerText: '#999' };

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
            ${!p.is_funded ? 'opacity: 0.65; filter: saturate(0.6);' : ''}
        ">
            <div class="status-modern-banner" style="
                background: ${statusObj.bannerBg}; 
                color: ${statusObj.bannerText}; 
                font-size: 0.65rem; 
                font-weight: 900; 
                padding: 0.25rem 0.8rem; 
                letter-spacing: 0.12em;
                display: inline-block;
                border-bottom-right-radius: 8px;
                position: absolute;
                top: 0;
                left: 0;
                z-index: 10;
            ">
                ${statusObj.label}
            </div>

            <div class="receipt-content" style="padding: 1.8rem 1.4rem 0.6rem;">
                <div class="receipt-header-modern" style="margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: flex-start;">
                    <div class="logo-area">
                        <div class="logo-small" style="font-size: 0.95rem; font-weight: 900; letter-spacing: 0.1em; color: #999; margin-bottom: 0.1rem;">KK26</div>
                        <div class="subtitle-small" style="font-size: 0.8rem; color: #bbb; text-transform: uppercase; letter-spacing: 0.05em;">Winterthur</div>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 0.85rem; color: #ccc; font-family: 'JetBrains Mono', monospace;">ID ${p.project_id}</span>
                    </div>
                </div>

                <div class="project-info-modern" style="margin-bottom: 0.4rem;">
                    <div class="project-title" style="font-family: 'JetBrains Mono', monospace; font-size: 1.35rem; font-weight: 850; line-height: 1.2; color: #111; margin-bottom: 0.35rem;">${p.title}</div>
                        <div class="project-meta-pills" style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
                            <span class="group-pill" style="background: ${p.color}; color: ${p.group === 'SCHWARZ' ? '#f1faee' : '#fff'}; font-weight: 800; font-size: 0.85rem; padding: 0.2rem 0.5rem; border-radius: 4px; letter-spacing: 0.05em;">${p.group}</span>
                            <span class="rank-pill" style="background: rgba(0,0,0,0.05); color: #666; font-weight: 700; font-size: 0.85rem; padding: 0.2rem 0.5rem; border-radius: 4px;">Rang ${displayRank || p.rank}</span>
                        </div>
                </div>
                
                ${p.unified_explanation_de ? `
                    <div class="reasoning-box" style="background: ${p.is_funded ? 'rgba(168, 218, 220, 0.1)' : '#fff'}; border: 1px solid ${p.is_funded ? 'rgba(168, 218, 220, 0.3)' : 'rgba(0,0,0,0.05)'}; padding: 0.75rem 0.85rem; border-radius: 10px; margin-bottom: 0.6rem;">
                        <div style="font-size: 0.9rem; line-height: 1.4; color: #444; font-style: italic;">
                            "${p.unified_explanation_de}"
                        </div>
                    </div>
                ` : ''}

                <div style="margin-bottom: 0.6rem;">
                    <div style="font-size: 0.75rem; color: #999; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; margin-bottom: 0.2rem;">Unterstützer:innen (${p.supporters.length})</div>
                    <div style="border: 1px solid #eaeaea; border-radius: 6px; overflow: hidden;">
                        <table class="items-table" style="width: 100%; font-size: 0.82rem; border-collapse: collapse; background: #fff;">
                            <thead style="background: #fafafa;">
                                <tr style="border-bottom: 1px solid #eaeaea;">
                                    <th style="width: 55%; padding: 0.25rem 0.5rem; text-align: left; color: #888; font-size: 0.7rem; text-transform: uppercase; font-weight: 800;">ID</th>
                                    <th style="width: 15%; padding: 0.25rem 0.4rem; text-align: right; color: #888; font-size: 0.7rem; text-transform: uppercase; font-weight: 800;">Stimme</th>
                                    <th style="width: 30%; padding: 0.25rem 0.5rem; text-align: right; color: #888; font-size: 0.7rem; text-transform: uppercase; font-weight: 800;">Beitrag</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${supporterRows}
                            </tbody>
                        </table>
                    </div>
                </div>

                ${!p.is_funded ? `
                    <div class="rejection-box" style="background: #fdf0f0; border-left: 3px solid #e63946; padding: 0.6rem 0.85rem; border-radius: 0 10px 10px 0; margin-bottom: 0.65rem;">
                        <div class="reason-title" style="font-size: 0.8rem; font-weight: 900; color: #888; margin-bottom: 0.35rem; text-transform: uppercase; letter-spacing: 0.05em;">Budget-Abdeckung</div>
                        <div style="font-size: 0.8rem; color: #666; background: #fff; padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid rgba(0,0,0,0.03);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                                <span style="font-size: 0.75rem; color: #999;">Verfügbares Budget der Unterstützenden</span>
                                <span style="font-family: 'JetBrains Mono', monospace; font-weight: 800; color: #e76f51; font-size: 0.95rem;">${((p.supporter_budget_at_consideration / p.total_cost) * 100).toFixed(1)}%</span>
                            </div>
                            <div style="width: 100%; height: 8px; background: #eee; border-radius: 4px; overflow: hidden; margin-bottom: 0.4rem;">
                                <div style="width: ${Math.min(100, (p.supporter_budget_at_consideration / p.total_cost) * 100)}%; height: 100%; background: linear-gradient(90deg, #e76f51, #f4a261); transition: width 0.3s ease;"></div>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #999;">
                                <span>${p.supporter_budget_at_consideration.toLocaleString('en-CH', { maximumFractionDigits: 0 })} CHF verfügbar</span>
                                <span>${p.total_cost.toLocaleString('en-CH', { maximumFractionDigits: 0 })} CHF benötigt</span>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <div class="project-bottom-bar" style="margin: 0 -1.25rem 0 -1.25rem; background: ${p.is_funded ? 'rgba(168, 218, 220, 0.12)' : '#f8f9fa'}; padding: 0.6rem 1.25rem; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid ${p.is_funded ? 'rgba(168, 218, 220, 0.3)' : 'rgba(0,0,0,0.05)'};">
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 0.7rem; text-transform: uppercase; font-weight: 900; color: ${p.is_funded ? '#457b9d' : '#999'}; letter-spacing: 0.05em; margin-bottom: 0.1rem;">Punkte</span>
                        <div style="font-size: 1.25rem; font-weight: 900; color: ${p.is_funded ? '#1d3557' : '#555'}; line-height: 1;">${p.total_utility} <span style="font-size: 0.7rem; font-weight: 600; opacity: 0.6;">Pnt</span></div>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <span style="font-size: 0.7rem; text-transform: uppercase; font-weight: 900; color: #999; letter-spacing: 0.05em; margin-bottom: 0.1rem;">Pro Person</span>
                        <div style="font-size: 1.1rem; font-weight: 900; color: #555; line-height: 1; font-family: 'JetBrains Mono', monospace;">${(p.total_cost / Math.max(1, p.supporter_count)).toLocaleString('en-CH', { maximumFractionDigits: 0 })} <span style="font-size: 0.7rem; opacity: 0.6;">CHF</span></div>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; align-items: flex-end;">
                        <span style="font-size: 0.7rem; text-transform: uppercase; font-weight: 900; color: ${p.is_funded ? '#457b9d' : '#999'}; letter-spacing: 0.05em; margin-bottom: 0.1rem;">Kosten</span>
                        <div style="font-size: 1.25rem; font-weight: 900; font-family: 'JetBrains Mono', monospace; line-height: 1; color: #555;">${p.total_cost.toLocaleString('en-CH', { maximumFractionDigits: 0 })} <span style="font-size: 0.7rem; opacity: 0.6;">CHF</span></div>
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
