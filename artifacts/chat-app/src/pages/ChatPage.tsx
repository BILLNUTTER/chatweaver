import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatWindow } from "@/components/ChatWindow";
import { WhatsChatSystemWindow } from "@/components/WhatsChatSystemWindow";
import { EmptyState } from "@/components/EmptyState";
import { useConversations } from "@/hooks/useConversations";

export default function ChatPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedAdminChatId, setSelectedAdminChatId] = useState<string | null>(null);
  const { conversations, allConversations, loading, refetch, markConversationRead, updateConversationPreview } = useConversations();

  useEffect(() => {
    const pendingConversationId = window.sessionStorage.getItem("whatschat_open_conversation");
    if (!pendingConversationId) return;
    window.sessionStorage.removeItem("whatschat_open_conversation");
    setSelectedAdminChatId(null);
    setSelectedConversationId(pendingConversationId);
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewport = () => {
      document.documentElement.style.setProperty(
        "--chat-viewport-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
      document.documentElement.style.setProperty(
        "--chat-viewport-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
    };

    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      document.documentElement.style.removeProperty("--chat-viewport-height");
      document.documentElement.style.removeProperty("--chat-viewport-top");
    };
  }, []);

  const handleSelectConversation = (id: string) => {
    setSelectedAdminChatId(null);
    setSelectedConversationId(id);
  };
  const handleSelectAdminChat = (id: string) => {
    setSelectedConversationId(null);
    setSelectedAdminChatId(id);
  };
  const handleBack = () => {
    setSelectedConversationId(null);
    setSelectedAdminChatId(null);
  };
  const hasSelectedChat = Boolean(selectedConversationId || selectedAdminChatId);

  return (
    <div
      className="fixed inset-x-0 flex min-h-0 overflow-hidden overscroll-none bg-white dark:bg-gray-900 transition-colors duration-200"
      style={{
        top: "var(--chat-viewport-top, 0px)",
        height: "var(--chat-viewport-height, 100dvh)",
      }}
    >
      <div className={`
        flex-shrink-0 h-full min-h-0 overflow-hidden
        ${hasSelectedChat ? "hidden md:flex" : "flex w-full"}
        md:w-[380px] md:flex
      `}>
        <Sidebar
          selectedConversationId={selectedConversationId}
          selectedAdminChatId={selectedAdminChatId}
          onSelectConversation={handleSelectConversation}
          onSelectAdminChat={handleSelectAdminChat}
          conversations={conversations}
          conversationsLoading={loading}
          markConversationRead={markConversationRead}
          refetchConversations={refetch}
        />
      </div>

      <div className={`
        flex-1 h-full min-h-0 min-w-0 overflow-hidden
        ${hasSelectedChat ? "flex" : "hidden md:flex"}
      `}>
        {selectedAdminChatId ? (
          <WhatsChatSystemWindow threadId={selectedAdminChatId} onBack={handleBack} />
        ) : selectedConversationId ? (
          <ChatWindow
            conversationId={selectedConversationId}
            conversation={allConversations.find(conversation => conversation.id === selectedConversationId) ?? null}
            onConversationActivity={updateConversationPreview}
            onBack={handleBack}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
