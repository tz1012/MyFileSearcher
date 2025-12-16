import os
from google import genai
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    # Try to load from store_config.json
    import json
    try:
        with open('store_config.json', 'r') as f:
            data = json.load(f)
            api_key = data.get('api_key')
    except:
        pass

if api_key:
    client = genai.Client(api_key=api_key)
    print("--- Available Models ---")
    for m in client.models.list():
        if 'generateContent' in m.supported_generation_methods and 'gemini' in m.name:
            print(f"ID: {m.name}, Display: {m.display_name}")
else:
    print("No API Key found")
