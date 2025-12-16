# Gemini File Search GUI

An open-source, local graphical interface for Google's Gemini File Search API. Upload documents and chat with them using the Gemini 2.0 Flash model.

## 📥 Download

You can download the latest standalone executable (`.exe`) from the **[Releases](https://github.com/YOUR_USERNAME/YOUR_REPOSITORY/releases)** page.
*No Python installation required if you use the exe!*

## 🚀 Features

- **Knowledge Base**: Upload multiple files (PDF, TXT, Code, etc.) to create a searchable store.
- **RAG (Retrieval Augmented Generation)**: The AI answers based on the context of your files.
- **Secure Key Management**: Your API Key is stored locally in your session or a local `.env` file.
- **Modern UI**: Clean, responsive interface with easy file management.

## 🛠️ Installation & Development

If you want to run the code directly or contribute:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
    cd YOUR_REPOSITORY
    ```

2.  **Set up Python:**
    Ensure you have Python 3.10+ installed.

3.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configuration:**
    *   Rename `.env.example` to `.env`.
    *   (Optional) Open `.env` and add your `GEMINI_API_KEY` if you want it hardcoded for your local usage.
    *   *Note: You can also enter the key in the GUI settings.*

5.  **Run the Application:**
    ```bash
    python app.py
    ```
    Open your browser to `http://localhost:5000`.

## 📦 Building form Source

To create the `.exe` file yourself:

1.  Install PyInstaller:
    ```bash
    pip install pyinstaller
    ```
2.  Run the build script:
    ```bash
    # Windows
    .\build_exe.bat
    ```
    The executable will be generated in the `dist/` folder.

## 🤝 Contributing

Contributions are welcome!
1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes.
4.  Push to the branch.
5.  Open a Pull Request.

## 📝 License

[MIT License](LICENSE) (or whichever license you choose)
