import { useEffect } from "react";
import { s } from "../styles";
import { getAvatarColor } from "../utils";

export function Chats({ chatList, user, unreadCounts, onOpenChat, t }) {
  return (
    <div>
      <div style={s.sectionTitle}>💬 {t.chats}</div>
      {chatList.length === 0 && <div style={s.empty}>{t.noChats}</div>}
      {chatList.map(chat => {
        const otherId = chat.users.find(id => id !== user.uid);
        const otherName = chat.nicknames?.[otherId] || "User";
        const unread = unreadCounts[chat.id] || 0;
        return (
          <div
            key={chat.id}
            style={{ ...s.card, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
            onClick={() => onOpenChat(otherId, otherName)}
          >
            <div style={{ ...s.avatarPlaceholder, background: getAvatarColor(otherId), flexShrink: 0 }}>
              {otherName[0]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{otherName}</div>
              <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>{t.clickChat}</div>
            </div>
            {unread > 0 && <div style={s.unreadBadge}>{unread}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function ChatWindow({ chatTarget, messages, chatInput, setChatInput, user, profile, onSend, onBack, onClose, onProfile, markRead, t }) {
  useEffect(() => { markRead(); }, [markRead]);

  return (
    <div style={s.chatBox}>
      <div style={s.chatHeader}>
        <button style={s.btnSmall} onClick={onBack}>{t.back}</button>
        <span
          style={{ fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center" }}
          onClick={() => onProfile(chatTarget.userId, chatTarget.nickname)}
        >
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: "50%",
            background: getAvatarColor(chatTarget.userId), color: "#fff",
            fontSize: 13, fontWeight: 700, marginRight: 6,
          }}>{chatTarget.nickname?.[0]}</span>
          {chatTarget.nickname}
        </span>
        <button style={s.btnSmall} onClick={onClose}>{t.close}</button>
      </div>

      <div style={s.messageList}>
        {messages.length === 0 && (
          <div style={{ ...s.empty, padding: 20 }}>{t.noMessages}</div>
        )}
        {messages.map((m, i) => {
          const isMine = m.fromId === user.uid;
          return (
            <div key={i} style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 6,
              flexDirection: isMine ? "row-reverse" : "row"
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: isMine ? getAvatarColor(user.uid) : getAvatarColor(chatTarget.userId),
                color: "#fff", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 12, fontWeight: 700,
                cursor: !isMine ? "pointer" : "default",
              }}
                onClick={() => !isMine && onProfile(chatTarget.userId, chatTarget.nickname)}
              >
                {isMine ? profile?.nickname?.[0] : chatTarget.nickname?.[0]}
              </div>
              <div style={{
                ...s.messageBubble,
                background: isMine ? "#f97316" : "#f3f4f6",
                color: isMine ? "#fff" : "#111",
              }}>{m.text}</div>
            </div>
          );
        })}
      </div>

      <div style={s.chatInputRow}>
        <input
          style={{ ...s.input, flex: 1, marginBottom: 0 }}
          value={chatInput}
          placeholder={t.sendHint}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSend()}
        />
        <button style={s.btnOrange} onClick={onSend}>{t.send}</button>
      </div>
    </div>
  );
}
