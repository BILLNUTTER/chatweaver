import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatWindow } from "@/components/ChatWindow";
import { EmptyState } from "@/components/EmptyState";

export default function ChatPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

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

  const handleSelectConversation = (id: string) => setSelectedConversationId(id);
  const handleBack = () => setSelectedConversationId(null);

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
        ${selectedConversationId ? "hidden md:flex" : "flex w-full"}
        md:w-[380px] md:flex
      `}>
        <Sidebar
          selectedConversationId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
        />
      </div>

      <div className={`
        flex-1 h-full min-h-0 min-w-0 overflow-hidden
        ${selectedConversationId ? "flex" : "hidden md:flex"}
      `}>
        {selectedConversationId ? (
          <ChatWindow
            conversationId={selectedConversationId}
            onBack={handleBack}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
