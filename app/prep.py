import sys
import json
import pandas as pd
from urllib.parse import urlparse, unquote, parse_qs
from youtube_transcript_api import YouTubeTranscriptApi
import os



def save_youtube_transcript(video_id, filename):
    try:
        script = YouTubeTranscriptApi.get_transcript(video_id)
        text_only = ' '.join([item['text'] for item in script])
        transcripts_dir = os.path.join(os.getcwd(), 'transcripts')
        if not os.path.exists(transcripts_dir):
            os.makedirs(transcripts_dir)
        file_path = os.path.join(transcripts_dir, filename)
        with open(file_path, 'w', encoding='utf-8') as file:
            file.write(text_only)
        return file_path
    except Exception as e:
        print("An error occurred while saving the transcript:", e)
        return None
    

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
            else:
                raise ValueError("YouTube video ID not found in URL")
        else:
            unquoted_path = unquote(parsed_url.path)
            title = unquoted_path.split('/')[-1]
        return url, title, transcript

    except Exception as e:
        print(f"Error processing URL {url}: {e}")
        return f"Error: Unable to extract title for {url}"


if __name__ == "__main__":
    url = sys.argv[1]
    url, title, transcript = process_url(url)
    result = {
        "url": url,
        "title": title,
        "transcript": transcript
    }
    print(json.dumps(result))
