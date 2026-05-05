import { useState, useEffect, useCallback } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, getDocs, query, orderBy,
  doc, setDoc, getDoc, updateDoc, onSnapshot, where
} from "firebase/firestore";
import { getChatId, isWithin24h } from "../utils";

export function useChat(user, profile, posts) {
  const [chatList, setChatList] = useState([]);
  const [chatTarget, setChatTarget] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [friendIds, setFriendIds] = useState([]);

  const fetchChatList = useCallback(async () => {
    if (!user) return;
    const q = query(collection(db, "matchFriends"), where("users", "array-contains", user.uid));
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setChatList(list);
    setFriendIds(list.flatMap(c => c.users).filter(id => id !== user.uid));
  }, [user]);

  useEffect(() => { fetchChatList(); }, [fetchChatList]);

  useEffect(() => {
    if (!user || chatList.length === 0) return;
    const unsubs = chatList.map(chat => {
      const q = query(
        collection(db, "messages"),
        where("chatId", "==", chat.id),
        where("toId", "==", user.uid),
        where("read", "==", false)
      );
      return onSnapshot(q, snap => {
        setUnreadCounts(prev => ({ ...prev, [chat.id]: snap.size }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, [user, chatList]);

  useEffect(() => {
    if (!chatTarget || !user) return;
    const chatId = getChatId(user.uid, chatTarget.userId);
    const q = query(
      collection(db, "messages"),
      where("chatId", "==", chatId),
      orderBy("createdAt")
    );
    const unsub = onSnapshot(q, snap =>
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [chatTarget, user]);

  const markRead = useCallback(async () => {
    if (!chatTarget || !user) return;
    const chatId = getChatId(user.uid, chatTarget.userId);
    const q = query(
      collection(db, "messages"),
      where("chatId", "==", chatId),
      where("toId", "==", user.uid),
      where("read", "==", false)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => updateDoc(d.ref, { read: true }));
    setUnreadCounts(prev => ({ ...prev, [chatId]: 0 }));
  }, [chatTarget, user]);

  const openChat = async (targetUserId, targetNickname, t) => {
    const isFriend = friendIds.includes(targetUserId);
    if (!isFriend) {
      const myMatchPosts = posts.filter(p =>
        p.userId === user?.uid && p.isMatchPost && isWithin24h(p.createdAt)
      );
      if (myMatchPosts.length === 0) return alert(t.needPostFirst);
    }
    setChatTarget({ userId: targetUserId, nickname: targetNickname });
    const chatId = getChatId(user.uid, targetUserId);
    const friendRef = doc(db, "matchFriends", chatId);
    const snap = await getDoc(friendRef);
    if (!snap.exists()) {
      await setDoc(friendRef, {
        users: [user.uid, targetUserId],
        nicknames: { [user.uid]: profile.nickname, [targetUserId]: targetNickname },
        createdAt: Date.now(),
      });
      await fetchChatList();
    }
    return "chat";
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || !chatTarget) return;
    const chatId = getChatId(user.uid, chatTarget.userId);
    await addDoc(collection(db, "messages"), {
      chatId, from: profile.nickname, fromId: user.uid,
      to: chatTarget.nickname, toId: chatTarget.userId,
      text: chatInput, createdAt: Date.now(), read: false,
    });
    setChatInput("");
  };

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  return {
    chatList, chatTarget, setChatTarget,
    chatInput, setChatInput,
    messages, unreadCounts, totalUnread,
    friendIds, fetchChatList,
    openChat, sendMessage, markRead,
  };
}
