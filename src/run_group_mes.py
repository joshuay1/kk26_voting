import pandas as pd
import glob
import os
import sys
import json
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Ensure we can import mes.py from previous_old_scripts
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "previous_old_scripts"))
from mes import equal_shares_with_receipt

input_files = glob.glob("data/cleaned/KK26_poll_cleaned_*.csv")
output_dir = "kk26_voting/csv/"
os.makedirs(output_dir, exist_ok=True)

utility_map = {'Ja': 2, 'EherJa': 1, 'EherNein': 0, 'Nein': 0}
score_map = {'Ja': 2, 'EherJa': 1, 'EherNein': -1, 'Nein': -2}
UNIFIED_EXPLANATION_VERSION = 3


def format_chf(value):
    if value is None or pd.isna(value):
        return "–"
    return f"{value:,.0f}".replace(",", "'")


def format_number(value, digits=2):
    if value is None or pd.isna(value):
        return "–"
    return f"{value:.{digits}f}"


def classify_mes_edge_case(is_mes, support_share_pct, coverage_pct, mean_score):
    near_threshold = 97 <= coverage_pct <= 103
    strong_support = support_share_pct >= 50
    moderate_support = support_share_pct < 50
    mixed_sentiment = mean_score < 0

    if not is_mes and strong_support and coverage_pct < 100:
        return "popular_but_unaffordable"
    if is_mes and moderate_support:
        return "funded_with_moderate_support"
    if near_threshold:
        return "near_affordability_threshold"
    if is_mes and mixed_sentiment:
        return "funded_despite_mixed_reactions"
    return "standard"

def get_qualitative_summary(p_id, title, comments, support_count, mean_score, total_voters):
    if not comments:
        if support_count == total_voters:
            return {
                "de": f"Fantastische Neuigkeiten: Alle {support_count} Teilnehmenden haben sich für dieses Projekt ausgesprochen! (Wertung: {mean_score:.2f})",
                "en": f"Fantastic news: All {support_count} participants spoke in favor of this project! (score: {mean_score:.2f})"
            }
        else:
            return {
                "de": f"Dieses Projekt wird von {support_count} von {total_voters} Teilnehmenden unterstützt (Wertung: {mean_score:.2f}). Es wurden keine schriftlichen Kommentare hinterlassen.",
                "en": f"This project is supported by {support_count} out of {total_voters} participants (score: {mean_score:.2f}). No written comments were left."
            }
    try:
        prompt = f"""
        Project: '{title}' ({p_id})
        Quantitative Data:
        - Support Count: {support_count} out of {total_voters} voters (THIS IS THE PRIMARY MEASURE OF POPULARITY)
        - Mean Score: {mean_score:.2f}
        Voter Comments: {' | '.join(comments)}
        
        Instruction: 
        Summarize the sentiment. 
        CRITICAL: Frame the Support Count ({support_count}/{total_voters}) correctly.
        - If {support_count}/{total_voters} is 5/7, 6/7, 7/7, 8/10, etc., frame it as very high or nearly unanimous support.
        - Do NOT say "few votes" or "limited support" if the ratio is > 40%.
        - If comments are mixed, prioritize the high engagement/vote count over the negative anecdotes.
        Use Swiss Standard German (no 'ß').
        Return ONLY a JSON object: {{"de": "...", "en": "..."}}
        """
        response = client.chat.completions.create(
            model="gpt-5.1",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You are a professional data analyst. You prioritize statistical support (vote counts relative to population) over individual comments."},
                {"role": "user", "content": prompt}
            ]
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        return {"de": f"Zusammenfassung nicht verfügbar", "en": f"Summary not available"}

