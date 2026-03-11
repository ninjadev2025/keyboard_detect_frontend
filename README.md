# Keyboard Detection

A standalone React application for monitoring and capturing keyboard input and clipboard content from remote clients via Socket.IO.

## Features

- Connect to a remote server via Socket.IO
- List available keyboard monitoring clients
- Auto-start capture for all detected clients
- Real-time keyboard typing capture
- Clipboard copy history tracking
- Display captured keystrokes and copied text in real-time
- Support for special keys (arrows, function keys, etc.)
- Per-client text history with localStorage persistence
- Automatic data export when storage limit is reached
- Separate optimized Python clients for Windows, macOS, and Linux

## Installation

### Frontend (React)

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Open your browser and navigate to `http://localhost:3000`

### Python Clients

#### Windows
```bash
pip install pynput python-socketio pywin32 pyperclip
python python_client_windows.py
```

#### macOS
```bash
pip install pynput python-socketio pyperclip
# Optional for better clipboard: pip install pyobjc
python python_client_macos.py
```

#### Linux
```bash
pip install pynput python-socketio pyperclip
# Install system clipboard tools:
# Ubuntu/Debian: sudo apt-get install xclip xsel
# Fedora: sudo dnf install xclip xsel
python python_client_linux.py
```

#### Auto-detect (Recommended)
```bash
# Automatically selects the correct client for your OS
python python_client.py
```

## Usage

1. Start the Python client on the target machine:
   ```bash
   python python_client.py -s http://your-server-url:5000
   ```

2. Open the React frontend in your browser

3. Enter your server URL and click Connect

4. Clients will automatically start capturing when detected

5. Select a client to view its keyboard typing or copy history

## Python Client Files

- **`python_client.py`** - Auto-detecting launcher (recommended)
- **`python_client_windows.py`** - Windows-optimized client
- **`python_client_macos.py`** - macOS-optimized client
- **`python_client_linux.py`** - Linux-optimized client with proper key mapping

## Features by OS

### Windows
- Native clipboard API support (win32clipboard)
- Optimized clipboard monitoring
- Proper key code mapping

### macOS
- Native clipboard API support (AppKit)
- Cmd+C detection
- Fast clipboard change detection

### Linux
- Fixed key mapping for special characters
- Proper handling of Shift+number combinations
- X11/Wayland clipboard support via pyperclip

## Socket.IO Events

The application uses the following Socket.IO events:

- **Connection**: Connects to `/admin` namespace
- **keyboard:list**: Requests list of available keyboard clients
- **admin:start**: Starts keyboard capture for a specific client
- **admin:stop**: Stops keyboard capture
- **key:forward**: Receives keyboard events from the server
- **clipboard:copy**: Receives clipboard copy events
- **key:event**: Receives keyboard events directly from clients

## Build for Production

```bash
npm run build
```

This creates an optimized production build in the `build` folder.

## Requirements

- Node.js 14+
- Python 3.7+
- A Socket.IO server that supports the keyboard detection protocol
- Platform-specific dependencies (see Installation section)