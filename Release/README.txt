# Gemini File Search GUI

This is a local graphical interface for Google's Gemini File Search API. It allows you to upload documents and chat with them using the Gemini 2.5 Flash model.

## Setup

1.  **Install Python:** Ensure you have Python 3.10+ installed.
2.  **Install Dependencies:**
    ```bash
    pip install google-genai flask python-dotenv
    ```

## Usage

1.  **Run the Application:**
    ```bash
    python app.py
    ```
2.  **Open Browser:**
    Go to `http://localhost:5000`
3.  **Enter API Key:**
    Paste your Gemini API Key in the settings sidebar on the left.
4.  **Upload Files:**
    Drag and drop files (PDF, TXT, etc.) into the upload zone. Wait for the checkmark ✓ (this means it has been indexed).
5.  **Chat:**
    Start asking questions about your uploaded documents!

## Features

- **Knowledge Base**: Upload multiple files to create a searchable store.
- **RAG (Retrieval Augmented Generation)**: The AI answers based *only* on the context of your files (when possible).
- **Citations**: The system uses Google's advanced retrieval to find the relevant chunks.

## Troubleshooting

- **API Key Error**: Make sure you have clicked "Set" after pasting the key.
- **Upload Error**: Ensure your file type is supported (PDF, text, code files).
- **Note**: This is a local server. If you restart the server, you will need to re-upload files or modify the code to use persistent Store IDs.
