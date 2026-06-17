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

        const avgFundedText = avgFunded.toFixed(1).replace('.', ',');
        const avgSpentText = avgSpent
            .toLocaleString('de-CH', { maximumFractionDigits: 0 })
            .replace(/’/g, "'");

        // Update header/intro
        introDiv.className = 'intro-section'; // Ensure it has the class
        introDiv.innerHTML = `
            <p class="philosophy">Die Method of Equal Shares ermöglicht es, «einfache» Entscheidungen frühzeitig zu erkennen und sicherzustellen, dass alle Beteiligten einen möglichst gleichwertigen Einfluss auf den Entscheidungsprozess haben. So bleibt am Entscheidungstag mehr Zeit, um die kritischen Projekte gemeinsam und im Dialog zu verhandeln.</p>
            <p>Hier sehen Sie die persönlichen Stimmzettel der Abstimmung des Kultur Komitees 2026. Insgesamt haben <strong>${totalVoters} Personen</strong> teilgenommen. Im Durchschnitt wurden pro Person <strong>${avgFundedText} Projekte</strong> mit einem Betrag von <strong>CHF ${avgSpentText}</strong> finanziert. Über die verbleibenden Projekte wurde am Entscheidungstag in Person verhandelt.</p>
            <p>Zum Schutz der Persönlichkeitsrechte wurden die Namen der Komiteemitglieder pseudonymisiert und die Projektnamen durch fiktive Bezeichnungen ersetzt.</p>
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
            introDiv.innerHTML = `<p style="color:var(--accent-red); background: rgba(255,0,0,0.1); padding: 1rem; border-radius: 8px;">Fehler beim Laden der Daten. Bitte stellen Sie sicher, dass <code>assets/data/kk26.json</code> korrekt geladen wurde.</p>`;
        }
    }
}


function renderReceipt(r) {
    const div = document.createElement('div');
    div.className = 'receipt';
    div.dataset.group = r.group;

    const data = window.receiptsData || window.KK26_PROJECTS || {};
    const fundedItems = r.items.filter(it => it.funded);
    const unfundedItems = r.items.filter(it => !it.funded);
    const fundedProjects = Array.isArray(data.project_receipts)
        ? data.project_receipts.filter(project => project.is_funded)
        : [];
    const fundedProjectCount = fundedProjects.length;
    const fundedBudget = fundedProjects.reduce((sum, project) => (
        sum + Number(project.total_cost || project.total_raised || 0)
    ), 0);
    const fundedNote = fundedProjectCount
        ? `Bisher wurden insgesamt ${fundedProjectCount} Projekte mit einem Gesamtbudget von CHF ${formatReceiptCHF(fundedBudget, 0)} finanziert.`
        : 'Die finanzierten Projekte wurden mit der Method of Equal Shares berechnet.';

    const fundedRows = fundedItems
        .map(it => `
            <tr class="item-row funded">
                <td class="item-title col-title" data-project="${it.project_id}">${truncate(it.title, 40)}</td>
                <td class="item-vote col-vote">${getVoteLabel(it.vote)}</td>
                <td class="item-amount col-amount">${formatReceiptCHF(it.amount, 2)}</td>
            </tr>
        `).join('');

    const unfundedRows = unfundedItems
        .map(it => `
            <tr class="item-row unfunded">
                <td class="item-title col-title" data-project="${it.project_id}">${truncate(it.title, 34)}</td>
                <td class="item-vote col-vote">${getVoteLabel(it.vote)}</td>
                <td class="item-amount col-amount">–</td>
            </tr>
        `).join('');

    const code = `SKKG-KK26-${r.group}-${r.voter_id.replace(/\s+/g, '')}`;

    div.innerHTML = `
        <div class="receipt-edge top"></div>
        <div class="receipt-body voter-receipt">
            <div class="receipt-header">
                <div class="receipt-logo">kk26</div>
                <div class="receipt-subtitle">Kultur Komitee Winterthur</div>
                <div class="receipt-meta-line">
                    <span>Gruppe ${r.group}</span>
                    <span>${r.voter_id}</span>
                </div>
            </div>

            <div class="receipt-divider dashed"></div>

            <table class="receipt-table">
                <thead>
                    <tr>
                        <th class="receipt-section-title col-title" colspan="3">Finanzierte Projekte</th>
                    </tr>
                    <tr>
                        <th class="col-title">Artikel</th>
                        <th class="col-vote">Stimme</th>
                        <th class="col-amount">Betrag</th>
                    </tr>
                </thead>
                <tbody>
                    ${fundedRows}
                </tbody>
            </table>

            <div class="receipt-divider"></div>

            <div class="receipt-totals">
                <div class="receipt-total-row">
                    <span>Anzahl Projekte</span>
                    <strong>${r.funded_count}</strong>
                </div>
                <div class="receipt-total-row grand">
                    <span>Total CHF</span>
                    <strong>${formatReceiptCHF(r.total_spent, 2)}</strong>
                </div>
            </div>

            <div class="receipt-divider"></div>

            <div class="receipt-method">Method of Equal Shares</div>
            <div class="receipt-time">21.03.2026 10:06</div>
            <p class="receipt-note">${fundedNote}</p>

            <div class="receipt-divider dashed"></div>

            <div class="unfunded-section">
                <table class="receipt-table unfunded-table">
                    <thead>
                        <tr>
                            <th class="receipt-section-title col-title" colspan="3">Nicht finanzierte Projekte</th>
                        </tr>
                        <tr>
                            <th class="col-title">Artikel</th>
                            <th class="col-vote">Stimme</th>
                            <th class="col-amount">Betrag</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${unfundedRows}
                    </tbody>
                </table>
            </div>

            <div class="receipt-divider double"></div>

            <div class="receipt-footer" aria-label="Method of Equal Shares">
                <span>Kultur Komitee Winterthur</span>
                <span>Stiftung für Kunst, Kultur und Geschichte</span>
                <span>Vielen Dank für Ihre Teilnahme!</span>
                <span class="receipt-barcode" aria-hidden="true">||||||||||||||||||||</span>
                <span class="receipt-code">${code}</span>
            </div>
        </div>
        <div class="receipt-edge bottom"></div>
    `;

    return div;
}

function formatCompactCHF(value) {
    return Number(value || 0).toLocaleString('de-CH', { maximumFractionDigits: 0 });
}

function formatReceiptCHF(value, digits) {
    return Number(value || 0)
        .toLocaleString('de-CH', {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits
        })
        .replace(/’/g, "'");
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
document.addEventListener('DOMContentLoaded', () => {
    (window.KK26_DATA_READY || Promise.resolve())
        .then(loadReceipts)
        .catch(err => {
            console.error('Error loading public data:', err);
            const introDiv = document.getElementById('intro-text');
            if (introDiv) {
                introDiv.innerHTML = `<p style="color:var(--accent-red); background: rgba(255,0,0,0.1); padding: 1rem; border-radius: 8px;">Fehler beim Laden der öffentlichen Daten.</p>`;
            }
        });
});