def get_unified_voter_explanation(
    p_id,
    title,
    comments,
    support_count,
    mean_score,
    is_mes,
    cost_val,
    outcome_logic,
    total_voters,
    total_utility,
    supporter_budget,
    group_budget_remaining,
    rho,
    rank,
):
    """
    Combines votes, comments, and MES logic into a single, cohesive, simple narrative.
    """
    support_share_pct = (support_count / total_voters * 100) if total_voters else 0
    coverage_pct = (supporter_budget / cost_val * 100) if cost_val else 0
    affordability_gap = supporter_budget - cost_val
    rho_text = format_number(rho, 2) if isinstance(rho, (int, float)) and not pd.isna(rho) else "not available"
    gap_direction = "surplus" if affordability_gap >= 0 else "shortfall"
    gap_amount = abs(affordability_gap)
    explanation_mode = classify_mes_edge_case(is_mes, support_share_pct, coverage_pct, mean_score)

    prompt = f"""
    Project: '{title}' ({p_id})
    MES Snapshot:
    - Rank in MES order: {rank}
    Status: {'FUNDED' if is_mes else 'NOT FUNDED'}
    - Supporters: {support_count} out of {total_voters} people ({support_share_pct:.1f}%)
    - Total utility points: {total_utility}
    - Average score: {mean_score:.2f}
    - Project cost: CHF {format_chf(cost_val)}
    - Supporter budget at consideration: CHF {format_chf(supporter_budget)}
    - Coverage at consideration: {coverage_pct:.1f}%
    - Affordability {gap_direction}: CHF {format_chf(gap_amount)}
    - Group budget remaining at consideration: CHF {format_chf(group_budget_remaining)}
    - MES rho / price per point: {rho_text}
    - Explanation mode: {explanation_mode}
    Algorithmic context: {outcome_logic}
    Voter Comments: {' | '.join(comments) if comments else 'None'}
    
    Instruction:
    1. Write a short explanation in 2 or 3 sentences.
    2. Use simple, direct, easy-to-understand language. Avoid jargon and unnecessarily complex wording.
    3. Start with what people liked, questioned, or found important about the project.
    4. In normal cases, keep the focus on the comments, the support level, and the overall impression. MES should stay in the background.
    5. Only explain the MES logic more clearly if the case is hard to understand, especially if `Explanation mode` is:
       - `popular_but_unaffordable`
       - `funded_with_moderate_support`
       - `near_affordability_threshold`
       - `funded_despite_mixed_reactions`
    6. In those edge cases, explain the result in plain language and use one or two concrete numbers from the MES snapshot.
    7. Be specific, but only mention the numbers that really help.
    8. If support is high, say that clearly. If support is mixed, say that clearly too.
    9. Do not use vague phrases like "other priorities" unless you explain them with the data.
    10. Use Swiss Standard German (no 'ß') for the German version.
    11. Return a German and an English version.
    12. Return ONLY a JSON object: {{"de": "...", "en": "..."}}
    """
    try:
        response = client.chat.completions.create(
            model="gpt-5.1",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You are a warm and clear community advisor. You write in direct, easy-to-understand language and use data only when it helps explain the result."},
                {"role": "user", "content": prompt}
            ]
        )
        content = response.choices[0].message.content
        return json.loads(content)
    except Exception as e:
        if is_mes and explanation_mode == "standard":
            de = (
                f"{title} fand in der Gruppe Resonanz und wurde von {support_count} von {total_voters} Personen unterstützt. "
                f"Die Rückmeldungen zeigen, warum das Projekt für einige inhaltlich überzeugt hat und schliesslich auch finanziert wurde."
            )
            en = (
                f"{title} resonated with the group and was supported by {support_count} out of {total_voters} people. "
                f"The feedback shows why the project appealed to participants and ultimately received funding."
            )
        elif is_mes:
            rho_clause_de = f" Der Preis lag bei CHF {format_number(rho, 0)} pro Punkt." if isinstance(rho, (int, float)) and not pd.isna(rho) else ""
            rho_clause_en = f" Its price was CHF {format_number(rho, 0)} per point." if isinstance(rho, (int, float)) and not pd.isna(rho) else ""
            de = (
                f"{title} erhielt {support_count} von {total_voters} Unterstützer:innen und wurde im MES finanziert, "
                f"weil diese Unterstützer:innen die benötigten CHF {format_chf(cost_val)} bei der Prüfung decken konnten."
                f"{rho_clause_de}"
            )
            en = (
                f"{title} received support from {support_count} out of {total_voters} people and was funded by MES "
                f"because those supporters could cover the required CHF {format_chf(cost_val)} when it was considered."
                f"{rho_clause_en}"
            )
        elif explanation_mode == "standard":
            de = (
                f"{title} fand in der Gruppe durchaus Anklang und wurde von {support_count} von {total_voters} Personen unterstützt. "
                f"Die Rückmeldungen zeigen, wo das Projekt überzeugt hat und wo für einige noch Fragen offen blieben."
            )
            en = (
                f"{title} did resonate with the group and was supported by {support_count} out of {total_voters} people. "
                f"The feedback shows what people found compelling and where some still had open questions."
            )
        else:
            shortfall = max(0, cost_val - supporter_budget)
            de = (
                f"{title} erhielt zwar {support_count} von {total_voters} Unterstützer:innen und {total_utility} Punkte, "
                f"wurde im MES aber nicht finanziert. Entscheidend war, dass bei der Prüfung nur CHF {format_chf(supporter_budget)} "
                f"für benötigte CHF {format_chf(cost_val)} verfügbar waren; es fehlten also CHF {format_chf(shortfall)}."
            )
            en = (
                f"{title} did receive support from {support_count} out of {total_voters} people and reached {total_utility} points, "
                f"but it was not funded by MES. The decisive reason was that only CHF {format_chf(supporter_budget)} were available "
                f"when it was considered, while CHF {format_chf(cost_val)} were needed, leaving a shortfall of CHF {format_chf(shortfall)}."
            )
        return {"de": de, "en": en}

