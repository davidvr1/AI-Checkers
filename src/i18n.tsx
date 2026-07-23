import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Difficulty, PieceColor } from './game/types';

export type Lang = 'en' | 'he';

/**
 * Every user-visible string in the app, grouped by screen. Colors and
 * difficulties are keyed maps (not `capitalize()` calls) because Hebrew has no
 * letter case -- the display form must come from the dictionary, not from
 * transforming the English word.
 */
export interface Translations {
  /** The label shown ON the toggle button: the name of the language it switches TO. */
  switchTo: string;
  /** Accessible name for the toggle button. */
  switchToAria: string;
  appTitle: string;
  rulesBlurb: string;
  masthead: {
    localTwoPlayer: string;
    humanVsAi: string;
    newGameEyebrow: string;
    newGameButton: string;
  };
  setup: {
    mode: string;
    vsHuman: string;
    vsAi: string;
    playOnline: string;
    yourColor: string;
    difficulty: string;
    startGame: string;
    onlineHint: string;
    createGame: string;
    joinGame: string;
    codePlaceholder: string;
    creating: string;
    codeInvalid: string;
    createFailed: string;
  };
  online: {
    eyebrow: string;
    connecting: string;
    connectionLost: string;
    waitingForOpponent: string;
    youArePlaying: (color: string) => string;
    spectating: string;
    spectator: string;
    gameCode: string;
    copyLink: string;
    copied: string;
    yourTurn: string;
    opponentTurn: string;
    rematch: string;
  };
  chat: {
    title: string;
    placeholder: string;
    send: string;
    empty: string;
  };
  video: {
    title: string;
    turnOn: string;
    turnOff: string;
    mute: string;
    unmute: string;
    enlarge: string;
    shrink: string;
    waitingOpponent: string;
    connecting: string;
    connectFailed: string;
    errors: { denied: string; 'no-device': string; unsupported: string; failed: string };
  };
  status: {
    toMove: string;
    gameOver: string;
    aiThinking: string;
    wins: (color: string) => string;
    draw: string;
    vsHuman: string;
    vsAiWith: (difficulty: string) => string;
    redCaptured: string;
    blackCaptured: string;
    turnsSinceCapture: string;
    selectedPiece: string;
    legalDestination: string;
  };
  colors: Record<PieceColor, string>;
  difficulties: Record<Difficulty, string>;
}

const en: Translations = {
  switchTo: 'עברית',
  switchToAria: 'Switch language to Hebrew',
  appTitle: 'Checkers, on the web',
  rulesBlurb:
    'Israeli/international draughts rules: captures are mandatory and multi-jumps chain, kings fly any distance along a diagonal -- click through every move, even a forced one.',
  masthead: {
    localTwoPlayer: 'Local two-player',
    humanVsAi: 'Human vs AI',
    newGameEyebrow: 'New game',
    newGameButton: 'New Game',
  },
  setup: {
    mode: 'Mode',
    vsHuman: 'vs Human',
    vsAi: 'vs AI',
    playOnline: 'Online',
    yourColor: 'Your color',
    difficulty: 'Difficulty',
    startGame: 'Start Game',
    onlineHint:
      'Create a game to get a private code, then share it (or the link) with your opponent. First to join is Red, second is Black.',
    createGame: 'Create game',
    joinGame: 'Join game',
    codePlaceholder: 'Game code',
    creating: 'Creating…',
    codeInvalid: 'Enter the game code your opponent shared.',
    createFailed: "Couldn't create a game — is the server running?",
  },
  online: {
    eyebrow: 'Online · same WiFi',
    connecting: 'Connecting…',
    connectionLost: 'Connection lost. Is the game server still running?',
    waitingForOpponent: 'Waiting for an opponent to join…',
    youArePlaying: (color) => `You are playing ${color}`,
    spectating: 'Both seats are taken — you are watching.',
    spectator: 'Spectator',
    gameCode: 'Game code',
    copyLink: 'Copy link',
    copied: 'Link copied!',
    yourTurn: 'Your turn',
    opponentTurn: "Opponent's turn",
    rematch: 'Rematch',
  },
  chat: {
    title: 'Chat',
    placeholder: 'Type a message…',
    send: 'Send',
    empty: 'No messages yet — say hello!',
  },
  video: {
    title: 'Video',
    turnOn: 'Turn on camera',
    turnOff: 'Turn off camera',
    mute: 'Mute mic',
    unmute: 'Unmute mic',
    enlarge: 'Enlarge video',
    shrink: 'Exit full screen',
    waitingOpponent: "Waiting for your opponent's camera…",
    connecting: 'Connecting to your opponent…',
    connectFailed:
      "Couldn't connect to your opponent's video. Make sure you're both on the same WiFi — some networks (guest/public) block direct device-to-device connections.",
    errors: {
      denied: 'Camera/microphone permission was denied. Allow it in your browser and try again.',
      'no-device': 'No camera was found on this device.',
      unsupported: 'Camera is not available here (a secure HTTPS connection is required).',
      failed: 'The camera could not be started.',
    },
  },
  status: {
    toMove: 'To move',
    gameOver: 'Game over',
    aiThinking: 'AI is thinking',
    wins: (color) => `${color} wins`,
    draw: 'Draw',
    vsHuman: 'vs Human',
    vsAiWith: (difficulty) => `vs AI · ${difficulty}`,
    redCaptured: 'Red captured',
    blackCaptured: 'Black captured',
    turnsSinceCapture: 'Turns since capture',
    selectedPiece: 'Selected piece',
    legalDestination: 'Legal destination',
  },
  colors: { red: 'Red', black: 'Black' },
  difficulties: { easy: 'Easy', medium: 'Medium', hard: 'Hard' },
};

