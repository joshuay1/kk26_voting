"""
Generate the public JSON data file for the receipts site.
Processes the KK26 Receipts and Outcome CSVs and outputs site/assets/data/kk26.json.
"""
import pandas as pd
import os
import json
from datetime import datetime


GROUP_COLORS = {
    "ROT": "#e63946",       # Punch Red
    "SCHWARZ": "#1d3557",   # Oxford Navy
    "BLAU": "#457b9d",      # Cerulean
}

GROUPS = {
    "ROT": 49000,
    "SCHWARZ": 49000,
    "BLAU": 63000,
}

# BUDGET_PER_VOTER = 7000.0 (Removed to use dynamic value from CSV)


def generate_receipts_data():
    output_dir = "site/assets/data/"
    os.makedirs(output_dir, exist_ok=True)

    all_voter_receipts = []
    all_projects = []

    for group, budget in GROUPS.items():
        receipts_file = f"kk26_voting/csv/KK26_Receipts_{group}.csv"
        outcome_file = f"kk26_voting/csv/KK26_Outcome_{group}.csv"
        
        if not os.path.exists(receipts_file) or not os.path.exists(outcome_file):
            print(f"  SKIP: Data for {group} not found.")
            continue

        df_receipts = pd.read_csv(receipts_file)
        df_outcome = pd.read_csv(outcome_file)
        
        # 1. Calculate final voter budgets for this group
        # Each group may have a different endowment due to the add1 completion mechanism
        num_voters = df_receipts['Voter_ID'].nunique()
        if 'Voter_Endowment' in df_receipts.columns:
            group_voter_endowment = float(df_receipts['Voter_Endowment'].iloc[0])
        else:
            # Fallback if not regenerated yet
            group_voter_endowment = budget / num_voters
        
        wallet = group_voter_endowment
        
        voter_spent = df_receipts.groupby('Voter_ID')['Amount_Paid_CHF'].sum()
        voter_remaining = {vid: float(wallet - spent) for vid, spent in voter_spent.items()}
        total_remaining = sum(voter_remaining.values())

        for voter_id, voter_df in df_receipts.groupby('Voter_ID'):
            funded = voter_df[voter_df['Funded'] == 'Yes'].copy()
            unfunded = voter_df[voter_df['Funded'] == 'No'].copy()

            items = []
            for _, row in funded.iterrows():
                items.append({
                    "title": str(row['Title']),
                    "project_id": str(row['Project_ID']),
                    "vote": str(row['Vote']),
                    "funded": True,
                    "amount": float(row['Amount_Paid_CHF']),
                })
            for _, row in unfunded.iterrows():
                reason = str(row.get('Individual_Outcome_Reason_DE', '')) if pd.notna(row.get('Individual_Outcome_Reason_DE', '')) else ''
                items.append({
                    "title": str(row['Title']),
                    "project_id": str(row['Project_ID']),
                    "vote": str(row['Vote']),
                    "funded": False,
                    "amount": 0,
                    "reason": reason,
                })

            total_spent_by_voter = float(funded['Amount_Paid_CHF'].sum())
            all_voter_receipts.append({
                "voter_id": str(voter_id),
                "group": group,
                "color": GROUP_COLORS[group],
                "wallet_per_voter": float(wallet),
                "items": items,
                "total_spent": total_spent_by_voter,
                "funded_count": int(len(funded)),
                "voted_count": int(len(voter_df)),
            })

        # --- Budget Tracking Logic ---
        # We need to know the state of each voter's budget at every step (defined by Rank)
        # 1. Map project ranks and funding status
        project_info = {} # project_id -> {rank, cost, is_funded}
        for _, p_row in df_outcome.iterrows():
            if pd.isna(p_row['Project_ID']): continue
            p_id = int(p_row['Project_ID'])
            project_info[p_id] = {
                "rank": int(p_row['Rank']),
                "cost": float(p_row['Cost_CHF']),
                "is_funded": str(p_row['MES_Winner']) == 'Yes'
            }

        # 2. Get all voter payments per project rank
        voter_payments_at_rank = {} # voter_id -> {rank -> payment}
        for _, s_row in df_receipts.iterrows():
            v_id = str(s_row['Voter_ID'])
            p_id = int(s_row['Project_ID'])
            if v_id not in voter_payments_at_rank:
                voter_payments_at_rank[v_id] = {}
            if p_id in project_info:
                rank = project_info[p_id]["rank"]
                voter_payments_at_rank[v_id][rank] = float(s_row['Amount_Paid_CHF'])

        # 3. Calculate group budget target
        target_group_budget = num_voters * group_voter_endowment
        
        # 4. Find the rank of the last funded project (the "stopping point")
        max_funded_rank = 0
        for info in project_info.values():
            if info["is_funded"]:
                max_funded_rank = max(max_funded_rank, info["rank"])
        
        # 5. Process Project Receipts using the pre-calculated steps
        for _, p_row in df_outcome.iterrows():
            if pd.isna(p_row['Project_ID']): continue
            
            p_id_int = int(p_row['Project_ID'])
            p_id = str(p_id_int)
            p_title = str(p_row['Title'])
            p_cost = float(p_row['Cost_CHF'])
            p_rank = int(p_row['Rank'])
            p_is_funded = str(p_row['MES_Winner']) == 'Yes'
            
            # THE KEY LOGIC: Use the true supporter budget from the MES algorithm (stored in outcome CSV)
            # This is the "money_behind" value that the algorithm actually used when considering this project
            snapshot_rank = p_rank

            # Get the true supporter budget from the outcome CSV (calculated by MES algorithm)
            if 'supporter_budget_at_consideration' in p_row and pd.notna(p_row['supporter_budget_at_consideration']):
                final_supporter_budget = float(p_row['supporter_budget_at_consideration'])
            else:
                # Fallback: use cost for funded, 0 for unfunded
                final_supporter_budget = p_cost if p_is_funded else 0.0

            # Find all supporters for this project
            p_supporters_df = df_receipts[df_receipts['Project_ID'] == p_id_int]

            supporters = []
            total_raised = 0

            # Calculate what was spent before this SNAPSHOT rank (for individual voter budgets display)
            group_spent_before = 0
            for other_p_id, info in project_info.items():
                if info["is_funded"] and info["rank"] < snapshot_rank:
                    group_spent_before += info["cost"]

            group_budget_at_consideration = max(0.0, target_group_budget - group_spent_before)

            for _, s_row in p_supporters_df.iterrows():
                v_id = str(s_row['Voter_ID'])
                vote = str(s_row['Vote'])

                # Only include as supporter if they actually voted positively
                if vote in ['Ja', 'EherJa']:
                    contribution = float(s_row['Amount_Paid_CHF'])
                    total_raised += contribution

                    # Calculate THIS voter's budget before the SNAPSHOT rank (for display purposes)
                    v_spent_before = 0
                    if v_id in voter_payments_at_rank:
                        for rank, payment in voter_payments_at_rank[v_id].items():
                            if rank < snapshot_rank:
                                v_spent_before += payment

                    v_budget_at_consideration = max(0.0, group_voter_endowment - v_spent_before)

                    supporters.append({
                        "voter_id": v_id,
                        "vote": vote,
                        "contribution": contribution,
                        "budget_at_consideration": v_budget_at_consideration
                    })

            all_projects.append({
                "project_id": p_id,
                "title": p_title,
                "group": group,
                "color": GROUP_COLORS[group],
                "total_cost": p_cost,
                "is_funded": p_is_funded,
                "total_raised": total_raised,
                "supporters": supporters,
                "supporter_count": len(supporters),
                "rank": p_rank,
                "total_utility": float(p_row['Total_Utility']),
                "efficiency": round(float(p_row['Cost_CHF']) / float(p_row['Total_Utility']), 2) if float(p_row['Total_Utility']) > 0 else 0,
                "mes_rho": float(p_row['MES_Rho']) if 'MES_Rho' in p_row and pd.notna(p_row['MES_Rho']) else None,
                "qualitative_rationale_de": str(p_row['Qualitative_Rationale_DE']) if pd.notna(p_row['Qualitative_Rationale_DE']) else "",
                "qualitative_rationale_en": str(p_row['Qualitative_Rationale_EN']) if pd.notna(p_row['Qualitative_Rationale_EN']) else "",
                "unified_explanation_de": str(p_row['Unified_Explanation_DE']) if 'Unified_Explanation_DE' in p_row and pd.notna(p_row['Unified_Explanation_DE']) else "",
                "unified_explanation_en": str(p_row['Unified_Explanation_EN']) if 'Unified_Explanation_EN' in p_row and pd.notna(p_row['Unified_Explanation_EN']) else "",
                "vote_counts": {
                    "ja": int(p_row['Vote_Ja']) if 'Vote_Ja' in p_row else 0,
                    "eher_ja": int(p_row['Vote_EherJa']) if 'Vote_EherJa' in p_row else 0,
                    "eher_nein": int(p_row['Vote_EherNein']) if 'Vote_EherNein' in p_row else 0,
                    "nein": int(p_row['Vote_Nein']) if 'Vote_Nein' in p_row else 0
                },
                "supporter_budget_at_consideration": final_supporter_budget,
                "group_budget_remaining": group_budget_at_consideration # Remaining at this step
            })

        print(f"  [{group}] Data processed.")

    all_voter_receipts.sort(key=lambda r: (r['group'], r['voter_id']))
    all_projects.sort(key=lambda p: (p['rank'], p['group']))

    data = {
        "generated_at": datetime.now().isoformat(),
        "organization": "Kultur Komitee Winterthur",
        "description": "Im März 2026 haben 23 Teilnehmende in drei Gruppen über die Vergabe von insgesamt 161'000 CHF an Kulturprojekte in Winterthur abgestimmt. Für die MES-Berechnung wurden die positiven Bewertungen berücksichtigt: Dabei zählte ein 'Eher Ja' als eine Stimme und ein 'Ja' als zwei Stimmen.",
        "voter_receipts": all_voter_receipts,
        "project_receipts": all_projects
    }

    out_path = os.path.join(output_dir, "kk26.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, allow_nan=False)
        f.write("\n")
    
    print(f"\n  ✅ Saved data for {len(all_voter_receipts)} voters and {len(all_projects)} projects to {out_path}")


if __name__ == "__main__":
    generate_receipts_data()
