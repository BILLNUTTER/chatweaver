import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatWindow } from "@/components/ChatWindow";
import { EmptyState } from "@/components/EmptyState";

export default function ChatPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const handleSelectConversation = (id: string) => setSelectedConversationId(id);
  const handleBack = () => setSelectedConversationId(null);

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden overscroll-none bg-white dark:bg-gray-900 transition-colors duration-200">
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
