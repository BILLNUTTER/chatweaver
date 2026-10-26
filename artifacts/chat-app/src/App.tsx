import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AuthPage from "@/pages/AuthPage";
import ChatPage from "@/pages/ChatPage";

const AdminPage = lazy(() => import("@/pages/AdminPage"));
const PublicProfilePage = lazy(() => import("@/pages/PublicProfilePage"));

const queryClient = new QueryClient();

function AppRoutes() {
  const { session, loading } = useAuth();
  const isAdminEntry = new URLSearchParams(window.location.search).has("admin");
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const profilePathPrefix = `${base}/u/`.replace(/^\/\//, "/");
  const isPublicProfilePath = window.location.pathname.startsWith(profilePathPrefix);

  if (loading && !isAdminEntry && !isPublicProfilePath) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#128C7E]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-white font-medium">Loading WhatsChat...</p>
        </div>
      </div>
    );
  }

  return (
    <WouterRouter base={base}>
      <Suspense fallback={<RouteLoading />}>
        <Switch>
          <Route path="/u/:username" component={PublicProfilePage} />
          <Route path="/">
            {isAdminEntry ? <AdminPage /> : session ? <ChatPage /> : <AuthPage />}
          </Route>
          <Route>
            {isAdminEntry ? <AdminPage /> : session ? <ChatPage /> : <AuthPage />}
          </Route>
        </Switch>
      </Suspense>
    </WouterRouter>
  );
}

function RouteLoading() {
  return <div className="min-h-[100dvh] grid place-items-center bg-[#e8f3f1] text-sm text-[#52706d] dark:bg-[#101b1c] dark:text-[#b0c8c4]">Loading WhatsChat…</div>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
