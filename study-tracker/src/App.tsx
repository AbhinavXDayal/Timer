import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { playBeep } from './utils/audioUtils';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GunLib: any = require('gun');
require('gun/sea');

// Minimal local star icon component (BsStars-like)
const BsStars = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    fill="currentColor"
    className={className}
  >
    <path d="M7.938 2.016a.5.5 0 0 1 .124 0l1.58.317 1.12-1.12a.5.5 0 0 1 .707.707l-1.12 1.12.317 1.58a.5.5 0 0 1-.614.588L8 4.383l-1.952.825a.5.5 0 0 1-.614-.588l.317-1.58-1.12-1.12a.5.5 0 0 1 .707-.707l1.12 1.12 1.58-.317ZM3.612 6.443a.5.5 0 0 1 .124 0l2.33.468 1.651-1.65a.5.5 0 0 1 .707 0l1.65 1.65 2.33-.469a.5.5 0 0 1 .588.614l-.469 2.33 1.65 1.651a.5.5 0 0 1-.353.853.5.5 0 0 1-.354-.146l-1.65-1.65-2.33.469a.5.5 0 0 1-.588-.614l.469-2.33-1.65-1.65-1.651 1.65.469 2.33a.5.5 0 0 1-.588.614l-2.33-.469-1.65 1.65a.5.5 0 1 1-.707-.707l1.65-1.651-.469-2.33a.5.5 0 0 1 .464-.61Z"/>
  </svg>
);

// Allow accessing YouTube API on window
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: any;
  }
}

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

