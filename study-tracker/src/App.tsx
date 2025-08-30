import React, { useState, useEffect, useRef } from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { playBeep } from './utils/audioUtils';

interface Session {
  id: string;
  type: 'focus' | 'break';
  startTime: string;
  endTime?: string;
  duration?: string;
  date: string;
}

interface Plant {
  id: string;
  type: 'tree' | 'flower' | 'bush';
  plantedAt: string;
  completed: boolean;
}

interface CycleSession {
  isActive: boolean;
  currentPhase: 'focus' | 'break';
  startTime: number;
  timeLeft: number;
  totalTime: number;
  isPaused: boolean;
}

const FOCUS_DURATION = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
const BREAK_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

const App: React.FC = () => {
  const [cycleSession, setCycleSession] = useState<CycleSession | null>(null);
  const [sessionHistory, setSessionHistory] = useState<Session[]>([]);
  const [forest, setForest] = useState<Plant[]>([]);
  const [showBreakReminder, setShowBreakReminder] = useState(false);
  const [showEyeReminder, setShowEyeReminder] = useState(false);
  const [reminderState, setReminderState] = useState({ lastReminder: 0, dismissed: false });
  const [eyeReminderCountdown, setEyeReminderCountdown] = useState(30);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const breakIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eyeReminderIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eyeCountdownRef = useRef<NodeJS.Timeout | null>(null);

  // Plant types for gamification
  const plantTypes = [
    { type: 'tree', emoji: '🌳', name: 'Oak Tree' },
    { type: 'tree', emoji: '🌲', name: 'Pine Tree' },
    { type: 'tree', emoji: '🌴', name: 'Palm Tree' },
    { type: 'flower', emoji: '🌸', name: 'Cherry Blossom' },
    { type: 'flower', emoji: '🌹', name: 'Rose' },
    { type: 'flower', emoji: '🌻', name: 'Sunflower' },
    { type: 'bush', emoji: '🌿', name: 'Fern' },
    { type: 'bush', emoji: '🍃', name: 'Leaf' },
  ];

  // Load data from localStorage
  useEffect(() => {
    const savedCycleSession = localStorage.getItem('cycleSession');
    const savedHistory = localStorage.getItem('sessionHistory');
    const savedForest = localStorage.getItem('forest');
    const savedReminderState = localStorage.getItem('reminderState');

    if (savedCycleSession) {
      const session = JSON.parse(savedCycleSession);
      setCycleSession(session);
      if (session.isActive && !session.isPaused) {
        startTimer(session);
      }
    }

    if (savedHistory) {
      setSessionHistory(JSON.parse(savedHistory));
    }

    if (savedForest) {
      setForest(JSON.parse(savedForest));
    }

    if (savedReminderState) {
      setReminderState(JSON.parse(savedReminderState));
    }
  }, []);

  // Save data to localStorage
  useEffect(() => {
    if (cycleSession) {
      localStorage.setItem('cycleSession', JSON.stringify(cycleSession));
    }
    localStorage.setItem('sessionHistory', JSON.stringify(sessionHistory));
    localStorage.setItem('forest', JSON.stringify(forest));
    localStorage.setItem('reminderState', JSON.stringify(reminderState));
  }, [cycleSession, sessionHistory, forest, reminderState]);

  const formatTime = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const startTimer = (session: CycleSession) => {
    timerRef.current = setInterval(() => {
      setCycleSession(prev => {
        if (!prev) return null;
        
        const newTimeLeft = prev.timeLeft - 1000;
        
        if (newTimeLeft <= 0) {
          // Session completed
          completeSession(prev);
          return null;
        }
        
        return { ...prev, timeLeft: newTimeLeft };
      });
    }, 1000);

    // Start reminders
    startReminders();
  };

  const startReminders = () => {
    // 2-hour break reminder
    breakIntervalRef.current = setInterval(() => {
      setShowBreakReminder(true);
      playAlarm();
    }, 2 * 60 * 60 * 1000);

    // 30-minute eye reminder - start immediately and then every 30 minutes
    const now = Date.now();
    setReminderState(prev => ({ ...prev, lastReminder: now }));
    
    eyeReminderIntervalRef.current = setInterval(() => {
      const currentTime = Date.now();
      setShowEyeReminder(true);
      setEyeReminderCountdown(30);
      playAlarm();
      setReminderState(prev => ({ ...prev, lastReminder: currentTime, dismissed: false }));
    }, 30 * 60 * 1000); // Every 30 minutes
  };

  const stopReminders = () => {
    if (breakIntervalRef.current) {
      clearInterval(breakIntervalRef.current);
      breakIntervalRef.current = null;
    }
    if (eyeReminderIntervalRef.current) {
      clearInterval(eyeReminderIntervalRef.current);
      eyeReminderIntervalRef.current = null;
    }
  };

  const completeSession = (session: CycleSession) => {
    const now = new Date();
    const endTime = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });

    // Save completed session
    const completedSession: Session = {
      id: Date.now().toString(),
      type: session.currentPhase,
      startTime: new Date(session.startTime).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      }),
      endTime,
      duration: formatTime(session.totalTime),
      date: now.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    };

    setSessionHistory(prev => [completedSession, ...prev.slice(0, 19)]); // Keep last 20 sessions

    // Add plant to forest if it was a focus session
    if (session.currentPhase === 'focus') {
      addPlantToForest();
    }

    // Play alarm
    playAlarm();

    // Switch to next phase or complete cycle
    if (session.currentPhase === 'focus') {
      // Start break
      const newSession: CycleSession = {
        isActive: true,
        currentPhase: 'break',
        startTime: Date.now(),
        timeLeft: BREAK_DURATION,
        totalTime: BREAK_DURATION,
        isPaused: false
      };
      setCycleSession(newSession);
      startTimer(newSession);
    } else {
      // Break completed, cycle finished
      setCycleSession(null);
      stopReminders();
    }
  };

  const addPlantToForest = () => {
    const randomPlant = plantTypes[Math.floor(Math.random() * plantTypes.length)];
    const newPlant: Plant = {
      id: Date.now().toString(),
      type: randomPlant.type as 'tree' | 'flower' | 'bush',
      plantedAt: new Date().toISOString(),
      completed: true
    };
    setForest(prev => [...prev, newPlant]);
  };

  const startFocusSession = () => {
    const newSession: CycleSession = {
      isActive: true,
      currentPhase: 'focus',
      startTime: Date.now(),
      timeLeft: FOCUS_DURATION,
      totalTime: FOCUS_DURATION,
      isPaused: false
    };
    setCycleSession(newSession);
    startTimer(newSession);
  };

  const pauseSession = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCycleSession(prev => prev ? { ...prev, isPaused: true } : null);
  };

  const resumeSession = () => {
    if (cycleSession) {
      setCycleSession(prev => prev ? { ...prev, isPaused: false } : null);
      startTimer(cycleSession);
    }
  };

  const stopSession = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopReminders();
    setCycleSession(null);
  };

  const playAlarm = () => {
    playBeep();
  };

  const dismissBreakReminder = () => {
    setShowBreakReminder(false);
  };

  const dismissEyeReminder = () => {
    setShowEyeReminder(false);
    setReminderState(prev => ({ ...prev, dismissed: true }));
  };

  const clearHistory = () => {
    setSessionHistory([]);
  };

  const clearForest = () => {
    setForest([]);
  };

  const getProgressPercentage = () => {
    if (!cycleSession) return 0;
    return ((cycleSession.totalTime - cycleSession.timeLeft) / cycleSession.totalTime) * 100;
  };

  const getProgressColor = () => {
    if (!cycleSession) return '#3b82f6';
    return cycleSession.currentPhase === 'focus' ? '#22c55e' : '#f59e0b';
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 text-forest-green">
          🌱 Study Forest
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Timer Section */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl">
              <div className="flex flex-col items-center">
                {/* Circular Timer */}
                <div className="relative w-80 h-80 mb-8">
                  <CircularProgressbar
                    value={getProgressPercentage()}
                    text={formatTime(cycleSession?.timeLeft || 0)}
                    styles={buildStyles({
                      pathColor: getProgressColor(),
                      textColor: '#ffffff',
                      trailColor: '#374151',
                      strokeLinecap: 'round',
                    })}
                    strokeWidth={8}
                  />
                  
                  {/* Phase indicator */}
                  {cycleSession && (
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-16">
                      <div className={`text-lg font-semibold ${
                        cycleSession.currentPhase === 'focus' ? 'text-forest-green' : 'text-yellow-400'
                      }`}>
                        {cycleSession.currentPhase === 'focus' ? '🎯 Focus' : '☕ Break'}
                      </div>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex gap-4 mb-6">
                  {!cycleSession ? (
                    <button
                      onClick={startFocusSession}
                      className="bg-forest-green hover:bg-forest-dark text-white px-8 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg"
                    >
                      Start Focus Session
                    </button>
                  ) : (
                    <>
                      {cycleSession.isPaused ? (
                        <button
                          onClick={resumeSession}
                          className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg"
                        >
                          Resume
                        </button>
                      ) : (
                        <button
                          onClick={pauseSession}
                          className="bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg"
                        >
                          Pause
                        </button>
                      )}
                      <button
                        onClick={stopSession}
                        className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg"
                      >
                        Stop
                      </button>
                    </>
                  )}
                </div>

                {/* Status */}
                <div className={`text-lg font-medium ${
                  cycleSession?.isActive ? 'text-forest-green' : 'text-gray-400'
                }`}>
                  {cycleSession?.isActive 
                    ? (cycleSession.isPaused ? 'Session Paused' : 'Session Active')
                    : 'No active session'
                  }
                </div>
              </div>
            </div>

            {/* Session History */}
            <div className="bg-gray-800 rounded-2xl p-6 mt-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Session History</h2>
                <button
                  onClick={clearHistory}
                  className="text-gray-400 hover:text-red-400 transition-colors duration-300"
                >
                  Clear History
                </button>
              </div>
              
              <div className="space-y-3">
                {sessionHistory.length > 0 ? (
                  sessionHistory.map((session) => (
                    <div
                      key={session.id}
                      className="bg-gray-700 rounded-xl p-4 flex justify-between items-center hover:bg-gray-600 transition-colors duration-300"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-2xl ${
                          session.type === 'focus' ? 'text-forest-green' : 'text-yellow-400'
                        }`}>
                          {session.type === 'focus' ? '🎯' : '☕'}
                        </span>
                        <div>
                          <div className="font-medium">
                            {session.type === 'focus' ? 'Focus Session' : 'Break Session'}
                          </div>
                          <div className="text-sm text-gray-400">{session.date}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{session.duration}</div>
                        <div className="text-sm text-gray-400">
                          {session.startTime} - {session.endTime}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-400 py-8">
                    No sessions recorded yet. Start your first focus session!
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Forest Section */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-2xl p-6 shadow-2xl h-fit">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">🌲 Your Forest</h2>
                <button
                  onClick={clearForest}
                  className="text-gray-400 hover:text-red-400 transition-colors duration-300"
                >
                  Clear Forest
                </button>
              </div>
              
              <div className="text-center mb-4">
                <div className="text-3xl font-bold text-forest-green">{forest.length}</div>
                <div className="text-sm text-gray-400">Plants Grown</div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {forest.map((plant) => (
                  <div
                    key={plant.id}
                    className="bg-gray-700 rounded-xl p-3 text-center hover:bg-gray-600 transition-all duration-300 transform hover:scale-105 animate-grow"
                  >
                    <div className="text-2xl mb-1">
                      {plantTypes.find(p => p.type === plant.type)?.emoji || '🌱'}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(plant.plantedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>

              {forest.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  <div className="text-4xl mb-2">🌱</div>
                  <div>Complete focus sessions to grow your forest!</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Break Reminder Modal */}
      {showBreakReminder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
            <h3 className="text-2xl font-bold mb-4 text-center">⏰ Time for a Break!</h3>
            <p className="text-gray-300 mb-6 text-center">
              You've been studying for 2 hours. Take a 30-minute break to rest your mind and eyes.
            </p>
            <button
              onClick={dismissBreakReminder}
              className="w-full bg-forest-green hover:bg-forest-dark text-white py-3 rounded-xl font-semibold transition-colors duration-300"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Eye Reminder Modal */}
      {showEyeReminder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
            <h3 className="text-2xl font-bold mb-4 text-center">👁️ 30-30-30 Rule</h3>
            <p className="text-gray-300 mb-6 text-center">
              Look at something 30 feet away for 30 seconds to reduce eye strain.
            </p>
            <button
              onClick={dismissEyeReminder}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-xl font-semibold transition-colors duration-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
