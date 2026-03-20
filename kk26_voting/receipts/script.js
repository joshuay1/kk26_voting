function loadReceipts() {
    const introDiv = document.getElementById('intro-text');
    const techInfo = document.getElementById('tech-info');
    const filterBar = document.getElementById('filter-bar');
    const grid = document.getElementById('receipts-grid');

    // Only boot on the receipts page.
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

    } catch (err) {
        console.error('Error loading receipts:', err);
        if (introDiv) {
            introDiv.innerHTML = `<p style="color:var(--accent-red); background: rgba(255,0,0,0.1); padding: 1rem; border-radius: 8px;">Fehler beim Laden der Daten. Bitte stellen Sie sicher, dass <code>js/data.js</code> korrekt geladen wurde.</p>`;
        }
    }
}

// BACKUP: Original renderReceipt() function
// To revert to original design, replace renderReceipt() below with this version
/*
function renderReceipt_ORIGINAL(r) {
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
                <div class="voter-id">${r.voter_id}</div>
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
*/

// NEW: Thermal receipt style (inspired by real Coop receipts)
function renderReceipt(r) {
    const div = document.createElement('div');
    div.className = 'receipt';
    div.dataset.group = r.group;

    const fundedRows = r.items
        .filter(it => it.funded)
        .map(it => `
            <tr class="item-row funded" style="line-height: 1.1;">
                <td class="item-title col-title" data-project="${it.project_id}" style="cursor: pointer; padding: 0.08rem 0; font-size: 0.7rem;">${it.title}</td>
                <td class="item-vote col-vote" style="padding: 0.08rem 0; font-size: 0.7rem;">${getVoteLabel(it.vote)}</td>
                <td class="item-amount col-amount" style="padding: 0.08rem 0; font-size: 0.7rem;">${it.amount.toLocaleString('en-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
        `).join('');

    const unfundedRows = r.items
        .filter(it => !it.funded)
        .map(it => `
            <tr class="item-row unfunded" style="line-height: 1.1;">
                <td class="item-title col-title" data-project="${it.project_id}" style="cursor: pointer; padding: 0.08rem 0; font-size: 0.7rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${truncate(it.title, 32)}</td>
                <td class="item-vote col-vote" style="padding: 0.08rem 0; font-size: 0.7rem;">${getVoteLabel(it.vote)}</td>
                <td class="item-amount col-amount" style="padding: 0.08rem 0; font-size: 0.7rem;">–</td>
            </tr>
        `).join('');

    // Generate timestamp (using a fixed date for consistency)
    const timestamp = '21.03.2026            10:06';

    div.innerHTML = `
        <div class="receipt-edge top"></div>
        <div class="receipt-body" style="max-width: 320px; margin: 0 auto;">
            <div class="receipt-header" style="text-align: center;">
                <div class="logo" style="font-size: 1.6rem; font-weight: 900;">kk26</div>
                <div class="subtitle" style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase;">KULTUR KOMITEE WINTERTHUR</div>
                <div class="receipt-date" style="font-size: 0.7rem;">Gruppe ${r.group} · ${r.voter_id}</div>
            </div>

            <div class="divider dashed"></div>

            <div style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 0.3rem 0 0.2rem;">Finanzierte Projekte</div>

            <table class="items-table" style="font-size: 0.7rem;">
                <thead>
                    <tr style="line-height: 1.2;">
                        <th class="col-title" style="font-size: 0.7rem; padding: 0.1rem 0; color: #000;">Artikel</th>
                        <th class="col-vote" style="font-size: 0.7rem; padding: 0.1rem 0; color: #000;">Stim</th>
                        <th class="col-amount" style="font-size: 0.7rem; padding: 0.1rem 0; color: #000;">Betrag</th>
                    </tr>
                </thead>
                <tbody>
                    ${fundedRows}
                </tbody>
            </table>

            <div class="divider dashed"></div>

            <div class="totals" style="font-size: 0.75rem;">
                <div class="total-row">
                    <span>Anzahl Projekte</span>
                    <span class="total-value">${r.funded_count}</span>
                </div>
                <div class="total-row grand" style="font-size: 0.95rem; font-weight: 900; margin-top: 0.2rem;">
                    <span>TOTAL CHF</span>
                    <span class="total-value">${r.total_spent.toLocaleString('en-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
            </div>

            <div class="divider"></div>

            <div style="margin: 0.4rem 0; font-size: 0.7rem; text-align: center;">
                <div style="font-weight: 600;">Method of Equal Shares</div>
            </div>

            <div style="font-size: 0.65rem; margin: 0.3rem 0;">
                ${timestamp}
            </div>

            <div style="font-size: 0.6rem; margin: 0.4rem 0; text-align: center; line-height: 1.4;">
                Bisher wurden insgesamt 22 Projekte mit einem<br>Gesamtbudget von CHF 163'640 finanziert.
            </div>

            <div class="divider dashed"></div>

            <div style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 0.3rem 0 0.2rem;">Nicht finanzierte Projekte</div>

            <table class="items-table" style="font-size: 0.7rem;">
                <thead>
                    <tr style="line-height: 1.2;">
                        <th class="col-title" style="font-size: 0.7rem; padding: 0.1rem 0; color: #000;">Artikel</th>
                        <th class="col-vote" style="font-size: 0.7rem; padding: 0.1rem 0; color: #000;">Stim</th>
                        <th class="col-amount" style="font-size: 0.7rem; padding: 0.1rem 0; color: #000;">Betrag</th>
                    </tr>
                </thead>
                <tbody>
                    ${unfundedRows}
                </tbody>
            </table>

            <div class="divider dashed"></div>

            <div class="receipt-footer" style="text-align: center;">
                <div class="footer-line" style="font-size: 0.65rem;">KULTUR KOMITEE WINTERTHUR</div>
                <div class="footer-line" style="font-size: 0.6rem;">Stiftung für Kunst, Kultur und Geschichte</div>
                <div class="footer-line" style="font-size: 0.65rem; margin-top: 0.4rem;">Vielen Dank für Ihre Teilnahme!</div>

                <div style="margin-top: 0.6rem; font-family: 'Libre Barcode 128', monospace; font-size: 1.4rem; letter-spacing: -0.05em; line-height: 1; color: #000; overflow: hidden;">
                    ||||||||||||||||||||||
                </div>
                <div style="font-size: 0.55rem; margin-top: 0.15rem; letter-spacing: 0.02em; color: #000; word-break: break-all;">
                    SKKG-KK26-${r.group}-${r.voter_id.replace(/\s+/g, '')}
                </div>
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

// Initial load
document.addEventListener('DOMContentLoaded', loadReceipts);
