import pandas as pd
import re

input_file = "../data/raw/KK26_poll-export-02.03.csv"
output_file = "../data/cleaned/KK26_poll_cleaned.csv"

# Read using latin1 to prevent encoding errors
with open(input_file, 'r', encoding='latin1') as f:
    lines = f.readlines()

# The first line is title, second is header
# Header columns (from index 1) are Voters. E.g. "FRN KK26 Vorauswahl  1" -> ID is "FRN"
header = lines[1].strip().split(';')
data_lines = lines[2:]

# Extract 3-char voter IDs from the column headers
voter_ids = [col[:3] for col in header[1:]]

# Keep the original string values instead of mapping them to numbers
vote_map = {
    'Ja': 'Ja',
    'Eher Ja': 'EherJa',
    'Eher Nein': 'EherNein',
    'Nein': 'Nein',
    '-': '',
    '': ''
}

# We want a dictionary mapping voter_id -> {project_id: vote_value}
voter_data = {v_id: {} for v_id in voter_ids}
project_ids = []

for line in data_lines:
    if not line.strip(): continue
    cols = line.strip().split(';')
    app_col = cols[0]
    
    # Process only the actual votes and ignore comments
    if 'Abstimmung' in app_col:
        # Extract the project ID from the Application column
        # Example format: "KK_26_001  Abstimmung" -> "001"
        match = re.search(r'KK_26_(\d+)', app_col)
        if match:
            proj_id = match.group(1)
        else:
            # Fallback if format is slightly different
            proj_id = app_col.replace('Abstimmung', '').strip()
            
        project_ids.append(proj_id)
        
        # Go through each voter's vote for this project
        for i, v_id in enumerate(voter_ids):
            col_idx = i + 1
            if col_idx < len(cols):
                val = cols[col_idx].strip()
                voter_data[v_id][proj_id] = vote_map.get(val, val)
            else:
                voter_data[v_id][proj_id] = ''

# Convert to DataFrame
df = pd.DataFrame.from_dict(voter_data, orient='index')

# reset_index makes the index (Voter_ID) a column named 'index'
df = df.reset_index()
df = df.rename(columns={'index': 'Voter_ID'})

# Reorder columns: Voter ID first, followed by all projects in order
columns = ['Voter_ID'] + project_ids
df = df[columns]

# Export to CSV with semicolon delimiter (common for German Excel)
df.to_csv(output_file, index=False, sep=';', encoding='utf-8')

print(f"Cleaned data successfully saved to: {output_file}")
print("Values kept as Ja, EherJa, EherNein, Nein\n")
print(f"Total voters: {len(df)}")
print(f"Total projects: {len(project_ids)}\n")
print("First 5 rows:")
print(df.head())
