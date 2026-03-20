function loadReceipts() {
    const introDiv = document.getElementById('intro-text');
    const techInfo = document.getElementById('tech-info');
    const filterBar = document.getElementById('filter-bar');
    const grid = document.getElementById('receipts-grid');

    // This file is reused by the print view, so only boot on the receipts page.
    if (!introDiv || !techInfo || !filterBar || !grid) return;

    try {
        const data = window.KK26_PROJECTS;
        if (!data) throw new Error('KK26_PROJECTS data not found');

        // Calculate stats
        const totalVoters = data.voter_receipts.length;
        const totalSpent = data.voter_receipts.reduce((sum, v) => sum + v.total_spent, 0);
        const totalFunded = data.voter_receipts.reduce((sum, v) => sum + v.funded_count, 0);
        const avgSpent = totalSpent / totalVoters;
        const avgFunded = totalFunded / totalVoters;

        const groups = [...new Set(data.voter_receipts.map(v => v.group))];
        const groupStats = groups.map(g => {
            const voter = data.voter_receipts.find(v => v.group === g);
            const count = data.voter_receipts.filter(v => v.group === g).length;
            const color = voter ? voter.color : '#888';
            const border = g === 'SCHWARZ' ? 'border: 1px solid rgba(255,255,255,0.2);' : '';
            return `<span style="background: ${color}; color: white; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.88rem; font-weight: 700; margin-right: 0.3rem; white-space: nowrap; ${border}">${g}: ${count}</span>`;
        }).join(' ');

        // Update header/intro
        introDiv.className = 'intro-section'; // Ensure it has the class
        introDiv.innerHTML = `
            <p class="philosophy">Das MES-Verfahren hilft dabei, "einfache" Entscheidungen frühzeitig zu identifizieren. So bleibt am Diskussionstag mehr Zeit, um die komplexeren Projekte gemeinsam im Dialog zu klären.</p>
            <p>Hier sehen Sie die persönlichen Stimmbelege der Abstimmung: Kultur Komitee 2026. Insgesamt haben <strong>${totalVoters} Personen</strong> teilgenommen. Im Durchschnitt wurden pro Person <strong>${avgFunded.toFixed(1)} Projekte</strong> mit einem Betrag von <strong>CHF ${avgSpent.toLocaleString('en-CH', {maximumFractionDigits:0})}</strong> finanziert.</p>
            
            <div style="display: flex; flex-direction: column; align-items: center; gap: 0.6rem; margin: 1rem 0 2rem;">
                <span style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.6; font-weight: 700;">Teilnehmende nach Gruppen</span>
                <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem;">
                    ${groupStats}
                </div>
            </div>
        `;
        techInfo.style.display = 'block';
        filterBar.style.display = 'flex';

        // Update Filter counts
        const allBtn = document.querySelector('.filter-btn[data-group="ALL"]');
        if(allBtn) allBtn.textContent = `Alle (${data.voter_receipts.length})`;

        grid.innerHTML = ''; // Clear loading state

        window.receiptsData = data;

        // Randomize voter order for the "Alle" view
        data.voter_receipts.sort(() => Math.random() - 0.5);

        data.voter_receipts.forEach(receipt => {
            const card = renderReceipt(receipt);
            grid.appendChild(card);
        });

        setupTooltips();

    } catch (err) {
        console.error('Error loading receipts:', err);
        if (introDiv) {
            introDiv.innerHTML = `<p style="color:var(--accent-red); background: rgba(255,0,0,0.1); padding: 1rem; border-radius: 8px;">Fehler beim Laden der Daten. Bitte stellen Sie sicher, dass <code>js/data.js</code> korrekt geladen wurde.</p>`;
        }
    }
}

