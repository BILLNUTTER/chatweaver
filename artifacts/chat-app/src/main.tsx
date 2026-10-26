import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getMongoToken } from "@/lib/storage";
import App from "./App";
import "./index.css";

const ADMIN_TOKEN_KEY = "admin_token";
setAuthTokenGetter(() => {
  const isAdminEntry = new URLSearchParams(window.location.search).has("admin");
  if (isAdminEntry) return window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
  return getMongoToken();
});

createRoot(document.getElementById("root")!).render(<App />);