def get_individual_explanation(voter_id, p, title, vote, cost_val, amount_paid, is_funded, voter_spent, voter_rem, total_utility, rho, rank, support_cnt):
    prompt = f"""
    Explain to voter {voter_id} why the project '{title}' ({p}) was NOT funded by the MES.
    - Project Cost: {cost_val} CHF
    - Number of Supporters: {support_cnt} people
    - Voter's remaining budget: {voter_rem} CHF
    Return MUST include {cost_val} CHF and {support_cnt} supporters.
    Return ONLY a JSON object: {{"de": "...", "en": "..."}}
    """
    try:
        response = client.chat.completions.create(
            model="gpt-5.1",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "Voter advisor. Simple, friendly, no jargon. Swiss German (no 'ß')."},
                {"role": "user", "content": prompt}
            ]
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        return {
            "de": f"Das Projekt \"{title}\" konnte im MES nicht finanziert werden. Zwar wurde es von {support_cnt} Unterstützer:innen getragen, aber innerhalb des verfügbaren Budgets reichte es diesmal nicht für die benötigten {cost_val} CHF.",
            "en": f"The project \"{title}\" could not be funded by MES. It had support from {support_cnt} supporters, but within the available budget it still fell short of the required {cost_val} CHF."
        }

def get_algorithmic_rationale(p, title, is_mes, is_greedy, cost_val, total_utility, support_cnt, mes_voters, group_budget, tb_type, rho, metadata=None):
    rho_str = f"{rho:.2f}" if isinstance(rho, (int, float)) else str(rho)
    if is_mes:
        logic = f"The project was FUNDED by MES. It was affordable and efficient (Value: {rho_str})."
    else:
        if metadata and metadata.get('status') == 'unaffordable':
            logic = f"The project was NOT funded by MES. its {support_cnt} supporters had a combined budget of {metadata.get('money_behind', 0):.2f} CHF, not enough to cover {cost_val} CHF."
        else:
            logic = f"The project was NOT funded. It was either too expensive ({cost_val} CHF) or budgets were already spent."

    prompt = f"""
    Outcome for '{title}' ({p}): {logic}
    Return ONLY a JSON object with 'de' (Swiss German, no 'ß') and 'en'.
    """
    try:
        response = client.chat.completions.create(
            model="gpt-5.1",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "Professional data explainer."},
                {"role": "user", "content": prompt}
            ]
        )
        res = json.loads(response.choices[0].message.content)
        return res if ('de' in res and 'en' in res) else {"de": logic, "en": logic}
    except:
        return {"de": logic, "en": logic}

