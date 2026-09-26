import { useState, useRef, useEffect } from "react";
import { Search, MoreVertical, Send, Paperclip, Image, X, Reply, Trash2, ChevronDown, ArrowLeft, Clock } from "lucide-react";
import { Avatar } from "./Avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useMessages, type MessageWithSender } from "@/hooks/useMessages";
import { useConversations } from "@/hooks/useConversations";
import { format, isToday, isYesterday } from "date-fns";

interface ChatWindowProps {
  conversationId: string;
  onBack?: () => void;
}

export function ChatWindow({ conversationId, onBack }: ChatWindowProps) {
  const { user } = useAuth();
  const { conversations } = useConversations();
  const { messages, loading, typingUsers, sendMessage, deleteMessage, startTyping, stopTyping } = useMessages(conversationId);

  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<MessageWithSender | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const conv = conversations.find(c => c.id === conversationId);
  const otherUser = conv?.other_user;
  const chatName = conv?.is_group ? (conv.group_name ?? "Group") : (otherUser?.name ?? "Unknown");
  const chatPic = conv?.is_group ? conv.group_photo : otherUser?.profile_picture;

  const isOnline = (lastSeen?: string | null) => {
    if (!lastSeen) return false;
    return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
  };

  const lastSeenText = (lastSeen?: string | null): string => {
    if (!lastSeen) return "";
    const d = new Date(lastSeen);
    if (isToday(d)) return `last seen today at ${format(d, "HH:mm")}`;
    if (isYesterday(d)) return `last seen yesterday at ${format(d, "HH:mm")}`;
    return `last seen ${format(d, "dd/MM/yy")} at ${format(d, "HH:mm")}`;
  };

  const statusText = conv?.is_group
    ? `${conv.participants.length} participants`
    : otherUser
      ? isOnline(otherUser.last_seen)
        ? "online"
        : lastSeenText(otherUser.last_seen)
      : "";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 200);
  };

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  const handleSend = async () => {
    if (!input.trim()) return;
    const content = input;
    setInput("");
    setReplyTo(null);
    await sendMessage(content, replyTo?.id);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDelete = async (msgId: string) => {
    await deleteMessage(msgId);
    setHoveredId(null);
  };

  const getDateLabel = (date: Date) => {
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  };

  const groupedMessages = messages.reduce<{ date: string; messages: MessageWithSender[] }[]>((acc, msg) => {
    const date = getDateLabel(new Date(msg.created_at));
    const last = acc[acc.length - 1];
    if (last?.date === date) { last.messages.push(msg); }
    else acc.push({ date, messages: [msg] });
    return acc;
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[#efeae2] dark:bg-gray-950 relative">
      {/* Header */}
      <div className="sticky top-0 z-20 shrink-0 px-3 py-2.5 bg-[#f0f2f5] dark:bg-gray-900 flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        {/* Back button — mobile only */}
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden p-1.5 -ml-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-300 flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <Avatar
          src={chatPic}
          name={chatName}
          size="md"
          online={!conv?.is_group ? (otherUser?.last_seen ? isOnline(otherUser.last_seen) : undefined) : undefined}
        />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm text-gray-900 dark:text-white truncate">{chatName}</h2>
          <p className={`text-xs ${isOnline(otherUser?.last_seen) && !conv?.is_group ? "text-[#128C7E]" : "text-gray-500 dark:text-gray-400"}`}>
            {statusText}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400">
            <Search className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-1"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-[#128C7E] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {groupedMessages.map(({ date, messages: dayMsgs }) => (
              <div key={date}>
                <div className="flex justify-center my-4">
                  <span className="text-xs bg-white/80 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400 px-3 py-1 rounded-full shadow-sm">{date}</span>
                </div>
                {dayMsgs.map((msg, idx) => {
                  const isMe = msg.sender_id === user?.id;
                  const showAvatar = !isMe && (idx === 0 || dayMsgs[idx - 1]?.sender_id !== msg.sender_id);
                  const isConsecutive = idx > 0 && dayMsgs[idx - 1]?.sender_id === msg.sender_id;

                  return (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      isMe={isMe}
                      showAvatar={showAvatar}
                      isConsecutive={isConsecutive}
                      isGroup={conv?.is_group ?? false}
                      isHovered={hoveredId === msg.id}
                      onHover={setHoveredId}
                      onReply={setReplyTo}
                      onDelete={handleDelete}
                    />
                  );
                })}
              </div>
            ))}

            {/* Typing indicator */}
            {typingUsers.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <Avatar src={typingUsers[0].profile_picture} name={typingUsers[0].name} size="sm" />
                <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
                <span className="text-xs text-gray-500">{typingUsers[0].name} is typing...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 right-6 w-10 h-10 bg-white dark:bg-gray-800 shadow-lg rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      )}

      {/* Reply bar */}
      {replyTo && (
        <div className="shrink-0 sticky bottom-0 z-10 px-4 py-2 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex items-center gap-3">
          <div className="flex-1 bg-[#f0f2f5] dark:bg-gray-800 rounded-lg px-3 py-2 border-l-4 border-[#128C7E]">
            <p className="text-xs font-semibold text-[#128C7E]">{replyTo.sender?.name}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{replyTo.content ?? "Message"}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="shrink-0 sticky bottom-0 z-10 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] bg-[#f0f2f5] dark:bg-gray-900 flex items-end gap-3">
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400">
            <Paperclip className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400">
            <Image className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-2xl flex items-end shadow-sm">
          <textarea
            ref={inputRef}
            data-testid="input-message"
            value={input}
            onChange={e => { setInput(e.target.value); startTyping(); }}
            onKeyDown={handleKeyDown}
            onBlur={stopTyping}
            placeholder="Type a message"
            rows={1}
            className="flex-1 resize-none bg-transparent px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none max-h-32 overflow-y-auto placeholder-gray-400"
            style={{ minHeight: "44px" }}
          />
        </div>
        <button
          data-testid="button-send"
          onClick={handleSend}
          disabled={!input.trim()}
          className="w-11 h-11 flex-shrink-0 rounded-full bg-[#128C7E] hover:bg-[#0f7066] disabled:bg-gray-300 dark:disabled:bg-gray-700 flex items-center justify-center transition-colors shadow-sm"
        >
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}

interface BubbleProps {
  msg: MessageWithSender;
  isMe: boolean;
  showAvatar: boolean;
  isConsecutive: boolean;
  isGroup: boolean;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onReply: (msg: MessageWithSender) => void;
  onDelete: (id: string) => void;
}

function MessageBubble({ msg, isMe, showAvatar, isConsecutive, isGroup, isHovered, onHover, onReply, onDelete }: BubbleProps) {
  const isDeleted = msg.content === null && msg.is_edited;
  const isSystem = msg.is_system;

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs bg-[#d9fdd3] dark:bg-[#005c4b]/40 text-gray-600 dark:text-gray-300 px-3 py-1 rounded-full shadow-sm max-w-xs text-center">
          {msg.content}
        </span>
      </div>
    );
  }

  const bubbleClass = isMe
    ? "bg-[#dcf8c6] dark:bg-[#005c4b] rounded-2xl rounded-tr-none"
    : "bg-white dark:bg-gray-800 rounded-2xl rounded-tl-none";

  // Check read receipts
  const isRead = msg.read_by && msg.read_by.length > 1;

  return (
    <div
      className={`flex items-end gap-2 mb-1 ${isMe ? "flex-row-reverse" : "flex-row"} ${isConsecutive ? "mt-0.5" : "mt-3"}`}
      onMouseEnter={() => onHover(msg.id)}
      onMouseLeave={() => onHover(null)}
    >
      {!isMe && (
        <div className="w-8 flex-shrink-0">
          {showAvatar && <Avatar src={msg.sender?.profile_picture} name={msg.sender?.name ?? "?"} size="sm" />}
        </div>
      )}

      <div className="max-w-[65%] group relative">
        {/* Action buttons */}
        {isHovered && !isDeleted && (
          <div className={`absolute -top-8 ${isMe ? "right-0" : "left-0"} flex items-center gap-1 bg-white dark:bg-gray-800 rounded-full shadow-lg px-2 py-1 z-10`}>
            <button onClick={() => onReply(msg)} className="p-1 hover:text-[#128C7E] text-gray-500 transition-colors">
              <Reply className="w-3.5 h-3.5" />
            </button>
            {isMe && (
              <button onClick={() => onDelete(msg.id)} className="p-1 hover:text-red-500 text-gray-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        <div className={`px-3 py-2 shadow-sm ${bubbleClass}`}>
          {/* Sender name in groups */}
          {isGroup && !isMe && showAvatar && (
            <p className="text-xs font-semibold text-[#128C7E] mb-1">{msg.sender?.name}</p>
          )}

          {/* Reply preview */}
          {msg.reply_to_message && (
            <div className="mb-2 bg-black/5 dark:bg-white/10 rounded-lg px-2 py-1.5 border-l-2 border-[#128C7E]">
              <p className="text-xs font-semibold text-[#128C7E]">{msg.reply_to_message.sender?.name}</p>
              <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{msg.reply_to_message.content ?? "Message"}</p>
            </div>
          )}

          {/* Audio message */}
          {msg.audio_url ? (
            <audio controls src={msg.audio_url} className="max-w-[200px] h-8" />
          ) : isDeleted ? (
            <p className="text-sm italic text-gray-400">This message was deleted</p>
          ) : (
            <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap break-words">{msg.content}</p>
          )}

          {msg.is_edited && !isDeleted && (
            <span className="text-[10px] text-gray-400 ml-1">(edited)</span>
          )}

          {/* Timestamp + read receipt */}
          <div className="flex items-center gap-0.5 mt-1 justify-end">
            <span className="text-[10px] text-gray-500 dark:text-gray-400 mr-0.5">
              {format(new Date(msg.created_at), "HH:mm")}
            </span>
            {isMe && (
              msg._optimistic
                ? <Clock className="w-3 h-3 text-gray-400" />
                : isRead
                  ? <DoubleTick blue />
                  : <DoubleTick />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DoubleTick({ blue = false }: { blue?: boolean }) {
  const color = blue ? "#4FC3F7" : "#8696a0";
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" className="inline-block flex-shrink-0">
      <path d="M1 5.5L4.5 9L10 2" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M5 5.5L8.5 9L14 2" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
