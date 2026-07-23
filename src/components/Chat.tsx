import { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n';
import type { ChatMessage, Role } from '../net/protocol';

interface ChatProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  ownRole: Role | null;
  disabled?: boolean;
}

/**
 * Free-text chat for the online game. Messages come from the server (already
 * validated and tagged with the sender's role); this only renders them and sends
 * new lines. Text is rendered as React children, so it is escaped -- no HTML
 * injection from what another player types.
 */
export function Chat({ messages, onSend, ownRole, disabled }: ChatProps) {
  const { t } = useLang();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const label = (from: Role) => (from === 'spectator' ? t.online.spectator : t.colors[from]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <div className="chat">
      <div className="chat-title">{t.chat.title}</div>
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">{t.chat.empty}</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`chat-msg from-${m.from}${ownRole === m.from ? ' mine' : ''}`}>
              <span className="chat-from">{label(m.from)}</span>
              <span className="chat-text">{m.text}</span>
            </div>
          ))
        )}
      </div>
      <form className="chat-input" onSubmit={submit}>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t.chat.placeholder}
          maxLength={500}
          disabled={disabled}
          aria-label={t.chat.title}
        />
        <button type="submit" disabled={disabled || draft.trim().length === 0}>
          {t.chat.send}
        </button>
      </form>
    </div>
  );
}
