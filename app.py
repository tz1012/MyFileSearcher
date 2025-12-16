import os
import time
import json
from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename
from google import genai
from google.genai import types
from dotenv import load_dotenv

import sys
import webbrowser
import threading
from threading import Timer

load_dotenv()

def shutdown_server():
    print("Shutting down server...")
    os._exit(0)


def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)

if getattr(sys, 'frozen', False):
    template_folder = resource_path('templates')
    static_folder = resource_path('static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Global store persistence
STORE_CONFIG_FILE = 'store_config.json'
CURRENT_STORE_ID = None
client = None

def load_config():
    if os.path.exists(STORE_CONFIG_FILE):
        try:
            with open(STORE_CONFIG_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_config(new_data):
    data = load_config()
    data.update(new_data)
    with open(STORE_CONFIG_FILE, 'w') as f:
        json.dump(data, f)

def load_active_store_id():
    return load_config().get('last_active_store_id')

def save_active_store_id(store_id):
    save_config({'last_active_store_id': store_id})

def load_api_key():
    return load_config().get('api_key')

def save_api_key(key):
    save_config({'api_key': key})

def get_store_file_count_local(store_id):
    config = load_config()
    stores_meta = config.get('stores_meta', {})
    return stores_meta.get(store_id, {}).get('file_count', 0)

def update_store_file_count_local(store_id, delta):
    config = load_config()
    stores_meta = config.get('stores_meta', {})
    if store_id not in stores_meta:
        stores_meta[store_id] = {'file_count': 0}
    
    current = stores_meta[store_id].get('file_count', 0)
    # Ensure not negative? Maybe useful for sync issues.
    new_count = max(0, current + delta)
    stores_meta[store_id]['file_count'] = new_count
    
    config['stores_meta'] = stores_meta
    with open(STORE_CONFIG_FILE, 'w') as f:
        json.dump(config, f)

def init_store_meta_local(store_id):
    config = load_config()
    stores_meta = config.get('stores_meta', {})
    stores_meta[store_id] = {'file_count': 0}
    config['stores_meta'] = stores_meta
    with open(STORE_CONFIG_FILE, 'w') as f:
        json.dump(config, f)

def delete_store_meta_local(store_id):
    config = load_config()
    stores_meta = config.get('stores_meta', {})
    if store_id in stores_meta:
        del stores_meta[store_id]
        config['stores_meta'] = stores_meta
        with open(STORE_CONFIG_FILE, 'w') as f:
            json.dump(config, f)

CURRENT_STORE_ID = load_active_store_id()

def get_client():
    global client
    if client is None:
        # Try env first, then config
        api_key = os.getenv("GEMINI_API_KEY") or load_api_key()
        if not api_key:
            raise ValueError("GEMINI_API_KEY not set.")
        client = genai.Client(api_key=api_key)
    return client

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/has_key', methods=['GET'])
def check_has_key():
    return jsonify({"has_key": bool(os.environ.get("GEMINI_API_KEY"))})

@app.route('/api/set_key', methods=['POST'])
def set_key():
    data = request.json
    key = data.get('apiKey')
    if key:
        os.environ["GEMINI_API_KEY"] = key
        save_api_key(key) # Persist it
        global client
        client = genai.Client(api_key=key)
        # Reset store ID on key change as stores are scoped to project/user often? 
        return jsonify({"status": "success"})
    return jsonify({"status": "error", "message": "No key provided"}), 400

@app.route('/api/models', methods=['GET'])
def list_models():
    try:
        client = get_client()
        models = []
        # List models that support generateContent
        # SDK might not have direct filter in list(), so we filter in loop
        for m in client.models.list():
            if 'generateContent' in m.supported_generation_methods and 'gemini' in m.name:
                 # Extract version for cleaner display if needed, or just use display_name/name
                 # Ensure we prioritize flash/pro
                 models.append({
                     "id": m.name.split("/")[-1], # Remove 'models/' prefix
                     "name": m.display_name or m.name
                 })
        
        # Sort to put newest or pro first? Let's just sort by name for now, or put specific ones on top in frontend
        return jsonify({"models": models})
    except Exception as e:
        print(f"Error fetching models: {e}")
        return jsonify({"models": [], "error": str(e)})

@app.route('/api/stores', methods=['GET'])
def list_stores():
    try:
        client = get_client()
        stores = []
        # List stores from Gemini API
        for store in client.file_search_stores.list():
            # Handle SDK object variations safely
            display_name = store.name
            try:
                if hasattr(store, 'config') and store.config and hasattr(store.config, 'display_name'):
                    display_name = store.config.display_name
                elif hasattr(store, 'display_name'):
                    display_name = store.display_name
            except:
                pass
            
            # Get local file count
            count = get_store_file_count_local(store.name)
            
            stores.append({
                "id": store.name,
                "name": display_name,
                "active": (store.name == CURRENT_STORE_ID),
                "file_count": count
            })
        return jsonify({"stores": stores, "active_store_id": CURRENT_STORE_ID})
    except Exception as e:
        print(f"Error listing stores: {e}")
        return jsonify({"stores": [], "error": str(e)})

@app.route('/api/store/<path:store_id>/count', methods=['GET'])
def get_store_file_count(store_id):
    try:
        client = get_client()
        # Attempt to list files associated with this store.
        # Direct method might not exist, so we use a general query if possible, or iterate.
        # However, listing all files in a store via SDK is not always straightforward without 'tools'.
        # We will try a known pattern: listing documents/files within the corpus/store.
        
        # NOTE: In strict Google GenAI SDK terms, iterating might be the only way if no specific 'count' field.
        # We'll try to find a way to filter. 
        # If we can't filter, we might just return safely "?"
        
        # Experimental: Try to get the store and see if it has stats
        # store = client.file_search_stores.get(name=store_id)
        # return jsonify({"count": getattr(store, "file_count", "?")})
        
        # Fallback: Just return "?" to avoid crashing or hanging on large datasets
        # until we are sure of the efficient counting method.
        # Users prefer a fast UI over a slow exact count.
        
        return jsonify({"count": "?"}) 
    except Exception as e:
        return jsonify({"count": "?", "error": str(e)})


@app.route('/api/store/<path:store_id>/files', methods=['GET'])
def list_store_files(store_id):
    try:
        client = get_client()
        files = []
        # Iterate over files in the store
        # Note: Pagination might be needed for very large stores, this fetches default page size
        for f in client.file_search_stores.list_files(file_search_store_name=store_id):
             files.append({
                 "name": f.config.display_name if (f.config and f.config.display_name) else f.name,
                 "id": f.name,
                 "uri": f.uri,
                 "size_bytes": f.size_bytes,
                 # "create_time": f.create_time # might be useful
             })
        
        return jsonify({"files": files})
    except Exception as e:
        print(f"Error listing files: {e}")
        return jsonify({"files": [], "error": str(e)})



@app.route('/api/stores', methods=['POST'])
def create_store():
    global CURRENT_STORE_ID
    data = request.json
    name = data.get('name')
    if not name:
        return jsonify({"error": "Name required"}), 400
    
    try:
        client = get_client()
        store = client.file_search_stores.create(
            config={'display_name': name}
        )
        # Note: The 'name' arg in create might be resource ID or display name depending on version.
        # But usually we can't set ID. We can set config.
        # Let's assume standard behavior:
        # If we need to set display name:
        # store = client.file_search_stores.create(config={"display_name": name})
        
        CURRENT_STORE_ID = store.name
        save_active_store_id(store.name)
        init_store_meta_local(store.name)
        
        display_name = store.name
        if hasattr(store, 'display_name'): display_name = store.display_name
        
        return jsonify({"status": "success", "id": store.name, "name": display_name})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stores/active', methods=['POST'])
def set_active_store():
    global CURRENT_STORE_ID
    data = request.json
    store_id = data.get('store_id')
    if not store_id:
        return jsonify({"error": "Store ID required"}), 400
    
    CURRENT_STORE_ID = store_id
    save_active_store_id(CURRENT_STORE_ID)
    return jsonify({"status": "success", "active_store_id": CURRENT_STORE_ID})

@app.route('/api/stores/<path:store_id>', methods=['DELETE'])
def delete_store(store_id):
    global CURRENT_STORE_ID
    try:
        client = get_client()
        # 'store_id' might come in as resource name or just ID, but SDK handles resource names usually.
        # But wait, flask path param might decode weirdly. 
        # Typically the store.name is like "fileSearchStores/xxxx".
        # We should pass exactly what we have.
        
        client.file_search_stores.delete(name=store_id, config={'force': True})
        
        if CURRENT_STORE_ID == store_id:
            CURRENT_STORE_ID = None
            save_active_store_id(None)
            
        delete_store_meta_local(store_id)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/shutdown', methods=['POST'])
def shutdown():
    # Schedule shutdown slightly in future to allow sending response
    Timer(1.0, shutdown_server).start()
    return jsonify({"status": "success", "message": "Server shutting down..."})

@app.route('/api/upload', methods=['POST'])
def upload_file():
    global CURRENT_STORE_ID
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    try:
        client = get_client()
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        print(f"Uploading {filename}...")
        # config name needs to be just the name, not valid resource name characters sometimes
        # Let's keep it simple.
        uploaded_file = client.files.upload(
            file=filepath,
            config={'display_name': filename} 
        )
        print(f"File uploaded: {uploaded_file.name}")

        if not CURRENT_STORE_ID:
            # Try to auto-create if no stores exist at all? 
            # Or just fail and tell user to create one?
            # Let's fail gracefully to let UI handle "Please create a store"
             return jsonify({"error": "No active store selected. Create or select a store first."}), 400
            
            # Legacy auto-create logic removed to enforce explicit store management
        
        print(f"Importing to {CURRENT_STORE_ID}...")

        # Check for existing file with same name in the store and delete it
        try:
            # Note: The SDK method names below are inferred from common patterns. 
            # If list_files is not available directly, we might need a different approach.
            # However, for a user-facing tool, handling this robustly is key.
            # Let's try to list files.
            existing_files = client.file_search_stores.list_files(file_search_store_name=CURRENT_STORE_ID)
            for f in existing_files:
                if f.config.display_name == filename: # Check display_name match
                    print(f"Found existing file {filename} in store. Deleting...")
                    client.file_search_stores.delete_file(
                        file_search_store_name=CURRENT_STORE_ID,
                        file_name=f.name
                    )
                    update_store_file_count_local(CURRENT_STORE_ID, -1)
                    print("Deleted old version.")
                    break
        except Exception as e:
            print(f"Warning during duplicate check: {e}")
        
        print(f"Importing to {CURRENT_STORE_ID}...")
        operation = client.file_search_stores.import_file(
            file_search_store_name=CURRENT_STORE_ID,
            file_name=uploaded_file.name
        )

        while not operation.done:
            print("Waiting for indexing...")
            time.sleep(1)
            operation = client.operations.get(operation)
        
        print("Indexing done.")
        update_store_file_count_local(CURRENT_STORE_ID, 1)
        os.remove(filepath)

        return jsonify({
            "status": "success", 
            "store_id": CURRENT_STORE_ID,
            "filename": filename
        })

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    global CURRENT_STORE_ID
    data = request.json
    message = data.get('message')
    from_model = data.get('model', 'gemini-1.5-flash') # Default fallback
    
    system_instruction = data.get('system_instruction')

    if not CURRENT_STORE_ID:
        return jsonify({"error": "Please select a Knowledge Base first."}), 400

    try:
        client = get_client()
        
        tool = types.Tool(
            file_search=types.FileSearch(
                file_search_store_names=[CURRENT_STORE_ID]
            )
        )
        
        # Configure generation
        config = types.GenerateContentConfig(
            tools=[tool],
            system_instruction=system_instruction if system_instruction else None
        )

        response = client.models.generate_content(
            model=from_model,
            contents=message,
            config=config
        )
        
        # Extract citations if available
        citations = []
        if response.candidates and response.candidates[0].citation_metadata:
             for citation in response.candidates[0].citation_metadata.citation_sources:
                 start = citation.start_index if citation.start_index is not None else 0
                 end = citation.end_index if citation.end_index is not None else 0
                 uri = citation.uri
                 # Try to get display name from uri if possible, or just send uri
                 # The UI can map URIs to names if we have the file list, 
                 # but for now let's just send what we have.
                 citations.append({
                     "uri": uri,
                     "startIndex": start,
                     "endIndex": end
                 })

        return jsonify({
            "response": response.text,
            "citations": citations
        })

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/store/<path:store_id>/suggestions', methods=['POST'])
def generate_suggestions(store_id):
    try:
        client = get_client()
        
        # Borrowed prompt logic from 'ask-the-manual'
        prompt = """
        You are provided some documents. 
        Generate 4 short, practical, and interesting questions a user might ask about these documents.
        Return the questions as a JSON array of strings, e.g. ["Question 1?", "Question 2?", ...].
        Do not include markdown formatting or backticks, just the raw JSON.
        """
        
        tool = types.Tool(
            file_search=types.FileSearch(
                file_search_store_names=[store_id]
            )
        )
        
        response = client.models.generate_content(
            model='gemini-1.5-flash', # Use stable model for suggestions
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[tool],
                response_mime_type="application/json"
            )
        )
        
        text = response.text.strip()
        # Cleanup if model adds markdown
        if text.startswith("```json"): text = text[7:]
        if text.endswith("```"): text = text[:-3]
        
        questions = json.loads(text)
        
        # Ensure it's a list of strings
        if isinstance(questions, list):
           return jsonify({"questions": questions[:4]}) # Limit to 4
        else:
           return jsonify({"questions": []})

    except Exception as e:
        print(f"Error generating suggestions: {e}")
        # Build strict JSON fallback if model fails
        return jsonify({"questions": []})

# --- Heartbeat / Auto Shutdown ---
LAST_HEARTBEAT = time.time() + 10  # Initial grace period (10s)
HEARTBEAT_TIMEOUT = 5 # Seconds

def heartbeat_monitor():
    """Checks if client is still connected. Shuts down if no heartbeat received."""
    global LAST_HEARTBEAT
    print("Heartbeat monitor started...")
    while True:
        time.sleep(2)
        if time.time() - LAST_HEARTBEAT > HEARTBEAT_TIMEOUT:
            print(f"No heartbeat for {HEARTBEAT_TIMEOUT}s. Shutting down...")
            os._exit(0)

# Start monitor in background
threading.Thread(target=heartbeat_monitor, daemon=True).start()

@app.route('/api/heartbeat', methods=['POST'])
def heartbeat():
    global LAST_HEARTBEAT
    LAST_HEARTBEAT = time.time()
    return jsonify({"status": "alive"})

def open_browser():
    webbrowser.open_new('http://127.0.0.1:5000/')

if __name__ == '__main__':
    Timer(1, open_browser).start()
    app.run(debug=False, port=5000)