for input_file in input_files:
    basename = os.path.basename(input_file)
    group_name = basename.split('_')[-1].replace('.csv', '')
    output_file = os.path.join(output_dir, f"KK26_Outcome_{group_name}.csv")
    receipt_file = os.path.join(output_dir, f"KK26_Receipts_{group_name}.csv")
    
    print(f"\nProcessing Group: {group_name}")
    
    df = pd.read_csv(input_file, sep=';')
    
    # LOAD EXISTING RATIONALES FOR SPEED
    existing_rationales = {}
    if os.path.exists(output_file):
        try:
            old_df = pd.read_csv(output_file)
            for _, row in old_df.iterrows():
                try:
                    p_id = str(int(row.get('Project_ID', 0))).zfill(3)
                    existing_rationales[p_id] = {
                        "mes_winner": row.get('MES_Winner', 'No'),
                        "unified_version": row.get('Unified_Explanation_Version', 0),
                        "qual": {"de": row.get('Qualitative_Rationale_DE', 'N/A'), "en": row.get('Qualitative_Rationale_EN', 'N/A')},
                        "algo": {"de": row.get('Algorithmic_Rationale_DE', 'N/A'), "en": row.get('Algorithmic_Rationale_EN', 'N/A')},
                        "unified": {"de": row.get('Unified_Explanation_DE', 'N/A'), "en": row.get('Unified_Explanation_EN', 'N/A')}
                    }
                except:
                    pass
        except Exception as e:
            print(f"  [Cache Load Error - Outcome] {e}")

    # LOAD EXISTING INDIVIDUAL RATIONALES
    existing_individual = {} # (v_id, p_id) -> {"de": ..., "en": ...}
    receipts_file = f"kk26_voting/csv/KK26_Receipts_{group_name}.csv"
    if os.path.exists(receipts_file):
        try:
            rece_df = pd.read_csv(receipts_file)
            for _, row in rece_df.iterrows():
                v_id = str(row.get('Voter_ID', ''))
                p_id = str(int(row.get('Project_ID', 0))).zfill(3)
                reason_de = row.get('Individual_Outcome_Reason_DE', '')
                reason_en = row.get('Individual_Outcome_Reason_EN', '')
                if pd.notna(reason_de) and reason_de != '':
                    existing_individual[(v_id, p_id)] = {"de": reason_de, "en": reason_en}
        except Exception as e:
            print(f"  [Cache Load Error - Receipts] {e}")

    voters = df['Voter_ID'].tolist()
    projects = [col for col in df.columns if col != 'Voter_ID']
    
    # Load comments
    comments_path = f"data/cleaned/KK26_comments_{group_name}.json"
    project_comments = {}
    if os.path.exists(comments_path):
        with open(comments_path, 'r') as f:
            project_comments = json.load(f)

    # Load project metadata
    budget_excel_path = "raw_data/KK26_Projekte_Auswahl_BUDGET_JY.xlsx"
    project_titles = {}
    cost = {p: 1 for p in projects}
    if os.path.exists(budget_excel_path):
        budget_df = pd.read_excel(budget_excel_path)
        budget_df['proj_id'] = budget_df['Antrags-ID'].astype(str).str.replace('KK_26_', '').str.strip()
        cost_dict = dict(zip(budget_df['proj_id'], budget_df['Geld – Wie viel Geld beantragst du vom Kultur Komitee für das Projekt? (CHF)']))
        project_titles = dict(zip(budget_df['proj_id'], budget_df['Titel']))
        cost = {p: cost_dict.get(p, 10000) for p in projects}

    group_budgets = {'BLAU': 63000, 'SCHWARZ': 49000, 'ROT': 49000}
    total_budget = group_budgets.get(group_name, 130000)
    voter_endowment = total_budget / len(voters)

    u = {voter: {p: utility_map.get(str(df[df['Voter_ID']==voter][p].values[0]).strip(), 0) for p in projects} for voter in voters}
    raw_votes = {voter: {p: str(df[df['Voter_ID']==voter][p].values[0]).strip() for p in projects} for voter in voters}
    
    tie_breaker_scores = {}
    support_counts = {p: 0 for p in projects}
    for p in projects:
        total_score = 0
        valid_votes = 0
        for val in df[p]:
            if pd.notna(val) and str(val).strip() != '':
                val_str = str(val).strip()
                if utility_map.get(val_str, 0) > 0: support_counts[p] += 1
                if val_str in score_map:
                    total_score += score_map[val_str]
                    valid_votes += 1
        tie_breaker_scores[p] = total_score / valid_votes if valid_votes > 0 else 0

    try:
        winners_mes, receipt, tiebreak_log, rho_log, event_log, event_metadata, final_total_budget = equal_shares_with_receipt(voters, projects, cost, u, total_budget, tie_breaker_scores)
        
        # Update voter_endowment to reflect the budget actually used by the algorithm (add1 completion)
        voter_endowment = final_total_budget / len(voters)
        print(f"Final Total Budget (after completion): {final_total_budget:.2f}")
        print(f"Final Voter Endowment: {voter_endowment:.2f}")

        mes_approver_counts = {p: 0 for p in projects}
        p_mes_voters = {p: [] for p in projects}
        if receipt:
            for v_id in receipt:
                for p_id, amt in receipt[v_id].items():
                    if amt > 0: 
                        mes_approver_counts[p_id] += 1
                        p_mes_voters[p_id].append(v_id)

        sorted_projects = sorted(projects, key=lambda p: (tie_breaker_scores[p], p), reverse=True)
        winners_greedy = []
        g_cost = 0
        next_candidate = None  # the first project that didn't fit
        for p in sorted_projects:
            if g_cost + cost[p] <= total_budget:
                winners_greedy.append(p)
                g_cost += cost[p]
            else:
                next_candidate = p  # hard stop: first project that doesn't fit
                break

        # Closest-to-budget completion (mirrors MES add1 logic):
        # Only consider the single next-best candidate that didn't fit.
        # If its overshoot is less than the current undershoot, prefer it.
        if next_candidate is not None:
            undershoot = total_budget - g_cost
            overshoot = (g_cost + cost[next_candidate]) - total_budget
            if 0 < overshoot < undershoot:
                winners_greedy.append(next_candidate)
                g_cost += cost[next_candidate]
        
        # New ranking: Winners first (in order of selection), then Rejections (in order of disqualification)
        winners_in_order = [p for p in event_log if p in winners_mes]
        rejections_in_order = [p for p in event_log if p not in winners_mes]
        new_rank_order = winners_in_order + rejections_in_order
        
        mes_rank_map = {p: i + 1 for i, p in enumerate(new_rank_order)}
        
        # Any remaining projects (e.g. 0 utility or never reached) get ranks after the event_log
        remaining_projects = [p for p in projects if p not in mes_rank_map]
        remaining_projects_sorted = sorted(remaining_projects, key=lambda p: (sum(u[v][p] for v in voters), tie_breaker_scores[p]), reverse=True)
        for i, p in enumerate(remaining_projects_sorted):
            mes_rank_map[p] = len(new_rank_order) + i + 1

        spent_before_by_project = {}
        spent_so_far = 0
        for event_project in event_log:
            spent_before_by_project[event_project] = spent_so_far
            if event_project in winners_mes:
                spent_so_far += cost[event_project]
        for p in projects:
            spent_before_by_project.setdefault(p, spent_so_far)

        # Outcome Analysis
        outcome_results = []
        for p in projects:
            is_mes = p in winners_mes
            is_greedy = p in winners_greedy
            print(f"Outcome rationale for {p}...")
            p_title = project_titles.get(p, "Unknown")
            p_total_utility = sum(u[v][p] for v in voters)
            p_support_count = support_counts[p]
            p_mean_score = tie_breaker_scores[p]
            
            p_rho = rho_log.get(p, "N/A")
            p_metadata = event_metadata.get(p)
            
            # Numeric supporter budget for "Coverage" calculation
            p_supporter_budget = p_metadata.get('money_behind', cost[p] if is_mes else 0) if p_metadata else (cost[p] if is_mes else 0)
            p_group_budget_remaining = max(0, total_budget - spent_before_by_project.get(p, 0))

            # USE CACHE if available to avoid expensive LLM calls
            cached = existing_rationales.get(p)
            
            # We use cache if we have it, AND (either we have rho or it's unfunded and we don't need rho)
            # Actually, the check 'cached['algo']['de'] != 'N/A'' is enough if we trust the cache.
            cached_status_matches = cached and str(cached.get('mes_winner', 'No')) == ('Yes' if is_mes else 'No')
            cached_unified_matches = cached and int(cached.get('unified_version', 0) or 0) == UNIFIED_EXPLANATION_VERSION
            if cached and cached['algo']['de'] != 'N/A' and cached_status_matches:
                print(f"  [Cache] Using existing rationale for {p}...")
                alg_rationale = cached['algo']
                qual_summary = cached['qual']
                if cached_unified_matches and cached['unified']['de'] != 'N/A':
                    unified_explanation = cached['unified']
                else:
                    unified_explanation = get_unified_voter_explanation(
                        p, p_title, project_comments.get(p, []), p_support_count, p_mean_score, is_mes,
                        cost[p], alg_rationale['de'], len(voters), p_total_utility, p_supporter_budget,
                        p_group_budget_remaining, p_rho, mes_rank_map[p]
                    )
            else:
                print(f"  [LLM] Generating rationale for {p}...")
                alg_rationale = get_algorithmic_rationale(
                    p, p_title, is_mes, is_greedy, cost[p], p_total_utility, 
                    p_support_count, mes_approver_counts.get(p,0), total_budget, tiebreak_log.get(p, "N/A"),
                    p_rho, metadata=p_metadata
                )

                if cached and cached['qual']['de'] != 'N/A':
                    qual_summary = cached['qual']
                else:
                    qual_summary = get_qualitative_summary(p, p_title, project_comments.get(p, []), p_support_count, p_mean_score, len(voters))
                
                unified_explanation = get_unified_voter_explanation(
                    p, p_title, project_comments.get(p, []), p_support_count, p_mean_score, is_mes,
                    cost[p], alg_rationale['de'], len(voters), p_total_utility, p_supporter_budget,
                    p_group_budget_remaining, p_rho, mes_rank_map[p]
                )
            
            # Get full vote distribution
            val_counts = df[p].apply(lambda x: str(x).strip()).value_counts()
            
            outcome_results.append({
                'Rank': mes_rank_map[p],
                'Popularity_Rank': sorted_projects.index(p) + 1,
                'Project_ID': p, 'Title': p_title,
                'Cost_CHF': cost[p], 'Total_Utility': p_total_utility,
                'Support_Count': p_support_count, 'Mean_Score': round(p_mean_score, 3),
                'MES_Rho': p_rho if isinstance(p_rho, (int, float)) else None,
                'MES_Winner': 'Yes' if is_mes else 'No', 'Greedy_Winner': 'Yes' if is_greedy else 'No',
                'Method_Agreement': 'Agree' if is_mes == is_greedy else 'Disagree',
                'Unified_Explanation_Version': UNIFIED_EXPLANATION_VERSION,
                'Unified_Explanation_DE': unified_explanation['de'],
                'Unified_Explanation_EN': unified_explanation['en'],
                'Qualitative_Rationale_DE': qual_summary['de'],
                'Qualitative_Rationale_EN': qual_summary['en'],
                'Algorithmic_Rationale_DE': alg_rationale['de'],
                'Algorithmic_Rationale_EN': alg_rationale['en'],
                'Vote_Ja': int(val_counts.get('Ja', 0)),
                'Vote_EherJa': int(val_counts.get('EherJa', 0)),
                'Vote_EherNein': int(val_counts.get('EherNein', 0)),
                'Vote_Nein': int(val_counts.get('Nein', 0)),
                'supporter_budget_at_consideration': p_supporter_budget,
                'Efficiency': round(cost[p] / p_total_utility, 2) if p_total_utility > 0 else 0
            })
        pd.DataFrame(outcome_results).sort_values('Rank').to_csv(output_file, index=False)

        # Receipt Analysis (Long Format)
        receipt_rows = []
        
        for v in voters:
            current_voter_budget = voter_endowment
            supported_projects = [p for p in projects if raw_votes[v].get(p) in ['Ja', 'EherJa']]
            # USE MES RANK: We must follow the order in which projects were considered by the algorithm
            # to show the budget depletion correctly.
            ordered_supported = sorted(supported_projects, key=lambda p: mes_rank_map.get(p, 999))
            
            for p in ordered_supported:
                is_funded = p in winners_mes
                amount_paid = receipt.get(v, {}).get(p, 0)
                
                budget_before = current_voter_budget
                current_voter_budget -= amount_paid
                budget_after = current_voter_budget
                
                # Only generate explanation for projects the voter liked but were NOT funded
                if not is_funded:
                    cached_indiv = existing_individual.get((v, p))
                    if cached_indiv:
                        print(f"  [Cache] Using individual rationale for {v} on {p}...")
                        explanation = cached_indiv
                    else:
                        print(f"  [LLM] Generating individual rationale (unfunded) for {v} on project {p}...")
                        explanation = get_individual_explanation(
                            v, p, project_titles.get(p, "Unknown"), raw_votes[v].get(p), cost[p], 
                            amount_paid, is_funded, voter_endowment - budget_before, budget_after, 
                            sum(u[v_other][p] for v_other in voters), rho_log.get(p, "N/A"), 
                            sorted_projects.index(p) + 1, support_counts[p]
                        )
                else:
                    explanation = {"de": "", "en": ""}
                
                receipt_rows.append({
                    'Voter_ID': v,
                    'Project_ID': p,
                    'Title': project_titles.get(p, "Unknown"),
                    'Vote': raw_votes[v].get(p),
                    'Funded': 'Yes' if is_funded else 'No',
                    'Amount_Paid_CHF': round(amount_paid, 2),
                    'Budget_Before_Step_CHF': round(budget_before, 2),
                    'Budget_After_Step_CHF': round(budget_after, 2),
                    'Voter_Endowment': round(voter_endowment, 2),
                    'Individual_Outcome_Reason_DE': explanation['de'],
                    'Individual_Outcome_Reason_EN': explanation['en']
                })
        
        pd.DataFrame(receipt_rows).to_csv(receipt_file, index=False)
        print(f"Saved Outcome to {output_file}")
        print(f"Saved Receipts to {receipt_file}")
        
    except Exception as e:
        import traceback; traceback.print_exc()
