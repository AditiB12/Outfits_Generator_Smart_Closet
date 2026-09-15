from google import genai
import io
from PIL import Image # Make sure to pip install Pillow


# Pass your new key here
client = genai.Client(
    api_key="", # [removed api key for security purposes]
    vertexai=True
)

# Test call
response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents="A high-tech smart closet with neon lighting",
    config={'response_modalities': ['IMAGE']} 
)

print("It worked! Processing image...")

# 1. Access the image data from the response
# The model returns 'parts'. We look for the one containing 'inline_data'
for part in response.candidates[0].content.parts:
    if part.inline_data:
        # 2. Convert raw bytes to an image
        image_bytes = io.BytesIO(part.inline_data.data)
        img = Image.open(image_bytes)
        
        # 3. Save and show the image
        img.save("test1_closet.png")
        print("Image saved as 'test1_closet.png'")
        img.show() # This will pop open your default image viewer
        
