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
    print("--- Stores ---")
    for store in client.file_search_stores.list():
        print(f"Store: {store.name}")
        print(f"Dir: {dir(store)}")
        # Check if we can get file count easily
        # Try to list files for this store
        try:
             # This is the "official" way to filter files by store in v1beta/v1? 
             # In the new SDK `google-genai`, it might be different.
             # Let's try to see if store has any stats.
             pass
        except Exception as e:
            print(e)
else:
    print("No API Key found")
