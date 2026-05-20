import os
import io
import json
import imghdr
import base64
import sqlite3
import urllib.request
from datetime import date
from flask import Flask, request, jsonify, send_file
from google import genai
from google.genai import types
from google.genai.types import GenerateContentConfig, Modality
from PIL import Image
from flask_cors import CORS

# ── Vertex AI setup ───────────────────────────────────────────────────────────
# os.environ["GOOGLE_CLOUD_PROJECT"]      = ""
os.environ["GOOGLE_CLOUD_LOCATION"]     = "us-central1"
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

client      = genai.Client()
IMAGE_MODEL = "gemini-2.5-flash-image"
TEXT_MODEL  = "gemini-2.5-flash"

app = Flask(__name__)
CORS(app)

DB_PATH = "closet.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS clothing_items (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            category    TEXT,
            color       TEXT,
            image_path  TEXT,
            date_added  TEXT,
            wear_count  INTEGER DEFAULT 0,
            last_worn   TEXT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS outfit_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            item_ids    TEXT,
            date_worn   TEXT
        )
    """)
    conn.commit()
    conn.close()

def save_image(b64_string, filename):
    img_data = base64.b64decode(b64_string)
    path = f"img/{filename}"
    os.makedirs("img", exist_ok=True)
    with open(path, "wb") as f:
        f.write(img_data)
    return path

# Gemini sometimes wraps JSON in ```json ... ``` markdown blocks.
# This strips that wrapping before parsing.
def parse_gemini_json(text):
    cleaned = text.strip().replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)

@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "Smart Closet backend is running"})

@app.route("/image/<path:filename>", methods=["GET"])
def get_image(filename):
    return send_file(filename, mimetype="image/jpeg")

@app.route("/classify", methods=["POST"])
def classify():
    data      = request.get_json()
    b64_img   = data.get("image")
    filename  = data.get("filename", "item.jpg")

    image_path = save_image(b64_img, filename)

    with open(image_path, "rb") as f:
        img_part = types.Part.from_bytes(data=f.read(), mime_type="image/jpeg")

    prompt = (
        "Look at this clothing item. "
        "Respond ONLY with valid JSON, no markdown, no backticks, no extra text: "
        '{"category": "...", "color": "..."} '
        "Category must be one of: t-shirt, shirt, pants, dress, jacket, skirt, shoes, accessory, other. "
        "Color should be the dominant color as a simple word e.g. red, blue, black."
    )

    response = client.models.generate_content(
        model=TEXT_MODEL,
        contents=[img_part, prompt]
    )

    try:
        result = parse_gemini_json(response.text)
    except json.JSONDecodeError:
        result = {"category": "other", "color": "unknown"}

    result["image_path"] = image_path
    return jsonify(result)

@app.route("/inventory", methods=["POST"])
def add_item():
    data = request.get_json()
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        INSERT INTO clothing_items (category, color, image_path, date_added)
        VALUES (?, ?, ?, ?)
    """, (data["category"], data["color"], data["image_path"], str(date.today())))
    conn.commit()
    item_id = c.lastrowid
    conn.close()
    return jsonify({"id": item_id, "message": "Item added"})

@app.route("/inventory", methods=["GET"])
def get_inventory():
    conn  = sqlite3.connect(DB_PATH)
    c     = conn.cursor()
    c.execute("SELECT * FROM clothing_items")
    rows  = c.fetchall()
    conn.close()
    items = [
        {"id": r[0], "category": r[1], "color": r[2],
         "image_path": r[3], "date_added": r[4],
         "wear_count": r[5], "last_worn": r[6]}
        for r in rows
    ]
    return jsonify(items)

# 6. Delete a clothing item
@app.route("/inventory/<int:item_id>", methods=["DELETE"])
def delete_item(item_id):
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    # Get image path so we can delete the file too
    c.execute("SELECT image_path FROM clothing_items WHERE id = ?", (item_id,))
    row = c.fetchone()
    if row:
        image_path = row[0]
        if os.path.exists(image_path):
            os.remove(image_path)
    c.execute("DELETE FROM clothing_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Item deleted"})

