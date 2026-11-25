export const SYSTEM_AVATARS = [
  { id: "avatar:wave", label: "Wave", emoji: "👋" },
  { id: "avatar:sun", label: "Sun", emoji: "🌞" },
  { id: "avatar:flower", label: "Flower", emoji: "🌼" },
  { id: "avatar:leaf", label: "Leaf", emoji: "🍀" },
  { id: "avatar:moon", label: "Moon", emoji: "🌙" },
  { id: "avatar:star", label: "Star", emoji: "⭐" },
  { id: "avatar:cat", label: "Cat", emoji: "🐱" },
  { id: "avatar:dog", label: "Dog", emoji: "🐶" },
  { id: "avatar:panda", label: "Panda", emoji: "🐼" },
  { id: "avatar:lion", label: "Lion", emoji: "🦁" },
  { id: "avatar:football", label: "Football", emoji: "⚽" },
  { id: "avatar:heart", label: "Heart", emoji: "💚" },
] as const;

export function getSystemAvatar(value?: string | null) {
  return SYSTEM_AVATARS.find(avatar => avatar.id === value);
}

export function isValidProfilePicture(value: string): boolean {
  if (!value) return true;
  if (getSystemAvatar(value)) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && value.length <= 2048;
  } catch {
    return false;
  }
}
