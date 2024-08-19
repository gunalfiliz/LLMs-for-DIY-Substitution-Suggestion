import requests
import re
import csv
import argparse
import os
from youtube_transcript_api import YouTubeTranscriptApi
import os

def find_next_available_filename(base_path, base_name, extension):
    counter = 1
    while True:
        full_path = os.path.join(base_path, f"{base_name}{counter}.{extension}")
        if not os.path.exists(full_path):
            return full_path
        counter += 1

parser = argparse.ArgumentParser(description='Fetch data and save to CSV based on title.')
parser.add_argument('link', type=str, help='The URL to fetch data from')
parser.add_argument('title', type=str, help='The project title to name the directory and file')
args = parser.parse_args()

url = "http://localhost:3000/clicked"
payload = {"url": args.link, "title":args.title} 

response = requests.post(url, json=payload)

print("Response status code:", response.status_code)
print("Response content:", response.text)

response_content = response.text



pattern = re.compile(r'\d+\.\s*(.*?) \(Alternative: ([^|]+) \| ([^~]+) ~ ([A-Za-z0-9_\-]+)\)', re.MULTILINE)
matches = re.findall(pattern, response_content)
print("This is the matches:", matches)

parsed_data = []

for match in matches:
    original = match[0]
    alternative = match[1]
    username = match[2]
    commentID = match[3]
    parsed_data.append((original, alternative, username, commentID, response_content))

print("Parsed data:", parsed_data)

results_dir = 'results'  
project_directory = os.path.join(results_dir, args.title)  
if not os.path.exists(project_directory):
    os.makedirs(project_directory)  

response_file_path = os.path.join(project_directory, 'response_content.txt')

# Save the response content
with open(response_file_path, 'w', encoding='utf-8') as file:
    file.write(response_content)
print(f"Data has been saved to {response_file_path}")

csv_file_path = find_next_available_filename(project_directory, f"{args.title}_parsed_data", "csv")
with open(csv_file_path, mode='w', newline='') as csv_file:
    fieldnames = ['Comment ID', 'Author LLM', 'Object LLM','Substitute LLM', 'GPT Output']
    writer = csv.DictWriter(csv_file, fieldnames=fieldnames, delimiter=';')
    writer.writeheader()
    for data in parsed_data:
        writer.writerow({'Comment ID': data[3], 'Author LLM': data[2], 'Object LLM': data[0] , 'Substitute LLM': data[1], 'GPT Output': data[4]})
print(f"Data has been saved to {csv_file_path}")
