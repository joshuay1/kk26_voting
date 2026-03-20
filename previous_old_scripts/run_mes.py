import pandas as pd
from mes import equal_shares

# Load the cleaned data
df = pd.read_csv("../data/cleaned/KK26_poll_cleaned.csv", sep=';')
voters = df['Voter_ID'].tolist()
projects = [col for col in df.columns if col != 'Voter_ID']
cost = {p: 1 for p in projects}
total_budget = 80

# Utility for MES: Ja = 2, EherJa = 1, EherNein = 0, Nein = 0
utility_map = {
    'Ja': 2,
    'EherJa': 1,
    'EherNein': 0,
    'Nein': 0
}

# Score for tie-breaking: Ja=2, EherJa=1, EherNein=-1, Nein=-2
score_map = {
    'Ja': 2,
    'EherJa': 1,
    'EherNein': -1,
    'Nein': -2
}

u = {voter: {} for voter in voters}
tie_breaker_scores = {}

# Compute metrics per project across all voters
for p in projects:
    total_score = 0
    valid_votes = 0
    for index, row in df.iterrows():
        voter = row['Voter_ID']
        val = row[p]
        if pd.isna(val) or val == '':  # Empty vote = 0 utility
            u[voter][p] = 0
        else:
            val_str = str(val).strip()
            u[voter][p] = utility_map.get(val_str, 0)
            if val_str in score_map:
                total_score += score_map[val_str]
                valid_votes += 1
                
    # Mean score used for tie-breaking
    tie_breaker_scores[p] = total_score / valid_votes if valid_votes > 0 else 0

try:
    # Run MES to find the initial set of winners
    winners = equal_shares(voters, projects, cost, u, total_budget, tie_breaker_scores)
    
    print("Algorithm run complete.")
    print(f"Algorithm stopped with {len(winners)} projects funded within voter budgets.")
    
    # Need exactly 80 projects. If MES couldn't reach 80 because of exhausting individual discrete budgets,
    # fill the remaining slots greedily using the tie-breaker aggregated mean score.
    remaining_slots = total_budget - len(winners)
    not_selected = [p for p in projects if p not in winners]
    # Sort all unselected projects by highest tie_breaker_score then lexicographically
    not_selected.sort(key=lambda p: (tie_breaker_scores[p], p), reverse=True)
    
    # We still want the full ranking of all projects
    full_ranking = winners + not_selected

    # Create the ranked table
    res = []
    for i, w in enumerate(full_ranking):
        res.append({
            'Rank': i + 1,
            'Project': w,
            'Total Utility': sum(u[v][w] for v in voters),
            'Mean Score': round(tie_breaker_scores[w], 3),
            'Funded (Top 80)': 'Yes' if i < total_budget else 'No',
            'MES Winner': 'Yes' if w in winners else 'No'
        })
        
    res_df = pd.DataFrame(res)
    
    print("\n" + "="*50)
    print("ALL PROJECTS RANKED (MES -> Mean Score Tie-Breaker)")
    print("="*50)
    print(res_df.head(10).to_string(index=False)) # Just print top 10 to terminal
    print(f"\n... (Showing top 10 of {len(res_df)} projects)")
    
    res_df.to_csv("../kk26_voting/csv/KK26_MES_All_In_Order.csv", index=False)
    print(f"\nSaved detailed ranking of ALL {len(full_ranking)} projects to ../kk26_voting/csv/KK26_MES_All_In_Order.csv")

except Exception as e:
    import traceback
    traceback.print_exc()