const he: Translations = {
  switchTo: 'English',
  switchToAria: 'החלף שפה לאנגלית',
  appTitle: 'דמקה, ברשת',
  rulesBlurb:
    'חוקי דמקה ישראלית/בין-לאומית: אכילה היא חובה ורצף אכילות ממשיך, ומלכות עפות לכל מרחק באלכסון — יש ללחוץ על כל מהלך, גם מהלך כפוי.',
  masthead: {
    localTwoPlayer: 'שני שחקנים מקומיים',
    humanVsAi: 'אדם מול מחשב',
    newGameEyebrow: 'משחק חדש',
    newGameButton: 'משחק חדש',
  },
  setup: {
    mode: 'מצב משחק',
    vsHuman: 'מול אדם',
    vsAi: 'מול מחשב',
    playOnline: 'ברשת',
    yourColor: 'הצבע שלך',
    difficulty: 'רמת קושי',
    startGame: 'התחל משחק',
    onlineHint:
      'צור משחק כדי לקבל קוד פרטי, ואז שתף אותו (או את הקישור) עם היריב. הראשון שמצטרף משחק באדום, השני בשחור.',
    createGame: 'צור משחק',
    joinGame: 'הצטרף למשחק',
    codePlaceholder: 'קוד משחק',
    creating: 'יוצר…',
    codeInvalid: 'הזן את קוד המשחק ששיתף איתך היריב.',
    createFailed: 'לא ניתן ליצור משחק — האם השרת פועל?',
  },
  online: {
    eyebrow: 'ברשת · אותה WiFi',
    connecting: 'מתחבר…',
    connectionLost: 'החיבור אבד. האם שרת המשחק עדיין פועל?',
    waitingForOpponent: 'ממתין ליריב שיצטרף…',
    youArePlaying: (color) => `אתה משחק ב${color}`,
    spectating: 'שני המקומות תפוסים — אתה צופה במשחק.',
    spectator: 'צופה',
    gameCode: 'קוד משחק',
    copyLink: 'העתק קישור',
    copied: 'הקישור הועתק!',
    yourTurn: 'תורך',
    opponentTurn: 'תור היריב',
    rematch: 'משחק חוזר',
  },
  chat: {
    title: 'צ׳אט',
    placeholder: 'כתוב הודעה…',
    send: 'שלח',
    empty: 'אין הודעות עדיין — תגיד שלום!',
  },
  video: {
    title: 'וידאו',
    turnOn: 'הפעל מצלמה',
    turnOff: 'כבה מצלמה',
    mute: 'השתק מיקרופון',
    unmute: 'בטל השתקה',
    enlarge: 'הגדל וידאו',
    shrink: 'צא ממסך מלא',
    waitingOpponent: 'ממתין למצלמת היריב…',
    connecting: 'מתחבר ליריב…',
    connectFailed:
      'לא ניתן להתחבר לווידאו של היריב. ודאו ששניכם על אותה רשת WiFi — רשתות מסוימות (אורח/ציבורי) חוסמות חיבור ישיר בין מכשירים.',
    errors: {
      denied: 'ההרשאה למצלמה/מיקרופון נדחתה. אשר אותה בדפדפן ונסה שוב.',
      'no-device': 'לא נמצאה מצלמה במכשיר הזה.',
      unsupported: 'המצלמה אינה זמינה כאן (נדרש חיבור מאובטח HTTPS).',
      failed: 'לא ניתן להפעיל את המצלמה.',
    },
  },
  status: {
    toMove: 'תור',
    gameOver: 'המשחק הסתיים',
    aiThinking: 'המחשב חושב',
    wins: (color) => `${color} ניצח`,
    draw: 'תיקו',
    vsHuman: 'מול אדם',
    vsAiWith: (difficulty) => `מול מחשב · ${difficulty}`,
    redCaptured: 'אדום אכל',
    blackCaptured: 'שחור אכל',
    turnsSinceCapture: 'תורות ללא אכילה',
    selectedPiece: 'כלי נבחר',
    legalDestination: 'יעד חוקי',
  },
  colors: { red: 'אדום', black: 'שחור' },
  difficulties: { easy: 'קל', medium: 'בינוני', hard: 'קשה' },
};

const translations: Record<Lang, Translations> = { en, he };

export function isRtl(lang: Lang): boolean {
  return lang === 'he';
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: Translations;
  dir: 'ltr' | 'rtl';
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');

  // Reflect the choice onto the document element so page-level RTL, font, and
  // screen-reader language announcements follow. The board itself is pinned LTR
  // in its own markup so its grid orientation never mirrors (see App.tsx).
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr';
  }, [lang]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang,
      toggleLang: () => setLang((prev) => (prev === 'en' ? 'he' : 'en')),
      t: translations[lang],
      dir: isRtl(lang) ? 'rtl' : 'ltr',
    }),
    [lang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLang must be used within a LanguageProvider');
  }
  return ctx;
}
