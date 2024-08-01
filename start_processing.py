import pandas as pd
from urllib.parse import urlparse, unquote, parse_qs
import subprocess
import time
import requests
from youtube_transcript_api import YouTubeTranscriptApi
from process_video_module import process_video
import os


file_path = 'links.csv'
df = pd.read_csv(file_path)
comparator_script = 'comparator.py'
ground_truth_script = 'ground_truth.js'
similarity_script = 'similarity.py' 

def is_server_ready(url):
    try:
        response = requests.get(url)
        if response.status_code == 200:
            return True
    except requests.ConnectionError:
        return False
    return False

# Start the Node.js server
node_server_process = subprocess.Popen("node combined.js", shell=True)
print("Starting Node.js server...")

# Check if the server is ready
server_url = 'http://localhost:3000/'
max_attempts = 10
for attempt in range(max_attempts):
    if is_server_ready(server_url):
        print("Node.js server is ready.")
        break
    print("Waiting for the server to become ready...")
    time.sleep(1)
else:
    print("Failed to connect to the Node.js server.")
    node_server_process.terminate()  # Stop the server if it's not ready
    exit(1) 

def save_youtube_transcript(video_id, filename):
    """
    Fetches the transcript of a YouTube video and saves it to a text file.

    Parameters:
    video_id (str): The YouTube video ID.
    filename (str): The name of the file to save the transcript to.

    Returns:
    str: The file path where the transcript was saved.
    """
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

# Function to process each URL, run subprocesses, and return the corresponding string (title).
def process_url(url):
    try:
        url2 = url.rstrip('/')
        parsed_url = urlparse(url2)
        title = ''
        transcript = ''
        if 'youtube.com' in parsed_url.netloc:
            query_params = parse_qs(parsed_url.query)
            if 'v' in query_params:
                title = query_params['v'][0]
                transcript_path = save_youtube_transcript(title, f'{title}_transcript.txt')
                with open(transcript_path, 'r', encoding='utf-8') as file:
                    transcript = file.read()
                process_video(title, url)
            else:
                raise ValueError("YouTube video ID not found in URL")
        elif 'thingiverse.com' in parsed_url.netloc and '/thing:' in parsed_url.path:
            title = 'thing_' + parsed_url.path.split('/thing:')[1]
        else:
            unquoted_path = unquote(parsed_url.path)
            title = unquoted_path.split('/')[-1]

        script_arguments_comparator = [url, title, transcript]
        script_arguments= [url, title]
        command = ['python', comparator_script] + script_arguments_comparator
        try:
            print('here')
            subprocess.run(command, check=True)
            print('First Process')
        except subprocess.CalledProcessError as e:
            print(f"Error running the python script: {e}")

        command = ['node', ground_truth_script] + script_arguments
        try:
            subprocess.run(command, check=True)
            print('Second Process')
        except subprocess.CalledProcessError as e:
            print(script_arguments)
            print(f"Error running the node.js script: {e}")

        similarity_command = ['python', similarity_script, title]
        try:
            subprocess.run(similarity_command, check=True)
            print('Third Process')
        except subprocess.CalledProcessError as e:
            print(f"Error running the similarity script: {e}")

        return title

    except Exception as e:
        print(f"Error processing URL {url}: {e}")
        return f"Error: Unable to extract title for {url}"



if __name__ == "__main__":
    # Apply the function to the 'URL' column and store the result in a new column named 'title'
    df['title'] = df['URL'].apply(process_url)

    # Save the updated DataFrame to a new CSV file
    output_file_path = 'links.csv'
    df.to_csv(output_file_path, index=False)

    # Stop the Node.js server after processing is complete
    node_server_process.terminate()
    print(f"Processed data saved to {output_file_path}")
