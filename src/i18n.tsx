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
  };
  online: {
    eyebrow: string;
    connecting: string;
    connectionLost: string;
    waitingForOpponent: string;
    youArePlaying: (color: string) => string;
    spectating: string;
    yourTurn: string;
    opponentTurn: string;
    rematch: string;
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
    onlineHint: 'Two devices on the same WiFi play against each other. First to join is Red, second is Black.',
  },
  online: {
    eyebrow: 'Online · same WiFi',
    connecting: 'Connecting…',
    connectionLost: 'Connection lost. Is the game server still running?',
    waitingForOpponent: 'Waiting for an opponent to join…',
    youArePlaying: (color) => `You are playing ${color}`,
    spectating: 'Both seats are taken — you are watching.',
    yourTurn: 'Your turn',
    opponentTurn: "Opponent's turn",
    rematch: 'Rematch',
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
    onlineHint: 'שני מכשירים באותה רשת WiFi משחקים זה נגד זה. הראשון שמצטרף משחק באדום, השני בשחור.',
  },
  online: {
    eyebrow: 'ברשת · אותה WiFi',
    connecting: 'מתחבר…',
    connectionLost: 'החיבור אבד. האם שרת המשחק עדיין פועל?',
    waitingForOpponent: 'ממתין ליריב שיצטרף…',
    youArePlaying: (color) => `אתה משחק ב${color}`,
    spectating: 'שני המקומות תפוסים — אתה צופה במשחק.',
    yourTurn: 'תורך',
    opponentTurn: 'תור היריב',
    rematch: 'משחק חוזר',
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
