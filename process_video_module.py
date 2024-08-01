import sys
from pytube import YouTube
import os
import numpy as np
from PIL import Image
import ffmpeg
import base64
from io import BytesIO
sys.path.append(os.path.join(os.path.dirname(__file__), 'TransNetV2', 'inference'))
from transnetv2 import TransNetV2

def process_video(title, youtube_url):
    try:

        base_name = title
        video_images_dir = os.path.join(os.getcwd(), 'video_images', base_name)
        os.makedirs(video_images_dir, exist_ok=True)

        yt = YouTube(youtube_url)
        stream = yt.streams.filter(progressive=True, file_extension='mp4').first()
        video_path = stream.download(output_path=video_images_dir)  # Download to video_images/{base_name}
      
        model = TransNetV2()

        
        high_res_frames_folder = os.path.join(os.getcwd(), "high_res_frames")
        
        os.makedirs(high_res_frames_folder, exist_ok=True)

        try:
            ffmpeg.input(video_path).output(
                os.path.join(high_res_frames_folder, 'frame_%05d.png'), 
                format='image2'
            ).run()
            print("High-resolution frames extracted successfully.")
        except ffmpeg.Error as e:
            print(f"Error while extracting high-resolution frames: {e.stderr.decode('utf-8', errors='ignore')}")
            sys.exit(1)

        try:
            video_frames, single_frame_predictions, all_frame_predictions = model.predict_video(video_path)
            print("Predictions made successfully.")
        except Exception as e:
            print(f"Error while making predictions: {e}")
            sys.exit(1)


        try:
            scenes = model.predictions_to_scenes(single_frame_predictions)
            print("Scenes extracted successfully.")
        except Exception as e:
            print(f"Error while extracting scenes: {e}")
            sys.exit(1)

        try:
            visualization = model.visualize_predictions(video_frames, predictions=(single_frame_predictions, all_frame_predictions))
            print("Predictions visualized successfully.")
        except Exception as e:
            print(f"Error while visualizing predictions: {e}")
            sys.exit(1)

        current_directory = os.getcwd()
        data_urls = []
        base_name = title


        predictions_file = os.path.join(video_images_dir, base_name + ".pre.txt")
        
        scenes_file = os.path.join(video_images_dir, base_name  + ".scs.txt")
        
        visualization_file = os.path.join(video_images_dir, base_name  + ".vis.png")
        
        # Save the files if they do not already exist
        if not os.path.exists(predictions_file):
            np.savetxt(predictions_file, single_frame_predictions, fmt="%.6f")
            print(f"Predictions saved to {predictions_file}")
        else:
            print(f"Predictions file {predictions_file} already exists. Skipping saving.")

        if not os.path.exists(scenes_file):
            np.savetxt(scenes_file, scenes, fmt="%d")
            print(f"Scenes saved to {scenes_file}")
        else:
            print(f"Scenes file {scenes_file} already exists. Skipping saving.")

        if not os.path.exists(visualization_file):
            visualization.save(visualization_file)
            print(f"Visualization saved to {visualization_file}")
        else:
            print(f"Visualization file {visualization_file} already exists. Skipping saving.")

        # Function to generate data URL for PNG file
        def generate_data_url(file_path):
            with open(file_path, 'rb') as f:
                image_data = f.read()
                base64_image_string = base64.b64encode(image_data).decode('utf-8')
                data_url = 'data:image/png;base64,' + base64_image_string
            return data_url

        
        # Create data_urls_file to store data URLs
        data_urls_file = open(os.path.join(video_images_dir, base_name + "_data_urls.txt"), 'w')
        data_urls = []
        print(data_urls)
        # Read scene transition frames from the scenes file and save the middle frame per scene transition
        frames_folder = os.path.join(video_images_dir, "frames_high_res2")
        os.makedirs(frames_folder, exist_ok=True)

        with open(scenes_file, 'r') as file:
            scene_transitions = np.loadtxt(file, dtype=int)
        
        # Select indices uniformly across the scenes
        selected_indices = np.linspace(0, len(scene_transitions) - 1, num=min(30, len(scene_transitions)), dtype=int)

        for idx in selected_indices:
            start_frame, end_frame = scene_transitions[idx]

            # Choose the middle frame of the scene transition
            middle_frame = (start_frame + end_frame) // 2

            # Load the high-resolution middle frame
            frame_filename = os.path.join(high_res_frames_folder, f'frame_{middle_frame:05d}.png')
            high_res_frame = Image.open(frame_filename)

            # Save the frame without resizing
            frame_output_filename = os.path.join(frames_folder, f'scene_{middle_frame}_frame.png')
            high_res_frame.save(frame_output_filename)

            # Generate data URL for the frame and add to the list
            data_url = generate_data_url(frame_output_filename)
            data_urls_file.write(data_url + '\n')

        data_urls_file.close()



        print("Middle frame per scene transition saved successfully.")
        print("Data URLs generated successfully.")
    except Exception as e:
        print(f"An error occurred: {e}")
        return []
    


