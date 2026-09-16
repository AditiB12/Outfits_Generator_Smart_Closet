import os
from google import genai
from google.genai import types
from PIL import Image
import io

# 1. Setup the Client
# 
# No need to pass the key; it's pulled from the environment!
client = genai.Client(
    api_key="", # put api key here
    vertexai=True,
    # location="us-central1"
    )
# client = genai.Client(api_key="")

MODEL_ID = "gemini-2.5-flash-image" # The original Nano Banana

def combine_images(person_path, clothing_path_1, output_path):
    # 2. Prepare the images
    with open(person_path, "rb") as f:
        person_img = types.Part.from_bytes(data=f.read(), mime_type="image/jpeg")
        
    with open(clothing_path_1, "rb") as f:
        clothing_img_1 = types.Part.from_bytes(data=f.read(), mime_type="image/jpeg")

    # 3. Create the prompt
    prompt = (
        "Using the two provided images, create a brand new composite scene. "
        "Take the sweatshirt from the second image and place it on the person in the first image. "
        "Ensure the sweatshirt fits naturally with realistic folds and matches the lighting of the person's photo."
    )

    # 4. Generate the content
    response = client.models.generate_content(
        model=MODEL_ID,
        contents=[person_img, clothing_img_1, prompt],
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
        )
    )

    # 5. Save the result with a Check
    if not response.candidates:
        print("Error: The model returned no candidates. This is likely a safety filter block.")
        # Check the 'prompt_feedback' to see why
        print(f"Safety Feedback: {response.prompt_feedback}")
        return

    # 5. Save the result
    for part in response.candidates[0].content.parts:
        if part.inline_data:
            image_data = io.BytesIO(part.inline_data.data)
            final_img = Image.open(image_data)
            final_img.save(output_path)
            print(f"Success! Image saved to {output_path}")

# Run the function
combine_images("img/woman.jpg", "img/illinois_hoodie.png", "result.png")
