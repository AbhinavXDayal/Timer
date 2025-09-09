import React, { useState, useEffect, useRef } from 'react';
import { playBeep } from './utils/audioUtils';

interface StudySession {
  startTime: string;
  stopTime?: string;
}

interface ReminderState {
  lastReminder: number;
  dismissed: boolean;
}

const App: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [currentSession, setCurrentSession] = useState<StudySession | null>(null);
  const [lastStopTime, setLastStopTime] = useState<string>('');
  const [showBreakReminder, setShowBreakReminder] = useState(false);
  const [showEyeReminder, setShowEyeReminder] = useState(false);
  const [reminderState, setReminderState] = useState<ReminderState>({ lastReminder: 0, dismissed: false });
  const [sessionDuration, setSessionDuration] = useState<string>('');

  const sessionStartTimeRef = useRef<number>(0);
  const breakIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eyeReminderIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Round time to nearest 5 minutes
  const roundToNearest5Minutes = (date: Date): string => {
    const minutes = date.getMinutes();
    const roundedMinutes = Math.round(minutes / 5) * 5;
    const roundedDate = new Date(date);
    roundedDate.setMinutes(roundedMinutes, 0, 0);
    return roundedDate.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  // Load data from localStorage on component mount
  useEffect(() => {
    const savedSession = localStorage.getItem('currentSession');
    const savedLastStop = localStorage.getItem('lastStopTime');
    const savedReminderState = localStorage.getItem('reminderState');

    if (savedSession) {
      const session = JSON.parse(savedSession);
      setCurrentSession(session);
      if (session.startTime && !session.stopTime) {
        setIsActive(true);
        sessionStartTimeRef.current = new Date(session.startTime).getTime();
        startTimers();
      }
    }

    if (savedLastStop) {
      setLastStopTime(savedLastStop);
    }

    if (savedReminderState) {
      setReminderState(JSON.parse(savedReminderState));
    }
  }, []);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    if (currentSession) {
      localStorage.setItem('currentSession', JSON.stringify(currentSession));
    }
    if (lastStopTime) {
      localStorage.setItem('lastStopTime', lastStopTime);
    }
    localStorage.setItem('reminderState', JSON.stringify(reminderState));
  }, [currentSession, lastStopTime, reminderState]);

  const startTimers = () => {
    // 2-hour break reminder
    breakIntervalRef.current = setInterval(() => {
      setShowBreakReminder(true);
      playAlarm();
    }, 2 * 60 * 60 * 1000); // 2 hours

    // 30-minute eye reminder - start immediately and then every 30 minutes
    const now = Date.now();
    setReminderState(prev => ({ ...prev, lastReminder: now }));
    
    eyeReminderIntervalRef.current = setInterval(() => {
      const currentTime = Date.now();
      setShowEyeReminder(true);
      playAlarm();
      setReminderState(prev => ({ ...prev, lastReminder: currentTime, dismissed: false }));
    }, 30 * 60 * 1000); // Every 30 minutes

    // Update session duration every second
    durationIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - sessionStartTimeRef.current;
      const hours = Math.floor(elapsed / (1000 * 60 * 60));
      const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);
      setSessionDuration(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);
  };

  const stopTimers = () => {
    if (breakIntervalRef.current) {
      clearInterval(breakIntervalRef.current);
      breakIntervalRef.current = null;
    }
    if (eyeReminderIntervalRef.current) {
      clearInterval(eyeReminderIntervalRef.current);
      eyeReminderIntervalRef.current = null;
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setSessionDuration('');
  };

  const playAlarm = () => {
    playBeep();
  };

  const startSession = () => {
    const now = new Date();
    const roundedTime = roundToNearest5Minutes(now);
    const session: StudySession = { startTime: roundedTime };
    
    setCurrentSession(session);
    setIsActive(true);
    sessionStartTimeRef.current = now.getTime();
    startTimers();
  };

  const stopSession = () => {
    const now = new Date();
    const roundedTime = roundToNearest5Minutes(now);
    
    if (currentSession) {
      const updatedSession = { ...currentSession, stopTime: roundedTime };
      setCurrentSession(updatedSession);
      setLastStopTime(roundedTime);
    }
    
    setIsActive(false);
    stopTimers();
  };

  const dismissBreakReminder = () => {
    setShowBreakReminder(false);
  };

  const dismissEyeReminder = () => {
    setShowEyeReminder(false);
    setReminderState(prev => ({ ...prev, dismissed: true }));
  };

  return (
    <div className="container">
      {/* Study Session Card */}
      <div className="card">
        <h2 style={{ textAlign: 'center' }}>Study Session</h2>
        
        {currentSession?.startTime && (
          <div className="time-display">
            Started at: {currentSession.startTime}
          </div>
        )}
        
        {lastStopTime && (
          <div className="time-display">
            Stopped at: {lastStopTime}
          </div>
        )}
        
        {isActive && sessionDuration && (
          <div className="time-display" style={{ fontSize: '24px', fontWeight: 'bold', color: '#2d3748' }}>
            {sessionDuration}
          </div>
        )}
        
        <div className={`status ${isActive ? 'active' : 'inactive'}`}>
          {isActive ? 'Session Active' : 'Session Inactive'}
        </div>
        
        {!isActive ? (
          <button className="button" onClick={startSession}>
            Start Study Session
          </button>
        ) : (
          <button className="button stop" onClick={stopSession}>
            Stop Study Session
          </button>
        )}
      </div>

      {/* 30-30-30 Reminder Card */}
      <div className="card">
        <h2 style={{ textAlign: 'center' }}>30-30-30 Rule Reminder</h2>
        <p style={{ textAlign: 'center', color: '#4a5568', marginBottom: '20px' }}>
          Every 30 minutes, look at something 30 feet away for 30 seconds to reduce eye strain.
        </p>
        
        <div className="status">
          {isActive ? 'Reminders Active' : 'Start a session to enable reminders'}
        </div>
        
        {reminderState.dismissed && (
          <div style={{ textAlign: 'center', fontSize: '14px', color: '#718096', marginTop: '10px' }}>
            Reminder dismissed - will show again in 30 minutes
          </div>
        )}
      </div>



      {/* Break Reminder Modal */}
      {showBreakReminder && (
        <div className="modal">
          <div className="modal-content">
            <h3 style={{ textAlign: 'center' }}>Time for a Break!</h3>
            <p>You've been studying for 2 hours. Take a 30-minute break to rest your mind and eyes.</p>
            <button className="modal-button" onClick={dismissBreakReminder}>
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Eye Reminder Modal */}
      {showEyeReminder && (
        <div className="modal">
          <div className="modal-content">
            <h3 style={{ textAlign: 'center' }}>30-30-30 Rule</h3>
            <p>Look at something 30 feet away for 30 seconds to reduce eye strain.</p>
            <button className="modal-button" onClick={dismissEyeReminder}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
