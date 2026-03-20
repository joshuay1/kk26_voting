import pandas as pd
import glob
import os

input_files = glob.glob("raw_data/stimmen-export-application-*.xlsx")
output_dir = "data/cleaned/"

os.makedirs(output_dir, exist_ok=True)

vote_map = {
    'Ja': 'Ja',
    'Eher Ja': 'EherJa',
    'Eher Nein': 'EherNein',
    'Nein': 'Nein',
    '-': '',
    '': '',
    float('nan'): ''
}

for input_file in input_files:
    basename = os.path.basename(input_file)
    group_name = basename.split('_')[-1].replace('.xlsx', '')
    output_file = os.path.join(output_dir, f"KK26_poll_cleaned_{group_name}.csv")
    
    print(f"Processing {input_file} for group {group_name}")
    
    # Read the excel file without headers
    df = pd.read_excel(input_file, header=None)
    
    # Second row (index 1) has the voter names starting from column 1
    voter_names = df.iloc[1, 1:].tolist()
    # Extract 3 char ID (e.g. " ROM KK26 BLAU" -> "ROM")
    voter_ids = [str(name).strip()[:3] for name in voter_names if pd.notna(name)]
    
    # voter_data: voter_id -> {project_id: vote_value}
    voter_data = {v_id: {} for v_id in voter_ids}
    # project_comments: project_id -> list of non-empty comments
    project_comments = {}
    project_ids = []
    
    # The actual data starts at index 2
    for index in range(2, len(df)):
        row = df.iloc[index]
        app_col = str(row.iloc[0])
        
        if 'Stimme' in app_col:
            proj_id = app_col.replace('Stimme', '').replace('KK_26_', '').strip()
            project_ids.append(proj_id)
            for i, v_id in enumerate(voter_ids):
                col_idx = i + 1 
                if col_idx < len(row):
                    val = row.iloc[col_idx]
                    voter_data[v_id][proj_id] = vote_map.get(str(val).strip(), str(val).strip()) if pd.notna(val) else ''
                else:
                    voter_data[v_id][proj_id] = ''
        
        elif 'Kommentar' in app_col:
            proj_id = app_col.replace('Kommentar', '').replace('KK_26_', '').strip()
            if proj_id not in project_comments:
                project_comments[proj_id] = []
            
            for i, v_id in enumerate(voter_ids):
                col_idx = i + 1
                if col_idx < len(row):
                    comment = row.iloc[col_idx]
                    if pd.notna(comment) and str(comment).strip() != '':
                        project_comments[proj_id].append(str(comment).strip())

    # Save cleaned votes CSV
    out_df = pd.DataFrame.from_dict(voter_data, orient='index')
    out_df = out_df.reset_index().rename(columns={'index': 'Voter_ID'})
    out_df[['Voter_ID'] + project_ids].to_csv(output_file, index=False, sep=';', encoding='utf-8')
    
    # Save project comments to a separate JSON for the summary script
    import json
    comments_file = os.path.join(output_dir, f"KK26_comments_{group_name}.json")
    with open(comments_file, 'w', encoding='utf-8') as f:
        json.dump(project_comments, f, ensure_ascii=False, indent=2)
    
    print(f"Cleaned data for {group_name} saved to: {output_file}")
    print(f"Comments for {group_name} saved to: {comments_file}")
    print(f"Total voters: {len(voter_ids)}")
    print(f"Total projects: {len(project_ids)}\n")