@app.route("/log-outfit", methods=["POST"])
def log_outfit():
    data     = request.get_json()
    item_ids = ",".join(str(i) for i in data["item_ids"])
    conn     = sqlite3.connect(DB_PATH)
    c        = conn.cursor()
    c.execute("INSERT INTO outfit_logs (item_ids, date_worn) VALUES (?, ?)",
              (item_ids, str(date.today())))
    for item_id in data["item_ids"]:
        c.execute("""
            UPDATE clothing_items
            SET wear_count = wear_count + 1, last_worn = ?
            WHERE id = ?
        """, (str(date.today()), item_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Outfit logged"})

@app.route("/suggest", methods=["GET"])
def suggest():
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("SELECT * FROM clothing_items ORDER BY wear_count ASC, last_worn ASC")
    rows = c.fetchall()
    conn.close()

    if not rows:
        return jsonify({"suggestions": [], "message": "No items in closet yet"})

    items = [
        {"id": r[0], "category": r[1], "color": r[2],
         "wear_count": r[5], "last_worn": r[6]}
        for r in rows
    ]

    prompt = (
        f"Here is a list of clothing items with their wear history: {items}. "
        "Suggest 3 outfit combinations from these items. "
        "Prioritize items that have been worn less recently. "
        "Respond ONLY with valid JSON, no markdown, no backticks: "
        '{"suggestions": [{"outfit": "description of the outfit", "item_ids": [1, 2], "reason": "why this outfit works"}, ...]}'
    )

    response = client.models.generate_content(
        model=TEXT_MODEL,
        contents=[prompt]
    )

    try:
        result = parse_gemini_json(response.text)
    except json.JSONDecodeError:
        return jsonify({"suggestions": [], "message": "Could not parse suggestions"})

    return jsonify(result)

# Get weather-based outfit suggestions
@app.route("/suggest-weather", methods=["GET"])
def suggest_weather():
    lat = request.args.get("lat", "40.1106")
    lon = request.args.get("lon", "-88.2073")

    # Fetch weather from Open-Meteo
    weather_url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,weathercode"
        f"&temperature_unit=fahrenheit"
    )

    try:
        with urllib.request.urlopen(weather_url) as response:
            weather_data = json.loads(response.read())
            temp_f       = weather_data["current"]["temperature_2m"]
            weather_code = weather_data["current"]["weathercode"]
    except Exception as e:
        return jsonify({"error": f"Could not fetch weather: {str(e)}"}), 500

    # Map WMO weather codes to human-readable descriptions
    if weather_code == 0:
        weather_desc = "clear and sunny"
    elif weather_code in [1, 2, 3]:
        weather_desc = "partly cloudy"
    elif weather_code in [45, 48]:
        weather_desc = "foggy"
    elif weather_code in [61, 63, 65, 80, 81, 82]:
        weather_desc = "rainy"
    elif weather_code in [71, 73, 75, 77, 85, 86]:
        weather_desc = "snowy"
    elif weather_code in [95, 96, 99]:
        weather_desc = "stormy"
    else:
        weather_desc = "cloudy"

    # Get inventory
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("SELECT * FROM clothing_items")
    rows = c.fetchall()
    conn.close()

    if not rows:
        return jsonify({
            "temperature": temp_f,
            "weather": weather_desc,
            "suggestions": [],
            "message": "No items in closet yet"
        })

    items = [
        {"id": r[0], "category": r[1], "color": r[2],
         "wear_count": r[5], "last_worn": r[6]}
        for r in rows
    ]

    prompt = (
        f"Current weather: {temp_f}°F and {weather_desc}. "
        f"Here are the available clothing items: {items}. "
        "Suggest 3 outfit combinations appropriate for this weather. "
        "For cold weather (below 50°F) prioritize jackets and warm layers. "
        "For hot weather (above 75°F) prioritize t-shirts and light items. "
        "For rainy weather suggest appropriate outfits. "
        "Respond ONLY with valid JSON, no markdown, no backticks: "
        '{"temperature": 72, "weather": "sunny", "suggestions": [{"outfit": "description", "item_ids": [1, 2], "reason": "good for warm weather"}, ...]}'
    )

    response = client.models.generate_content(
        model=TEXT_MODEL,
        contents=[prompt]
    )

    try:
        result = parse_gemini_json(response.text)
        result["temperature"] = temp_f
        result["weather"]     = weather_desc
    except json.JSONDecodeError:
        return jsonify({
            "temperature": temp_f,
            "weather": weather_desc,
            "suggestions": [],
            "message": "Could not parse suggestions"
        })

    return jsonify(result)

# Get calendar-based outfit suggestions
# Checks hardcoded fashion holidays first, then Nager.Date API for public holidays
@app.route("/suggest-calendar", methods=["GET"])
def suggest_calendar():
    today = date.today()
    month = today.month
    day   = today.day
    year  = today.year

    # Hardcoded fashion holidays with color themes
    fashion_holidays = {
        (1,  1):  {"name": "New Year's Day",     "colors": ["gold", "silver", "white"],       "theme": "celebratory"},
        (2,  14): {"name": "Valentine's Day",     "colors": ["red", "pink", "white"],          "theme": "romantic"},
        (3,  17): {"name": "St. Patrick's Day",   "colors": ["green"],                         "theme": "festive"},
        (7,  4):  {"name": "4th of July",         "colors": ["red", "white", "blue"],          "theme": "patriotic"},
        (10, 31): {"name": "Halloween",           "colors": ["orange", "black"],               "theme": "spooky"},
        (11, 28): {"name": "Thanksgiving",        "colors": ["orange", "brown", "gold"],       "theme": "warm and cozy"},
        (12, 25): {"name": "Christmas",           "colors": ["red", "green", "white"],         "theme": "festive"},
        (12, 31): {"name": "New Year's Eve",      "colors": ["gold", "silver", "black"],       "theme": "glamorous"},
        (2,  2):  {"name": "Groundhog Day",       "colors": ["brown", "grey"],                 "theme": "casual"},
        (3,  8):  {"name": "International Women's Day", "colors": ["purple", "white", "green"], "theme": "empowering"},
    }

    holiday = fashion_holidays.get((month, day))

    # If no hardcoded holiday, check Nager.Date API for US public holidays
    if not holiday:
        try:
            nager_url = f"https://date.nager.at/api/v3/PublicHolidays/{year}/US"
            with urllib.request.urlopen(nager_url) as response:
                holidays_data = json.loads(response.read())
                today_str = today.strftime("%Y-%m-%d")
                for h in holidays_data:
                    if h["date"] == today_str:
                        holiday = {
                            "name":   h["localName"],
                            "colors": ["any"],
                            "theme":  "festive"
                        }
                        break
        except Exception:
            pass  # If API fails, just continue without holiday context

    # Get inventory
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("SELECT * FROM clothing_items")
    rows = c.fetchall()
    conn.close()

    if not rows:
        return jsonify({
            "date":        str(today),
            "holiday":     holiday["name"] if holiday else None,
            "suggestions": [],
            "message":     "No items in closet yet"
        })

    items = [
        {"id": r[0], "category": r[1], "color": r[2],
         "wear_count": r[5], "last_worn": r[6]}
        for r in rows
    ]

    if holiday:
        prompt = (
            f"Today is {holiday['name']}! "
            f"The traditional colors for this occasion are {holiday['colors']}. "
            f"Here are the available clothing items: {items}. "
            f"Suggest 3 outfit combinations that match the {holiday['theme']} theme. "
            f"Prioritize items with these colors if available: {holiday['colors']}. "
            "Respond ONLY with valid JSON, no markdown, no backticks: "
            '{"holiday": "name", "suggested_colors": ["red"], "suggestions": [{"outfit": "description", "item_ids": [1, 2], "reason": "matches holiday theme"}, ...]}'
        )
    else:
        day_name = today.strftime("%A")
        prompt = (
            f"Today is {day_name}, {today.strftime('%B %d')}. "
            f"Here are the available clothing items: {items}. "
            "Suggest 3 outfit combinations appropriate for today. "
            "For Monday through Friday suggest smart casual or professional outfits. "
            "For Saturday and Sunday suggest comfortable casual outfits. "
            "Respond ONLY with valid JSON, no markdown, no backticks: "
            '{"day": "Monday", "suggestions": [{"outfit": "description", "item_ids": [1, 2], "reason": "good for a workday"}, ...]}'
        )

    response = client.models.generate_content(
        model=TEXT_MODEL,
        contents=[prompt]
    )

    try:
        result = parse_gemini_json(response.text)
        result["date"]    = str(today)
        result["holiday"] = holiday["name"] if holiday else None
    except json.JSONDecodeError:
        return jsonify({
            "date":        str(today),
            "holiday":     holiday["name"] if holiday else None,
            "suggestions": [],
            "message":     "Could not parse suggestions"
        })

    return jsonify(result)

def resize_image(image_bytes, max_size=1024):
    img = Image.open(io.BytesIO(image_bytes))
    img.thumbnail((max_size, max_size))  # shrinks proportionally, won't upscale
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()

# Virtual try-on using diffusion model
@app.route("/try-on", methods=["POST"])
def try_on():
    data         = request.get_json()
    person_b64   = data.get("person_image")
    clothing_b64 = data.get("clothing_image")

    try:
        person_bytes   = base64.b64decode(person_b64)
        clothing_bytes = base64.b64decode(clothing_b64)

        # Resize both images before sending to Gemini 
        person_bytes =resize_image(person_bytes) 
        clothing_bytes = resize_image(clothing_bytes)

    except Exception as e:
        return jsonify({"error": f"Failed to decode images: {str(e)}"}), 400

    person_mime   = "image/jpeg" if person_bytes[:3] == b'\xff\xd8\xff' else "image/png"
    clothing_mime = "image/jpeg" if clothing_bytes[:3] == b'\xff\xd8\xff' else "image/png"

    person_img   = types.Part.from_bytes(data=person_bytes,   mime_type=person_mime)
    clothing_img = types.Part.from_bytes(data=clothing_bytes, mime_type=clothing_mime)

    prompt = (
        "Using the two provided images, create a composite scene. "
        "Place the clothing item from the second image onto the person in the first image. "
        "Ensure it fits naturally with realistic folds and matching lighting."
    )

    response = client.models.generate_content(
        model=IMAGE_MODEL,
        contents=[person_img, clothing_img, prompt],
        config=GenerateContentConfig(response_modalities=[Modality.IMAGE])
    )

    for part in response.candidates[0].content.parts:
        if part.inline_data:
            img_bytes  = part.inline_data.data
            result_b64 = base64.b64encode(img_bytes).decode("utf-8")
            # print("person_bytes length:", len(person_bytes))
            # print("clothing_bytes length", len(clothing_bytes))
            # print("person first 10 bytes:", person_bytes[:10])
            # print("clothing first 10 bytes:", clothing_bytes[:10])
            return jsonify({"result_image": result_b64})

    return jsonify({"error": "No image generated"}), 500

# Start backend server
if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