function renderReceipt(r) {
    const div = document.createElement('div');
    div.className = 'receipt';
    div.dataset.group = r.group;

    const fundedRows = r.items
        .filter(it => it.funded)
        .map(it => `
            <tr class="item-row funded">
                <td class="item-title col-title" data-project="${it.project_id}" style="cursor: pointer;">${truncate(it.title, 50)}</td>
                <td class="item-vote col-vote">${getVoteLabel(it.vote)}</td>
                <td class="item-amount col-amount">${it.amount.toLocaleString('en-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
        `).join('');

    const unfundedRows = r.items
        .filter(it => !it.funded)
        .map(it => `
            <tr class="item-row unfunded">
                <td class="item-title col-title" data-project="${it.project_id}" style="cursor: pointer;">${truncate(it.title, 50)}</td>
                <td class="item-vote col-vote">${getVoteLabel(it.vote)}</td>
                <td class="item-amount col-amount">–</td>
            </tr>
        `).join('');

    div.innerHTML = `
        <div class="receipt-edge top"></div>
        <div class="receipt-body">
            <div class="receipt-header">
                <div class="logo-line">
                    <div class="logo">KK26</div>
                </div>
                <div class="subtitle">Wähler-Quittig 2026 <span class="group-badge" style="background:${r.color}; margin-left: 0.5rem; vertical-align: middle;">${r.group}</span></div>
                <div class="receipt-date">Kultur Komitee Winterthur</div>
            </div>

            <div class="divider dashed"></div>

            <div class="voter-info">
                <div class="voter-id" style="cursor: pointer; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 3px;" onclick="window.location.href='personal_report.html?voter=${encodeURIComponent(r.voter_id)}'" title="Zum persönlichen Bericht">${r.voter_id}</div>
                <div class="voter-meta">Budget: ${r.wallet_per_voter.toLocaleString('en-CH', { maximumFractionDigits: 0 })} CHF</div>
            </div>

            <div class="divider"></div>

            <table class="items-table">
                <thead>
                    <tr>
                        <th class="col-title">PROJEKT</th>
                        <th class="col-vote">STIMME</th>
                        <th class="col-amount">BETRAG</th>
                    </tr>
                </thead>
                <tbody>
                    ${fundedRows}
                </tbody>
            </table>

            <div class="divider double"></div>

            <div class="totals">
                <div class="total-row">
                    <span>Projekte finanziert</span>
                    <span class="total-value">${r.funded_count}</span>
                </div>
                <div class="total-row grand">
                    <span>AUSGEGEBEN</span>
                    <span class="total-value">${r.total_spent.toLocaleString('en-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CHF</span>
                </div>
            </div>

            <div class="divider dashed"></div>

            <details class="unfunded-section">
                <summary>Nicht finanzierte Projekte (${r.voted_count - r.funded_count})</summary>
                <table class="items-table unfunded-table">
                    <thead style="visibility: collapse; height: 0;">
                        <tr>
                            <th class="col-title"></th>
                            <th class="col-vote"></th>
                            <th class="col-amount"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${unfundedRows}
                    </tbody>
                </table>
            </details>

            <div class="divider dashed"></div>

            <div class="receipt-footer">
                <div class="footer-line">Methode: Equal Shares (MES)</div>
                <div class="footer-line">Vielen Dank für Ihre Teilnahme!</div>
            </div>
        </div>
        <div class="receipt-edge bottom"></div>
    `;

    return div;
}

function truncate(str, n) {
    if (!str) return '';
    return (str.length > n) ? str.slice(0, n - 3) + '&hellip;' : str;
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

function setupTooltips() {
    const tooltip = document.getElementById('quick-tooltip');
    if (!tooltip) return;

    document.querySelectorAll('.item-title').forEach(el => {
        el.addEventListener('mouseenter', (e) => {
            const projectId = el.dataset.project;
            if (!projectId || !window.receiptsData) return;
            
            const projectData = window.receiptsData.project_receipts.find(p => p.project_id === projectId);
            if (!projectData) return;

            const statusLabel = projectData.is_funded ? 
                '<span style="background: #a8dadc; color: #1d3557; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem; font-weight: 800;">GEFÖRDERT</span>' : 
                '<span style="background: rgba(128,128,128,0.15); color: #aaa; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem; font-weight: 800;">ABGELEHNT</span>';
            
            let explanation = projectData.unified_explanation_de || projectData.qualitative_rationale_de || '';

            tooltip.innerHTML = `
                <div class="tooltip-title" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; border-bottom: none; padding-bottom: 0;">
                    <span style="font-size: 1.1rem; line-height: 1.2;">${projectData.title}</span>
                    ${statusLabel}
                </div>
                <div style="margin: 1rem 0; padding-bottom: 1rem; border-bottom: 1px dashed rgba(128,128,128,0.3);">
                    <div class="tooltip-stat" style="margin-bottom: 0.5rem; font-size: 0.95rem;"><span>Projektkosten</span> <strong>${projectData.total_cost.toLocaleString('en-CH')} CHF</strong></div>
                    <div class="tooltip-stat" style="margin-bottom: 0; font-size: 0.95rem;"><span>Unterstützer:innen</span> <strong>${projectData.supporter_count} Personen</strong></div>
                </div>
                ${explanation ? `
                <div>
                    <div style="font-size: 0.8rem; opacity: 0.6; text-transform: uppercase; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: 0.05em;">Begründung Algo</div>
                    <div style="font-size: 0.95rem; opacity: 0.9; line-height: 1.5; font-style: italic;">"${explanation}"</div>
                </div>
                ` : ''}
            `;
            
            tooltip.classList.add('show');
            positionTooltip(e, tooltip);
            
            e.stopPropagation();
        });

        el.addEventListener('mousemove', (e) => {
            if(tooltip.classList.contains('show')) positionTooltip(e, tooltip);
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

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.item-title') && !e.target.closest('.tooltip')) {
            tooltip.classList.remove('show');
        }
    });
}

function positionTooltip(e, tooltip) {
    let x = e.clientX + 15;
    let y = e.clientY + 15;
    const rect = tooltip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - 15;
    if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - 15;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + window.scrollY + 'px';
}

// Initial load
document.addEventListener('DOMContentLoaded', loadReceipts);
