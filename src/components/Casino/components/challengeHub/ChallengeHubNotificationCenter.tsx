import { memo, useMemo, useState } from 'react'
import { useInAppNotificationStore } from '../../../../store/inAppNotificationStore'

export const ChallengeHubNotificationCenter = memo(function ChallengeHubNotificationCenter() {
  const [open, setOpen] = useState(false)
  const items = useInAppNotificationStore((s) => s.items)
  const markRead = useInAppNotificationStore((s) => s.markRead)
  const markAllRead = useInAppNotificationStore((s) => s.markAllRead)
  const clear = useInAppNotificationStore((s) => s.clear)
  const unreadCount = useMemo(() => items.reduce((n, x) => n + (x.read ? 0 : 1), 0), [items])

  return (
    <div className="challenge-hub-inbox">
      <button
        type="button"
        className="challenge-hub-action"
        onClick={() => setOpen((v) => !v)}
        title="Open notification center"
      >
        Inbox {unreadCount > 0 ? `(${unreadCount})` : ''}
      </button>
      {open && (
        <div className="challenge-hub-inbox-panel">
          <div className="challenge-hub-inbox-head">
            <strong className="text-xs text-[var(--text)]">Notifications</strong>
            <div className="challenge-hub-inbox-actions">
              <button type="button" className="challenge-hub-action" onClick={markAllRead}>Read all</button>
              <button type="button" className="challenge-hub-action" onClick={clear}>Clear</button>
            </div>
          </div>
          <div className="challenge-hub-inbox-list">
            {items.length === 0 ? (
              <div className="challenge-hub-inbox-empty">No notifications yet.</div>
            ) : (
              items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => markRead(item.id)}
                  className={`challenge-hub-inbox-item ${item.read ? 'is-read' : 'is-unread'}`.trim()}
                >
                  <div className="challenge-hub-inbox-item-row">
                    <span className="challenge-hub-inbox-item-title">{item.title}</span>
                    <span className="challenge-hub-inbox-item-time">{new Date(item.ts).toLocaleTimeString('de-DE')}</span>
                  </div>
                  {item.body ? <div className="challenge-hub-inbox-item-body">{item.body}</div> : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
})
