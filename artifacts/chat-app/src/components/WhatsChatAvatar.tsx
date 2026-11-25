import { MessageCircle } from "lucide-react";

export function WhatsChatAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };
  const icons = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-[#128c7e] text-white ${sizes[size]}`} aria-label="WhatsChat">
      <MessageCircle className={icons[size]} strokeWidth={2.4} />
    </span>
  );
}