//

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
  const [eyeRuleTimer, setEyeRuleTimer] = useState(30 * 60 * 1000); // 30 minutes in milliseconds
  const [eyeRuleActive, setEyeRuleActive] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState('wmLGG5DYDWQ'); // Default video ID

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const breakIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eyeReminderIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eyeCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const eyeRuleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const youtubePlayerRef = useRef<any>(null);
  const youtubeSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);


  const userPausedRef = useRef<boolean>(false);
  const hasUnmutedOnInteractionRef = useRef<boolean>(false);

  // GUN peer setup for no-login sync
  const gunRef = useRef<any>(null);
  const spaceIdRef = useRef<string>('');

  const saveChillMusicTime = useCallback(() => {
    try {
      const player = youtubePlayerRef.current;
      if (player && player.getCurrentTime) {
        const t = Math.floor(player.getCurrentTime());
        localStorage.setItem('chillMusicTime', String(t));
      }
    } catch (_) {}
  }, []);



  const playChillMusic = useCallback(() => {
    userPausedRef.current = false;
    try {
      if (youtubePlayerRef.current && youtubePlayerRef.current.playVideo) {
        if (youtubePlayerRef.current.unMute) {
          youtubePlayerRef.current.unMute();
          if (youtubePlayerRef.current.setVolume) youtubePlayerRef.current.setVolume(30);
        }
        youtubePlayerRef.current.playVideo();
      }
    } catch (_) {}
  }, []);

  const pauseChillMusic = useCallback(() => {
    userPausedRef.current = true;
    try {
      if (youtubePlayerRef.current && youtubePlayerRef.current.pauseVideo) {
        youtubePlayerRef.current.pauseVideo();
      }
    } catch (_) {}
  }, []);

  const requestAutoplay = useCallback((player: any) => {
    try {
      // Start muted for autoplay, then unmute on session start/resume
      player.mute && player.mute();
      player.playVideo && player.playVideo();
      // If YouTube auto-pauses, retry shortly unless the user paused
      setTimeout(() => {
        if (!userPausedRef.current && player.getPlayerState && player.getPlayerState() !== 1) {
          try { player.playVideo(); } catch (_) {}
        }
      }, 600);
    } catch (_) {}
  }, []);
  
  // Plant types for gamification
  const plantTypes = [
  { type: 'tree', name: 'Oak Tree', emoji: '🌳' },
  { type: 'tree', name: 'Pine Tree', emoji: '🌲' },
  { type: 'tree', name: 'Palm Tree', emoji: '🌴' },
  { type: 'flower', name: 'Cherry Blossom', emoji: '🌸' },
  { type: 'flower', name: 'Rose', emoji: '🌹' },
  { type: 'flower', name: 'Sunflower', emoji: '🌻' },
  { type: 'bush', name: 'Fern', emoji: '🌿' },
  { type: 'bush', name: 'Leaf', emoji: '🍃' },
];

  // Load data from localStorage
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const savedCycleSession = localStorage.getItem('cycleSession');
    const savedHistory = localStorage.getItem('sessionHistory');
    const savedForest = localStorage.getItem('forest');
    const savedReminderState = localStorage.getItem('reminderState');
    const savedEyeRuleTimer = localStorage.getItem('eyeRuleTimer');
    const savedEyeRuleActive = localStorage.getItem('eyeRuleActive');

    // Removed URL-hash sync to keep URLs short and rely on cloud sync only

    // Initialize GUN
    try {
      const gun = GunLib({ peers: ['https://gun-manhattan.herokuapp.com/gun'] });
      gunRef.current = gun;
      // Create or read spaceId
      const url = new URL(window.location.href);
      let spaceId = url.searchParams.get('space');
      if (!spaceId) {
        spaceId = Math.random().toString(36).slice(2, 10);
        url.searchParams.set('space', spaceId);
        window.history.replaceState(null, '', url.toString());
      }
      spaceIdRef.current = spaceId;

      const node = gun.get('space-focus').get(spaceId);
      node.get('sessionHistory').once((d: any) => {
        if (d) {
          try { setSessionHistory(JSON.parse(d)); } catch (_) {}
        }
      });
      node.get('forest').once((d: any) => {
        if (d) {
          try { setForest(JSON.parse(d)); } catch (_) {}
        }
      });
      node.get('reminderState').once((d: any) => {
        if (d) {
          try { setReminderState(JSON.parse(d)); } catch (_) {}
        }
      });
    } catch (_) {}

    if (savedCycleSession) {
      const session: CycleSession = JSON.parse(savedCycleSession);
      // If a session was active when the page was refreshed, recompute the remaining time
      if (session.isActive) {
        if (!session.isPaused) {
          const elapsedMs = Date.now() - session.startTime;
          const remainingMs = Math.max(session.totalTime - elapsedMs, 0);
          const updatedSession: CycleSession = { ...session, timeLeft: remainingMs };

          if (remainingMs > 0) {
            setCycleSession(updatedSession);
            startTimer(updatedSession);
            playChillMusic();
          } else {
            // Session would have completed while the app was closed
            setCycleSession(null);
            stopReminders();
          }
        } else {
          // Paused session – keep saved remaining time
          setCycleSession(session);
        }
      } else {
      setCycleSession(session);
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

    if (savedEyeRuleTimer) {
      setEyeRuleTimer(JSON.parse(savedEyeRuleTimer));
    }

    if (savedEyeRuleActive) {
      setEyeRuleActive(JSON.parse(savedEyeRuleActive));
    }
  }, []); // Removed dependencies to avoid circular references

  // Initialize YouTube player for Chill Music
  useEffect(() => {
    const setupYouTube = () => {
      if (youtubePlayerRef.current) return;
      const iframe = document.getElementById('chillYoutube');
      if (window.YT && window.YT.Player) {
        if (iframe && !youtubePlayerRef.current) {
          youtubePlayerRef.current = new window.YT.Player('chillYoutube', {
            playerVars: { autoplay: 1, rel: 0, modestbranding: 1, mute: 1, loop: 1 },
            events: {
              onReady: (event: any) => {
                try {
                  // Restore time and set initial volume
                  const saved = Number(localStorage.getItem('chillMusicTime') || '0');
                  if (!Number.isNaN(saved) && saved > 0) {
                    event.target.seekTo(saved, true);
                  }
                  event.target.setVolume(30);
                  requestAutoplay(event.target);
                } catch (_) {}
              },
              onStateChange: (event: any) => {
                // 1 = playing, 2 = paused, 0 = ended
                try {
                  if (event.data === 1) {
                    if (youtubeSaveIntervalRef.current) clearInterval(youtubeSaveIntervalRef.current);
                    youtubeSaveIntervalRef.current = setInterval(saveChillMusicTime, 5000);
                  } else {
                    saveChillMusicTime();
                    if (youtubeSaveIntervalRef.current) {
                      clearInterval(youtubeSaveIntervalRef.current);
                      youtubeSaveIntervalRef.current = null;
                    }

                  }
                } catch (_) {}
              }
            }
          });
        }
      }
    };

    // If API already loaded
    if (window.YT && window.YT.Player) {
      setupYouTube();
    } else {
      // Inject API script once
      const existingScript = document.getElementById('youtube-iframe-api');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }

      // YouTube API global callback
      const prev = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') prev();
        setupYouTube();
      };
    }

    // Unmute and play on first user interaction anywhere
    const handleFirstInteraction = () => {
      if (hasUnmutedOnInteractionRef.current) return;
      hasUnmutedOnInteractionRef.current = true;
      playChillMusic();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    // Save current time when navigating away
    const handleBeforeUnload = () => {
      saveChillMusicTime();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      if (youtubeSaveIntervalRef.current) {
        clearInterval(youtubeSaveIntervalRef.current);
        youtubeSaveIntervalRef.current = null;
      }

    };
  }, [playChillMusic, saveChillMusicTime]);

  // Save data to localStorage + push to GUN
  useEffect(() => {
    if (cycleSession) {
      localStorage.setItem('cycleSession', JSON.stringify(cycleSession));
    }
    localStorage.setItem('sessionHistory', JSON.stringify(sessionHistory));
    localStorage.setItem('forest', JSON.stringify(forest));
    localStorage.setItem('reminderState', JSON.stringify(reminderState));
    localStorage.setItem('eyeRuleTimer', JSON.stringify(eyeRuleTimer));
    localStorage.setItem('eyeRuleActive', JSON.stringify(eyeRuleActive));

    // URL-hash compression removed to avoid long links

    // Push to GUN
    try {
      if (gunRef.current && spaceIdRef.current) {
        const node = gunRef.current.get('space-focus').get(spaceIdRef.current);
        node.get('sessionHistory').put(JSON.stringify(sessionHistory));
        node.get('forest').put(JSON.stringify(forest));
        node.get('reminderState').put(JSON.stringify(reminderState));
      }
    } catch (_) {}
  }, [cycleSession, sessionHistory, forest, reminderState, eyeRuleTimer, eyeRuleActive, currentVideoId]);

  // Start eye countdown when modal opens
  useEffect(() => {
    if (showEyeReminder && eyeReminderCountdown === 30) {
      // Will use the startEyeCountdown function defined later
      if (eyeCountdownRef.current) {
        clearInterval(eyeCountdownRef.current);
      }
      
      eyeCountdownRef.current = setInterval(() => {
        setEyeReminderCountdown(prev => {
          if (prev <= 1) {
            if (eyeCountdownRef.current) {
              clearInterval(eyeCountdownRef.current);
              eyeCountdownRef.current = null;
            }
            setShowEyeReminder(false);
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    }
  }, [showEyeReminder, eyeReminderCountdown]);

  const formatTime = useCallback((milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  // Forward declare functions to avoid circular dependencies
  const addPlantToForest = useCallback(() => {
    const randomPlant = plantTypes[Math.floor(Math.random() * plantTypes.length)];
    const newPlant: Plant = {
      id: Date.now().toString(),
      type: randomPlant.type as 'tree' | 'flower' | 'bush',
      plantedAt: new Date().toISOString(),
      completed: true
    };
    setForest(prev => [...prev, newPlant]);
  }, []);

  // playAlarm is now defined above
  
  // startEyeCountdown is defined later in the file
  
  // Add missing setupYouTube function
  const setupYouTube = useCallback(() => {
    if (window.YT) return;
    
    // Create YouTube script
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    
    // Setup callback when API is ready
    window.onYouTubeIframeAPIReady = () => {
      if (youtubePlayerRef.current) return;
      
      const savedTime = localStorage.getItem('chillMusicTime');
      const startSeconds = savedTime ? parseInt(savedTime, 10) : 0;
      
      youtubePlayerRef.current = new window.YT.Player('youtube-player', {
        height: '200',
        width: '100%',
        videoId: currentVideoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          start: startSeconds,
          mute: 1, // Start muted to avoid autoplay restrictions
        },
        events: {
          onReady: (event: any) => {
            // Setup save interval
            if (!youtubeSaveIntervalRef.current) {
              youtubeSaveIntervalRef.current = setInterval(saveChillMusicTime, 30000);
            }
          },
        },
      });
    };
  }, [currentVideoId, saveChillMusicTime]);

  const completeSession = useCallback((session: CycleSession) => {
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
  }, [formatTime]); // Removed dependencies to avoid circular references

  const startTimer = useCallback((session: CycleSession) => {
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
  }, [completeSession]); // Removed startReminders dependency to avoid circular references

  const startReminders = useCallback(() => {
    // 2-hour break reminder
    breakIntervalRef.current = setInterval(() => {
      setShowBreakReminder(true);
      playAlarm();
    }, 2 * 60 * 60 * 1000);

    // Start 30-30-30 rule timer
    setEyeRuleActive(true);
    setEyeRuleTimer(30 * 60 * 1000); // Reset to 30 minutes
    
    eyeRuleTimerRef.current = setInterval(() => {
      setEyeRuleTimer(prev => {
        if (prev <= 1000) {
          // Timer finished - show reminder
          setShowEyeReminder(true);
          setEyeReminderCountdown(30);
          playAlarm();
          setReminderState(prev => ({ ...prev, lastReminder: Date.now(), dismissed: false }));
          startEyeCountdown();
          
          // Reset timer for next 30 minutes
          return 30 * 60 * 1000;
        }
        return prev - 1000;
      });
    }, 1000);
  }, [setShowBreakReminder, setEyeRuleActive, setEyeRuleTimer, setShowEyeReminder, setEyeReminderCountdown, setReminderState, setCycleSession]); // Removed dependencies to avoid circular references

  const stopReminders = useCallback(() => {
    if (breakIntervalRef.current) {
      clearInterval(breakIntervalRef.current);
      breakIntervalRef.current = null;
    }
    if (eyeReminderIntervalRef.current) {
      clearInterval(eyeReminderIntervalRef.current);
      eyeReminderIntervalRef.current = null;
    }
    if (eyeCountdownRef.current) {
      clearInterval(eyeCountdownRef.current);
      eyeCountdownRef.current = null;
    }
    if (eyeRuleTimerRef.current) {
      clearInterval(eyeRuleTimerRef.current);
      eyeRuleTimerRef.current = null;
    }
    setEyeRuleActive(false);
  }, [setEyeRuleActive]);

  // completeSession is now defined above
  // addPlantToForest is now defined above

  const startFocusSession = useCallback(() => {
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
    playChillMusic();
  }, [startTimer, playChillMusic]);

  const pauseSession = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (eyeRuleTimerRef.current) {
      clearInterval(eyeRuleTimerRef.current);
      eyeRuleTimerRef.current = null;
    }
    setCycleSession(prev => prev ? { ...prev, isPaused: true } : null);
    pauseChillMusic();
  }, [pauseChillMusic]);

  const resumeSession = useCallback(() => {
    if (cycleSession) {
      setCycleSession(prev => prev ? { ...prev, isPaused: false } : null);
      startTimer(cycleSession);
      playChillMusic();
    }
  }, [cycleSession, startTimer, playChillMusic]);

  const stopSession = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopReminders();
    setCycleSession(null);
    pauseChillMusic();
  }, [stopReminders, pauseChillMusic]);

  const playAlarm = useCallback(() => {
    playBeep();
  }, []);

  const dismissBreakReminder = useCallback(() => {
    setShowBreakReminder(false);
  }, []);

  const dismissEyeReminder = useCallback(() => {
    setShowEyeReminder(false);
    setReminderState(prev => ({ ...prev, dismissed: true }));
  }, []);

  const startEyeCountdown = useCallback(() => {
    setEyeReminderCountdown(30);
    eyeCountdownRef.current = setInterval(() => {
      setEyeReminderCountdown(prev => {
        if (prev <= 1) {
          if (eyeCountdownRef.current) {
            clearInterval(eyeCountdownRef.current);
            eyeCountdownRef.current = null;
          }
          setShowEyeReminder(false);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const clearHistory = useCallback(() => {
    setSessionHistory([]);
  }, []);





  const clearForest = useCallback(() => {
    setForest([]);
  }, []);

  const getProgressPercentage = useCallback(() => {
    if (!cycleSession) return 0;
    return ((cycleSession.totalTime - cycleSession.timeLeft) / cycleSession.totalTime) * 100;
  }, [cycleSession]);

  const getProgressColor = useCallback(() => {
    if (!cycleSession) return '#3b82f6';
    return cycleSession.currentPhase === 'focus' ? '#a08dcc' : '#f59e0b';
  }, [cycleSession]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 overflow-x-hidden">
      <div className="max-w-7xl mx-auto h-full">
        <h1 className="text-2xl font-bold text-center mb-3 text-forest-green">
          Space Focus 🌌
        </h1>

                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-y-6 gap-x-10 h-full items-stretch">
          {/* Main Timer Section */}
          <div className="lg:col-span-2 flex flex-col h-full">
                         <div className="bg-gray-800/50 rounded-2xl p-2 shadow-lg border border-gray-700/30">
              <div className="flex flex-col items-center">
                {/* Circular Timer */}
                                <div className="relative w-52 h-52 mb-2">
                  <CircularProgressbar
                    value={getProgressPercentage()}
                    text={''}
                    styles={buildStyles({
                      pathColor: getProgressColor(),
                      textColor: '#e5e7eb',
                      trailColor: '#374151',
                      strokeLinecap: 'round',
                    })}
                    strokeWidth={6}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="timer-bit text-3xl">{formatTime(cycleSession?.timeLeft || 0)}</div>
                  </div>
                  
                  {/* Phase indicator */}
                  {cycleSession && (
                    <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2">
                      <div className={`text-sm font-medium ${
                        cycleSession.currentPhase === 'focus' ? 'text-gray-300' : 'text-gray-400'
                      }`}>
                        {cycleSession.currentPhase === 'focus' ? 'Focus' : 'Break'}
            </div>
            </div>
          )}
          </div>

                
          
                {/* Controls */}
                <div className="flex items-center gap-3 mb-3">
                  {!cycleSession ? (
                    <button
                      onClick={startFocusSession}
                      className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-6 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105"
                    >
                      Start Focus Session
                    </button>
                  ) : (
                    <>
                      {cycleSession.isPaused ? (
                        <button
                          onClick={resumeSession}
                          className="bg-forest-green/20 hover:bg-forest-green/30 text-gray-200 px-5 py-2 rounded-lg font-semibold transition-all duration-200"
                        >
                          Resume
            </button>
          ) : (
                        <button
                          onClick={pauseSession}
                          className="bg-forest-green/20 hover:bg-forest-green/30 text-gray-200 px-5 py-2 rounded-lg font-semibold transition-all duration-200"
                        >
                          Pause
            </button>
          )}
                      <button
                        onClick={stopSession}
                        className="text-gray-400 hover:text-red-400 underline-offset-4 hover:underline transition-colors duration-200"
                      >
                        Stop
                      </button>
                      </>
                    )}
                  </div>

                {/* Status */}
                <div className={`text-sm font-medium ${
                  cycleSession?.isActive ? 'text-gray-300' : 'text-gray-500'
                }`}>
                  {cycleSession?.isActive 
                    ? (cycleSession.isPaused ? 'Session Paused' : 'Session Active')
                    : 'No active session'
                  }
                </div>
              </div>
            </div>

            {/* Session History - Compact Version */}
            <div className="bg-gray-800/50 rounded-2xl p-4 mt-3 shadow-lg border border-gray-700/30 flex-1">
                             <div className="flex justify-between items-center mb-3">
                 <h2 className="text-xl font-bold">Session History</h2>
                 <button 
                   onClick={clearHistory}
                   className="text-gray-400 hover:text-red-400 transition-colors duration-300 text-sm"
                 >
                   Clear
                 </button>
               </div>
              
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-full overflow-y-auto">
                 {sessionHistory.length > 0 ? (
                   sessionHistory.slice(0, 12).map((session) => (
                    <div
                      key={session.id}
                      className="bg-gray-700 rounded-xl p-2 flex justify-between items-center hover:bg-gray-600 transition-colors duration-300"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-lg ${
                          session.type === 'focus' ? 'text-forest-green' : 'text-yellow-400'
                        }`}>
                          {session.type === 'focus' ? 'Focus 🎯' : 'Break ☕'}
                        </span>
                        <div>
                          <div className="font-medium text-sm">
                            {session.type === 'focus' ? 'Focus' : 'Break'}
                          </div>
                          <div className="text-xs text-gray-400">{session.duration}</div>
                        </div>
                      </div>
                                             <div className="text-right">
                         <div className="text-xs text-gray-400">
                           {session.startTime} - {session.endTime}
                         </div>
                         <div className="text-xs text-gray-500">
                           {session.date}
                         </div>
                       </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-400 py-3 col-span-2">
                    No sessions recorded yet. Start your first focus session!
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Side - Forest and Eye Timer */}
          <div className="lg:col-span-1 flex flex-col h-full min-h-0">
                         {/* 30-30-30 Rule Timer */}
             <div className="bg-gray-800/50 rounded-2xl p-4 shadow-lg border border-gray-700/30 mb-4 flex-1">
               <h2 className="text-lg font-bold mb-3">30-30-30 Rule 👁️</h2>
               <div className="text-center flex flex-col justify-center h-full">
                 {eyeRuleActive ? (
                   <>
                     <div className="text-2xl font-bold text-[#a08dcc] mb-2">
                       {formatTime(eyeRuleTimer)}
                     </div>
                     <div className="text-xs text-gray-400">
                       Look at something 30 feet away for 30 seconds
                     </div>
                   </>
                                   ) : (
                    <>
                      <div className="text-2xl font-bold text-gray-400 mb-2">
                        30:00
                      </div>
                      <div className="text-xs text-gray-500">
                        Start a focus session to begin the timer
                      </div>
                    </>
                  )}
               </div>
             </div>

                         {/* Chill Music */}
             <div className="bg-gray-800/50 rounded-2xl p-2 shadow-lg border border-gray-700/30 mb-2">
               <div className="flex justify-between items-center mb-2">
                 <h2 className="text-lg font-bold">Chill Music 🎧</h2>
               </div>
               <p className="text-xs text-gray-400 mb-2">Volume is set to about 30% so tutorials stay audible.</p>
               
               
               {/* Single YouTube Player */}
               <div className="rounded-xl overflow-hidden">
                 <iframe
                   id="chillYoutube"
                   width="100%"
                   height="180"
                   src={`https://www.youtube.com/embed/${currentVideoId}?enablejsapi=1&modestbranding=1&rel=0&autoplay=1&mute=1`}
                   title="YouTube video player"
                   frameBorder="0"
                   allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                   referrerPolicy="strict-origin-when-cross-origin"
                   allowFullScreen
                 ></iframe>
               </div>
             </div>

            {/* Forest Section */}
            <div className="bg-gray-800/50 rounded-2xl p-4 shadow-lg border border-gray-700/30 flex-1">
                              <div className="flex justify-between items-center mb-3">
                <h2 className="text-xl font-bold flex items-center gap-2">Your Space <BsStars className="w-5 h-5"/></h2>
                <button
                  onClick={clearForest}
                  className="text-gray-400 hover:text-red-400 transition-colors duration-300 text-sm"
                >
                  Clear Space
                </button>
              </div>
              
              <div className="text-center mb-3">
                <div className="text-2xl font-bold text-forest-green">{forest.length}</div>
                <div className="text-sm text-gray-400">Stars Collected</div>
              </div>

              <div className="grid grid-cols-3 gap-3 flex-1">
                {forest.map((plant) => (
                  <div
                    key={plant.id}
                    className="bg-gray-700 rounded-xl p-2 text-center hover:bg-gray-600 transition-all duration-300 transform hover:scale-105 animate-grow"
                  >
                    <div className="text-xl mb-1">
                      <span role="img" aria-label="star">Star ✨</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(plant.plantedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>

              {forest.length === 0 && (
                <div className="text-center text-gray-400 py-4 flex-1 flex flex-col justify-center">
                  <div className="text-2xl mb-1">Space ✨</div>
                  <div className="text-sm">Complete focus sessions to light up your space!</div>
            </div>
          )}
            </div>
          </div>
        </div>
      </div>

      {/* Break Reminder Modal */}
      {showBreakReminder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-md mx-4 shadow-2xl">
            <h3 className="text-xl font-bold mb-3 text-center">⏰ Time for a Break!</h3>
            <p className="text-gray-300 mb-4 text-center">
              You've been studying for 2 hours. Take a 30-minute break to rest your mind and eyes.
            </p>
            <button
              onClick={dismissBreakReminder}
              className="w-full bg-forest-green hover:bg-forest-dark text-white py-2 rounded-xl font-semibold transition-colors duration-300"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Eye Reminder Modal */}
      {showEyeReminder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-md mx-4 shadow-2xl">
            <h3 className="text-xl font-bold mb-3 text-center">30-30-30 Rule 👁️</h3>
            <p className="text-gray-300 mb-4 text-center">
              Look at something 30 feet away for 30 seconds to reduce eye strain.
            </p>
            
            {/* Countdown Timer */}
            <div className="text-center mb-4">
              <div className="text-3xl font-bold text-[#a08dcc] mb-2">
                {eyeReminderCountdown}s
              </div>
              <div className="text-sm text-gray-400">
                Time remaining
              </div>
            </div>
            
            <button
              onClick={dismissEyeReminder}
              className="w-full bg-[#a08dcc] hover:bg-[#a08dcc] text-white py-2 rounded-xl font-semibold transition-colors duration-300"
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
