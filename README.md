# AI Job Form Filler Chrome Extension

Auto-fill job application forms using Google Gemini AI based on your resume.

## Features

- Automatically detects form fields on job application pages
- Uses Google Gemini AI to generate appropriate answers based on your resume
- Saves your resume text and API key locally
- One-click form filling
- Smart field detection with improved label extraction
- Supports multiple Gemini models with automatic fallback

## Setup Instructions

### 1. Get a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy your API key

### 2. Install the Extension

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the folder containing these extension files
6. The extension icon should appear in your toolbar

### 3. Create Extension Icons

1. Open `create-icons.html` in your browser
2. Right-click each canvas and save as:
   - `icon16.png`
   - `icon48.png`
   - `icon128.png`
3. Save them in the extension folder

### 4. Configure the Extension

1. Click the extension icon in your Chrome toolbar
2. Paste your Gemini API key
3. Paste your resume text (plain text format)
4. Click "Save Settings"

## How to Use

1. Navigate to any job application form
2. Click the extension icon
3. Click "Fill Form Automatically"
4. The extension will analyze the form and fill it with relevant information from your resume

## Features in Detail

### Smart Field Detection
- Automatically identifies field types (name, email, phone, address, etc.)
- Cleans up labels by removing asterisks, colons, and extra text
- Handles nested labels and complex form structures

### AI-Powered Answers
- Uses Google Gemini AI to generate contextually appropriate answers
- Tries multiple models for reliability (gemini-2.5-flash, gemini-2.0-flash, gemini-2.5-flash-lite)
- Provides specific answers based on field category

### Privacy & Security
- All data is stored locally in your browser
- API calls are made directly to Google's Gemini API
- No data is sent to any third-party servers
- Your API key is stored securely in Chrome's local storage

## Troubleshooting

- **Forms aren't filling:** Make sure you've saved your API key and resume
- **Wrong answers:** Check that your resume text is complete and well-formatted
- **API errors:** Verify your API key is valid and you haven't exceeded quota
- **Extension not working:** Refresh the page after installing the extension
- **Console errors:** Press F12 to open developer tools and check for error messages

## Technical Details

- **Manifest Version:** 3
- **Permissions:** storage, activeTab, scripting
- **AI Model:** Google Gemini 2.5 Flash (with fallbacks)
- **Supported Fields:** text, email, tel, url, textarea

## Contributing

Feel free to submit issues and pull requests!

## License

MIT License
