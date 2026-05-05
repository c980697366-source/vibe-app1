import { useState, useEffect } from "react";
import { s } from "../styles";
import { MODE_OPTIONS, TAG_OPTIONS, PROMPT_HINTS } from "../constants";

export function PostForm({ user, myTodayMatchCount, totalQuota, onPost, t }) {
  const [mode, setMode] = useState(MODE_OPTIONS[0]);
  const [tags, setTags] = useState([]);
  const [postText, setPostText] = useState("");
  const [isMatchPost, setIsMatchPost] = useState(true);
  const [postVisibility, setPostVisibility] = useState("public");
  const [currentHint, setCurrentHint] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrentHint(h => (h + 1) % PROMPT_HINTS.length), 4000);
    return () => clearInterval(timer);
  }, []);

  const remaining = totalQuota - myTodayMatchCount;

  const toggleTag = (tag) => {
    setTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : prev.length < 3 ? [...prev, tag] : prev
    );
  };

  const handleSubmit = async () => {
    const result = await onPost({ mode, tags, postText, isMatchPost, postVisibility });
    if (result) {
      setPostText("");
      setTags([]);
    }
  };

  return (
    <div style={s.card}>
      <div style={s.cardTitle}>
        <span>{isMatchPost ? `📍 ${t.postMatch}` : `✏️ ${t.postNormal}`}</span>
        <div style={s.postTypeToggle}>
          <button
            style={{ ...s.typeBtn, ...(isMatchPost ? s.typeBtnActive : {}) }}
            onClick={() => setIsMatchPost(true)}
          >{t.postMatch}</button>
          <button
            style={{ ...s.typeBtn, ...(!isMatchPost ? s.typeBtnActive : {}) }}
            onClick={() => setIsMatchPost(false)}
          >{t.postNormal}</button>
        </div>
      </div>

      {isMatchPost && (
        <>
          <div style={s.fieldLabel}>{t.modeLabel}</div>
          <div style={s.tagRow}>
            {MODE_OPTIONS.map(m => (
              <button
                key={m}
                style={{ ...s.tag, ...(mode === m ? s.tagActive : {}) }}
                onClick={() => setMode(m)}
              >{m}</button>
            ))}
          </div>
          <div style={s.fieldLabel}>{t.tagLabel}</div>
          <div style={s.tagRow}>
            {TAG_OPTIONS.map(tg => (
              <button
                key={tg}
                style={{ ...s.tag, ...(tags.includes(tg) ? s.tagActive : {}) }}
                onClick={() => toggleTag(tg)}
              >{tg}</button>
            ))}
          </div>
        </>
      )}

      <textarea
        style={s.textarea}
        placeholder={PROMPT_HINTS[currentHint]}
        maxLength={200}
        value={postText}
        rows={3}
        onChange={e => setPostText(e.target.value)}
      />
      <div style={s.charCount}>{postText.length}/200</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={s.fieldLabel}>{t.visibility}：</span>
        {[
          { val: "public", label: t.public },
          { val: "followers", label: t.followers },
          { val: "mutual", label: t.mutual },
        ].map(({ val, label }) => (
          <button
            key={val}
            style={{ ...s.typeBtn, ...(postVisibility === val ? s.typeBtnActive : {}) }}
            onClick={() => setPostVisibility(val)}
          >{label}</button>
        ))}
      </div>

      <button
        style={{ ...s.btnPrimary, opacity: isMatchPost && remaining === 0 ? 0.5 : 1 }}
        onClick={handleSubmit}
        disabled={isMatchPost && remaining === 0}
      >
        {isMatchPost
          ? remaining === 0 ? t.quotaFull : t.publishRemaining(remaining)
          : t.postNormal
        }
      </button>
    </div>
  );
}
