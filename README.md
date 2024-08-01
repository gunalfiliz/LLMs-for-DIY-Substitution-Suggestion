# LLMs-for-DIY-Substitution-Suggestion
This repository is a part of my master thesis that investigates the use of LLMs for DIY Substitution Suggestion

# Maker Project Comment Analysis

This project identifies substitution suggestions made in the comments from various platforms (YouTube and Instructables) using Large Language Models (LLMs) and analyze the performance using different scoring metrics such as BERT and ROUGE score.

## Overview

The project consists of several components:

- **Server-side application:** Fetches and processes comments from different platforms.
- **Client-side web interface:** Provides an easy way to submit URLs for analysis.
- **Python scripts:** Further process and analyze the fetched data.
- **Scoring scripts:** Evaluate processed comments using similarity metrics.

## Features

- Fetches comments from YouTube, Instructables, and Thingiverse.
- Processes and analyzes comments using LLMs.
- Calculates similarity scores using ROUGE-L and BERTScore.
- Provides a web interface for easy URL submission.
- Saves processed data in CSV format.

## Requirements

- **Node.js**
- **Python 3.x**
- Various Node.js and Python packages (see `package.json` and `requirements.txt`).

## Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/gunalfiliz/LLMs-for-DIY-Substitution-Suggestion.git
   ```

2. Install Node.js dependencies:

   ```bash
   npm install
   ```

4. Set up environment variables:
   - Create a `.env` file in the root directory.
   - Add your YouTube API key: `YOUTUBE_API_KEY=your_api_key_here`.
   - Add your OpenAI API key: `OPENAI_API_KEY=your_api_key_here`.

## Usage

### Starting the Server

1. Run the Node.js server:

   ```bash
   node server.js
   ```

2. The server will start on `http://localhost:3000`.

### Using the Web Interface

1. Open a web browser and go to `http://localhost:3000`.
2. Enter the URL of the maker project in the input field.
3. Click "Submit" to process the URL.

### Running the Python Script

1. Use the following command to run the Python script:

   ```bash
   python process_comments.py <url> <project_title> <transcript>
   ```

   - `<url>`: The URL of the maker project.
   - `<project_title>`: The title of the project (used for file naming).
   - `<transcript>`: The transcript for YouTube projects (use "None" for non-YouTube projects).

## Project Structure

- **`server.js`**: Main server file handling comment fetching and processing.
- **`index.html`**: Web interface for URL submission.
- **`process_comments.py`**: Python script for further processing and analysis.
- **`score_comments.py`**: Script for calculating similarity scores.
- **`results/`**: Directory where processed data is saved.

## Output

The project generates CSV files containing:

- **Original comments**
- **Processed alternatives**
- **GPT output**
- **Similarity scores** (ROUGE-L and BERTScore)

