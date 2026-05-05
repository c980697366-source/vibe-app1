import { s } from "../styles";
import { getAvatarColor, renderRichText } from "../utils";

export function Match({
  myTodayMatchPosts, matchResults, matchLoading, hasMatched,
  onMatch, onChat, onProfile, t
}) {
  return (
    <div>
      <div style={s.sectionTitle}>🎯 {t.todayMatch}</div>

      {myTodayMatchPosts.length === 0 && (
        <div style={s.emptyMatch}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎯</div>
          <div>{t.needPost}</div>
        </div>
      )}

      {myTodayMatchPosts.length > 0 && !hasMatched && (
        <div style={{ textAlign: "center", padding: 24 }}>
          <button style={s.btnPrimary} onClick={onMatch}>{t.startMatch}</button>
        </div>
      )}

      {matchLoading && (
        <div style={s.emptyMatch}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div>{t.matching}</div>
        </div>
      )}

      {hasMatched && !matchLoading && matchResults.length === 0 && (
        <div style={s.emptyMatch}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
          <div style={{ marginBottom: 16 }}>{t.noMatch}</div>
          <button style={s.btnPrimary} onClick={onMatch}>{t.rematch}</button>
        </div>
      )}

      {matchResults.map(post => (
        <div key={post.id} style={{ ...s.card, borderLeft: "3px solid #f97316" }}>
          <div style={s.postHeader}>
            <div
              style={{ ...s.avatarPlaceholder, background: getAvatarColor(post.userId) }}
              onClick={() => onProfile(post.userId, post.user)}
            >
              {post.user?.[0]}
            </div>
            <div>
              <div style={s.username}>{post.user}</div>
              <div style={s.matchScore}>{t.matchScore(Math.round((post.score || 0) * 100))}</div>
            </div>
          </div>
          <div style={s.tagRow}>
            {post.tags?.map(tg => <span key={tg} style={s.tagBadge}>{tg}</span>)}
          </div>
          {post.note && <div style={s.noteText}>{renderRichText(post.note)}</div>}
          <button style={s.btnPrimary} onClick={() => onChat(post.userId, post.user)}>
            {t.startChat}
          </button>
        </div>
      ))}
    </div>
  );
}
