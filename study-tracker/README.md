# Study Session Tracker

A modern, minimalistic React application for tracking study sessions with visual and audio reminders.

## Features

### Study Session Tracker
- **Start/Stop Sessions**: Track your study sessions with start and stop times
- **Time Rounding**: All times are automatically rounded to the nearest 5 minutes
- **Session Duration**: Real-time display of current session duration
- **Local Storage**: All data persists between browser sessions
- **Session History**: Displays the last stop time from previous sessions

### Reminders & Alerts
- **2-Hour Break Reminder**: Audio alert and popup notification every 2 hours suggesting a 30-minute break
- **30-30-30 Rule Reminder**: Gentle popup with audio every 30 minutes reminding you to look at something 30 feet away for 30 seconds
- **Dismissible Alerts**: All reminders can be dismissed and will reappear at the next interval

### Modern UI Design
- **Minimalist Design**: Clean, modern interface with soft colors
- **Card-based Layout**: Separate cards for study session and reminders
- **Responsive Design**: Works on desktop and mobile devices
- **Glass Morphism**: Beautiful backdrop blur effects and transparency

## Technical Details

### Built With
- **React 18** with TypeScript
- **Custom CSS** (no external UI libraries)
- **Web Audio API** for alarm sounds
- **localStorage** for data persistence

### Key Features
- **Time Management**: Automatic rounding to 5-minute intervals
- **Audio Notifications**: Built-in beep sounds using Web Audio API
- **State Persistence**: All session data saved to localStorage
- **Real-time Updates**: Live session duration counter
- **Cross-browser Compatible**: Works in all modern browsers

## Getting Started

### Prerequisites
- Node.js (version 14 or higher)
- npm or yarn

### Installation

1. Clone or download the project
2. Navigate to the project directory:
   ```bash
   cd study-tracker
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the development server:
   ```bash
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

### Building for Production

```bash
npm run build
```

## Deployment

### Vercel Deployment

This project is configured for easy deployment on Vercel:

1. **Connect to Vercel**: Import your GitHub repository to Vercel
2. **Automatic Detection**: Vercel will automatically detect this as a Create React App project
3. **Build Settings**: The `vercel.json` file ensures proper configuration
4. **Deploy**: Vercel will automatically build and deploy your app

### Manual Deployment

If you prefer to deploy manually:

1. Build the project:
   ```bash
   npm run build
   ```

2. The build files will be in the `build/` directory
3. Upload the contents of the `build/` directory to your hosting service

## How to Use

1. **Start a Study Session**: Click the "Start Study Session" button to begin tracking
2. **Monitor Progress**: Watch the real-time session duration counter
3. **Take Breaks**: Respond to the 2-hour break reminders
4. **Eye Care**: Follow the 30-30-30 rule reminders every 30 minutes
5. **End Session**: Click "Stop Study Session" when finished

## Data Storage

All data is stored locally in your browser's localStorage:
- Current session information
- Last stop time
- Reminder state and preferences

No data is sent to external servers - your study data stays private.

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge

## License

This project is open source and available under the MIT License.
