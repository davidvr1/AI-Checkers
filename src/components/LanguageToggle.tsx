import { useLang } from '../i18n';

/**
 * Fixed top-corner button that flips the whole UI between English and Hebrew.
 * Its label is always the name of the language it switches TO, so it reads as an
 * action ("press for עברית" / "press for English") rather than a status.
 */
export function LanguageToggle() {
  const { t, toggleLang, lang } = useLang();
  return (
    <button
      type="button"
      className="lang-toggle"
      onClick={toggleLang}
      aria-label={t.switchToAria}
      lang={lang === 'en' ? 'he' : 'en'}
    >
      <span aria-hidden="true" className="lang-globe">
        🌐
      </span>
      {t.switchTo}
    </button>
  );
}
