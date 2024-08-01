import requests
import re
import csv
import argparse
import os
from youtube_transcript_api import YouTubeTranscriptApi
import os

def save_youtube_transcript(video_id, filename):
    try:
        script = YouTubeTranscriptApi.get_transcript(video_id)
        text_only = ' '.join([item['text'] for item in script])
        file_path = os.path.join(os.getcwd(), filename)
        with open(file_path, 'w', encoding='utf-8') as file:
            file.write(text_only)
        print("Transcript saved successfully at:", file_path)
        return file_path
    except Exception as e:
        print("An error occurred while saving the transcript:", e)
        return None


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
parser.add_argument('transcript', type=str, help='Trancript for Youtube Projects')
args = parser.parse_args()

url = "http://localhost:3000/clicked"
payload = {"url": args.link, "transcript":args.transcript, "title":args.title} 

response = requests.post(url, json=payload)

print("Response status code:", response.status_code)
print("Response content:", response.text)

response_content = response.text

pattern = re.compile(r'Alternative: ([^|]+) \| [^~]+ ~ ([A-Za-z0-9_\-]+)')


matches = re.findall(pattern, response_content)

parsed_data = []

for match in matches:
    username = match[0]
    commentID = match[1]
    parsed_data.append((commentID, username, response_content))

results_dir = 'results'  
project_directory = os.path.join(results_dir, args.title)  
if not os.path.exists(project_directory):
    os.makedirs(project_directory) 

csv_file_path = find_next_available_filename(project_directory, f"{args.title}_parsed_data", "csv")


with open(csv_file_path, mode='w', newline='') as csv_file:
    fieldnames = ['ID', 'alternative', 'GPT Output']
    writer = csv.DictWriter(csv_file, fieldnames=fieldnames, delimiter=';')

    # Write the header row
    writer.writeheader()

    # Correct the order of writing data to match fieldnames
    for data in parsed_data:
        writer.writerow({'ID': data[0], 'alternative': data[1], 'GPT Output': data[2]})

print(f"Data has been saved to {csv_file_path}")
