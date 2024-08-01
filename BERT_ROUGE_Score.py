import os
import pandas as pd
from pathlib import Path
from rouge_score import rouge_scorer
from bert_score import score as bert_score

def process_csv(file_path):
    try:
        df = pd.read_csv(file_path, delimiter=';')
    except pd.errors.ParserError as e:
        print(f"Error parsing the CSV file {file_path}: {e}")
        return

    scorer = rouge_scorer.RougeScorer(['rougeL'], use_stemmer=True)

    rougeL_precisions = []
    rougeL_recalls = []
    rougeL_f1_scores = []

    bert_precision_scores = []
    bert_recall_scores = []
    bert_f1_scores = []

    for index, row in df.iterrows():
        original_comment = row['original']
        suggested_alternative = row['alternative']
        try:
            rouge_score_result = scorer.score(original_comment, suggested_alternative)
            rougeL_precisions.append(rouge_score_result['rougeL'].precision)
            rougeL_recalls.append(rouge_score_result['rougeL'].recall)
            rougeL_f1_scores.append(rouge_score_result['rougeL'].fmeasure)
        except Exception as e:
            print(f"Error computing ROUGE-L score for index {index} in {file_path}: {e}")
            rougeL_precisions.append(None)
            rougeL_recalls.append(None)
            rougeL_f1_scores.append(None)
        
        try:
            P, R, F1 = bert_score([suggested_alternative], [original_comment], lang='en', verbose=False)
            bert_precision_scores.append(P.mean().item())
            bert_recall_scores.append(R.mean().item())
            bert_f1_scores.append(F1.mean().item())
        except Exception as e:
            print(f"Error computing BERTScore for index {index} in {file_path}: {e}")
            bert_precision_scores.append(None)
            bert_recall_scores.append(None)
            bert_f1_scores.append(None)

    df['ROUGE-L Precision'] = rougeL_precisions
    df['ROUGE-L Recall'] = rougeL_recalls
    df['ROUGE-L F1-Score'] = rougeL_f1_scores

    df['BERT Precision'] = bert_precision_scores
    df['BERT Recall'] = bert_recall_scores
    df['BERT F1-Score'] = bert_f1_scores

    output_file_path = file_path.with_name(file_path.stem + '_with_all_scores.csv')
    
    try:
        df.to_csv(output_file_path, index=False, sep=';')
        print(f"Results successfully saved to {output_file_path}")
    except OSError as e:
        print(f"Error saving the CSV file {output_file_path}: {e}")


    print("Updated DataFrame with Scores:")
    print(df.head())

def main():
  # Change the path
    base_dir = Path('C:/Users/Filiz/Desktop/thesis/thesis-filiz-guenal-llm-substitution-comments/results/with_matching')

    for root, dirs, files in os.walk(base_dir):
        for file in files:
            if file.endswith('_results1.csv'):
                file_path = Path(root) / file
                process_csv(file_path)

if __name__ == "__main__":
    main()
