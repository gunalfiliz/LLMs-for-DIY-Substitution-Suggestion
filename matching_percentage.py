import pandas as pd
import argparse
import os

def find_latest_counter(folder_path, base_name):
    counters = []
    for filename in os.listdir(folder_path):
        if filename.startswith(f"{base_name}_parsed_data") and filename.endswith(".csv"):
            parts = filename.split(f"{base_name}_parsed_data")[1].split(".csv")[0]
            try:
                counters.append(int(parts))
            except ValueError:
                continue 
    return max(counters, default=0) 


parser = argparse.ArgumentParser(description='Process a title.')
parser.add_argument('title', type=str, help='The project title to process')
args = parser.parse_args()

project_name = args.title
results_dir = 'results'
folder_path = os.path.join(results_dir, project_name) + '/'

if not os.path.exists(folder_path):
    os.makedirs(folder_path)

counter = find_latest_counter(folder_path, project_name) 

ground_truth_filename = os.path.join(folder_path, f"{project_name}_ground_truth.csv")
parsed_data_filename = os.path.join(folder_path, f"{project_name}_parsed_data{counter}.csv")
results_filename = os.path.join(folder_path, f"{project_name}_results{counter}.csv")

print(f"Accessing ground truth file at: {ground_truth_filename}")
print(f"Accessing parsed data file at: {parsed_data_filename}")

ground_truth_df = pd.read_csv(ground_truth_filename,  delimiter=';', usecols=['ID', 'original'])
parsed_data_df = pd.read_csv(parsed_data_filename,  delimiter=';')
print(f"ground truth df: {ground_truth_df}")
print(f"parsed data df: {parsed_data_df}")

merged_df = pd.merge(ground_truth_df, parsed_data_df, on='ID')
print(f"merged data df: {merged_df}")

def calculate_matching_percentage(original, alternative):
    original_words = set(original.split())
    alternative_words = set(alternative.split())
    matching_words = original_words.intersection(alternative_words)
    
    if len(alternative_words) == 0:
        return 0
    return (len(matching_words) / len(alternative_words)) * 100



if not merged_df.empty:
    merged_df['Matching Percentage'] = merged_df.apply(lambda row: calculate_matching_percentage(row['original'], row['alternative']), axis=1)
    print(merged_df[['ID', 'Matching Percentage']])
    merged_df.to_csv(results_filename, index=False, sep=';')
    print(f"Results have been saved to {results_filename}")
else:
    print("Merged DataFrame is empty. No matching records found.")
