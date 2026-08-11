import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Eye, EyeOff } from "lucide-react";
import { mongoLogin, mongoRegister, setMongoToken } from "@/lib/storage";

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z.string().min(3, "Username must be at least 3 characters").regex(/^[a-z0-9_]+$/, "Only lowercase letters, numbers, underscores"),
  email: z.string().email("Invalid email"),
  phone: z.string().min(7, "Invalid phone number").regex(/^\+?[0-9\s\-()+]+$/, "Invalid phone format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirm_password: z.string(),
}).refine(d => d.password === d.confirm_password, { message: "Passwords don't match", path: ["confirm_password"] });

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", username: "", email: "", phone: "", password: "", confirm_password: "" },
  });

  const handleLogin = async (data: LoginForm) => {
    setLoading(true);
    try {
      const result = await mongoLogin(data.email, data.password);
      setMongoToken(result.token);
      window.location.reload();
    } catch (error) {
      toast({ title: "Login failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (data: RegisterForm) => {
    setLoading(true);
    try {
      const result = await mongoRegister({
        name: data.name,
        username: data.username,
        email: data.email,
        phone: data.phone,
        password: data.password,
      });
      setMongoToken(result.token);
      toast({ title: "Welcome!", description: "Account created successfully." });
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error. Please try again.";
      toast({ title: "Registration error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#128C7E] to-[#075E54] dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/10 backdrop-blur mb-4">
            <MessageCircle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">WhatsChat</h1>
          <p className="text-white/70 mt-1 text-sm">Simple. Reliable. Private.</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-100 dark:border-gray-800">
            <button
              data-testid="tab-login"
              onClick={() => setMode("login")}
              className={`flex-1 py-4 text-sm font-semibold transition-colors ${mode === "login" ? "text-[#128C7E] border-b-2 border-[#128C7E]" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}
            >
              Sign In
            </button>
            <button
              data-testid="tab-register"
              onClick={() => setMode("register")}
              className={`flex-1 py-4 text-sm font-semibold transition-colors ${mode === "register" ? "text-[#128C7E] border-b-2 border-[#128C7E]" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}
            >
              Create Account
            </button>
          </div>

          <div className="p-8">
            {mode === "login" ? (
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                <Field label="Email" error={loginForm.formState.errors.email?.message}>
                  <input
                    data-testid="input-email"
                    type="email"
                    {...loginForm.register("email")}
                    placeholder="you@example.com"
                    className={inputCls}
                  />
                </Field>
                <Field label="Password" error={loginForm.formState.errors.password?.message}>
                  <div className="relative">
                    <input
                      data-testid="input-password"
                      type={showPassword ? "text" : "password"}
                      {...loginForm.register("password")}
                      placeholder="••••••••"
                      className={inputCls + " pr-10"}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-gray-400">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </Field>
                <button data-testid="button-submit-login" type="submit" disabled={loading} className={submitCls}>
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>
            ) : (
              <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Full Name" error={registerForm.formState.errors.name?.message}>
                    <input data-testid="input-name" {...registerForm.register("name")} placeholder="Your name" className={inputCls} />
                  </Field>
                  <Field label="Username" error={registerForm.formState.errors.username?.message}>
                    <input data-testid="input-username" {...registerForm.register("username")} placeholder="@handle" className={inputCls} />
                  </Field>
                </div>
                <Field label="Email" error={registerForm.formState.errors.email?.message}>
                  <input data-testid="input-register-email" type="email" {...registerForm.register("email")} placeholder="you@example.com" className={inputCls} />
                </Field>
                <Field label="Phone Number" error={registerForm.formState.errors.phone?.message}>
                  <input data-testid="input-phone" type="tel" {...registerForm.register("phone")} placeholder="+1 234 567 8900" className={inputCls} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Password" error={registerForm.formState.errors.password?.message}>
                    <div className="relative">
                      <input data-testid="input-register-password" type={showPassword ? "text" : "password"} {...registerForm.register("password")} placeholder="••••••••" className={inputCls + " pr-10"} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-gray-400">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </Field>
                  <Field label="Confirm" error={registerForm.formState.errors.confirm_password?.message}>
                    <input data-testid="input-confirm-password" type={showPassword ? "text" : "password"} {...registerForm.register("confirm_password")} placeholder="••••••••" className={inputCls} />
                  </Field>
                </div>
                <button data-testid="button-submit-register" type="submit" disabled={loading} className={submitCls}>
                  {loading ? "Creating account..." : "Create Account"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#128C7E] text-sm transition";
const submitCls = "w-full py-3 bg-[#128C7E] hover:bg-[#0f7066] text-white font-semibold rounded-xl transition-colors disabled:opacity-60 mt-2";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}
