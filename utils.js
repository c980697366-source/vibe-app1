import { AVATAR_COLORS, MATCH_WINDOW_MS } from "./constants";

export const todayStr = () => new Date().toISOString().slice(0, 10);

export const getChatId = (a, b) => [a, b].sort().join("_");

export const getAvatarColor = (uid) => {
  if (!uid) return AVATAR_COLORS[0];
  const idx = uid.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
};

export const isWithin24h = (createdAt) => Date.now() - createdAt < MATCH_WINDOW_MS;

export const parseMentionsAndTopics = (text) => {
  const mentions = [];
  const topics = [];
  const regex = /[@#][\u4e00-\u9fa5\w]+/g;
  const matches = text.match(regex) || [];
  matches.forEach(m => {
    if (m.startsWith("@")) mentions.push(m.slice(1));
    if (m.startsWith("#")) topics.push(m.slice(1));
  });
  return { mentions, topics };
};

export const renderRichText = (text) => {
  if (!text) return null;
  const parts = text.split(/([@#][\u4e00-\u9fa5\w]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) return <span key={i} style={{ color: "#3b82f6", fontWeight: 600 }}>{part}</span>;
    if (part.startsWith("#")) return <span key={i} style={{ color: "#f97316", fontWeight: 600, cursor: "pointer" }}>{part}</span>;
    return part;
  });
};

export const localMatch = (myPost, candidates, COMPLEMENT_MAP) => {
  return candidates.map(p => {
    let score = 0;
    const wanted = myPost.tags?.flatMap(t => COMPLEMENT_MAP[t] || [t]) || [];
    const tagMatch = p.tags?.filter(t => wanted.includes(t)).length || 0;
    score += tagMatch * 0.4;
    const modeWanted = COMPLEMENT_MAP[myPost.mode] || [myPost.mode];
    if (modeWanted.includes(p.mode)) score += 0.3;
    const myWords = (myPost.note || "").split(/\s+|，|。|！|？/).filter(Boolean);
    const pWords = (p.note || "").split(/\s+|，|。|！|？/).filter(Boolean);
    const commonWords = myWords.filter(w => w.length > 1 && pWords.includes(w)).length;
    score += Math.min(commonWords * 0.1, 0.3);
    return { ...p, score: Math.min(score, 1) };
  }).sort((a, b) => b.score - a.score);
};

export const aiMatch = async (myPost, candidates, COMPLEMENT_MAP) => {
  try {
    const myText = `${myPost.mode} ${myPost.tags?.join(" ")} ${myPost.note || ""}`.trim();
    const list = candidates.map(p => ({
      id: p.id,
      content: `${p.mode} ${p.tags?.join(" ")} ${p.note || ""}`.trim(),
      ...p,
    }));
    const res = await fetch("/api/embedding-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ myText, list }),
    });
    if (!res.ok) throw new Error("server error");
    return await res.json();
  } catch {
    return localMatch(myPost, candidates, COMPLEMENT_MAP);
  }
};
