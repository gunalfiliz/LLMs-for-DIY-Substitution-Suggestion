import pandas as pd
from urllib.parse import urlparse, unquote, parse_qs
import subprocess
import time
import requests
import os

file_path = 'links.csv'
df = pd.read_csv(file_path)
comparator_script = 'comparator.py'
ground_truth_script = 'ground_data.js'
similarity_script = 'analysis.py' 

def is_server_ready(url):
    try:
        response = requests.get(url)
        if response.status_code == 200:
            return True
    except requests.ConnectionError:
        return False
    return False

script_path = os.path.join(os.path.dirname(__file__), '..', 'app', 'index.js')
working_directory = os.path.join(os.path.dirname(__file__), '..', 'app')
node_server_process = subprocess.Popen(
    ["node", script_path],
    cwd=working_directory,  
    shell=False  
)
print("Starting Node.js server...")


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
    node_server_process.terminate()
    exit(1)


def process_url(url):
    try:
        url2 = url.rstrip('/')
        parsed_url = urlparse(url2)
        title = ''
        if 'youtube.com' in parsed_url.netloc:
            query_params = parse_qs(parsed_url.query)
            if 'v' in query_params:
                title = query_params['v'][0]
            else:
                raise ValueError("YouTube video ID not found in URL")
        else:
            unquoted_path = unquote(parsed_url.path)
            title = unquoted_path.split('/')[-1]

        script_arguments= [url, title]
        command = ['python', comparator_script] + script_arguments
        try:
            subprocess.run(command, check=True)
        except subprocess.CalledProcessError as e:
            print(f"Error running the python script: {e}")

        command = ['node', ground_truth_script] + script_arguments
        try:
            subprocess.run(command, check=True)
        except subprocess.CalledProcessError as e:
            print(script_arguments)
            print(f"Error running the node.js script: {e}")

        similarity_command = ['python', similarity_script, title]
        try:
            subprocess.run(similarity_command, check=True)
        except subprocess.CalledProcessError as e:
            print(f"Error running the similarity script: {e}")

        return title

    except Exception as e:
        print(f"Error processing URL {url}: {e}")
        return f"Error: Unable to extract title for {url}"



if __name__ == "__main__":
    df['title'] = df['URL'].apply(process_url)
    output_file_path = 'links.csv'
    df.to_csv(output_file_path, index=False)
    node_server_process.terminate()
    print(f"Processed data saved to {output_file_path}")
