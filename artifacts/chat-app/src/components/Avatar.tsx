import { getSystemAvatar } from "@/lib/profile-avatars";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  online?: boolean;
  className?: string;
}

const sizeMap = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-12 h-12 text-base", xl: "w-16 h-16 text-xl" };
const emojiSizeMap = { sm: "text-base", md: "text-xl", lg: "text-2xl", xl: "text-3xl" };
const dotMap = { sm: "w-2.5 h-2.5 border-[1.5px]", md: "w-3 h-3 border-2", lg: "w-3.5 h-3.5 border-2", xl: "w-4 h-4 border-2" };

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
}

function getColor(name: string) {
  const colors = ["bg-[#128C7E]", "bg-[#075E54]", "bg-purple-500", "bg-blue-500", "bg-pink-500", "bg-orange-500", "bg-indigo-500", "bg-teal-500"];
  return colors[name.charCodeAt(0) % colors.length];
}

export function Avatar({ src, name, size = "md", online, className = "" }: AvatarProps) {
  const systemAvatar = getSystemAvatar(src);
  const isHttpImage = Boolean(src && /^https?:\/\//i.test(src));
  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      {systemAvatar ? (
        <div className={`${sizeMap[size]} ${emojiSizeMap[size]} grid place-items-center rounded-full bg-[#e8f3f1] select-none dark:bg-[#203334]`} role="img" aria-label={`${systemAvatar.label} avatar`}>
          {systemAvatar.emoji}
        </div>
      ) : isHttpImage ? (
        <img src={src ?? undefined} alt={name} className={`${sizeMap[size]} rounded-full object-cover`} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <div className={`${sizeMap[size]} ${getColor(name)} rounded-full flex items-center justify-center text-white font-semibold select-none`}>
          {getInitials(name)}
        </div>
      )}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 ${dotMap[size]} rounded-full border-white dark:border-gray-900 ${online ? "bg-green-500" : "bg-red-500"}`}
        />
      )}
    </div>
  );
}
