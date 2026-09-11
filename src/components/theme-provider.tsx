import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type Density = "compact" | "comfortable" | "spacious";

export const ACCENTS = [
  { id: "indigo", label: "Indigo", hue: 268, chroma: 0.17 },
  { id: "azure", label: "Azure", hue: 238, chroma: 0.17 },
  { id: "cyan", label: "Cyan", hue: 205, chroma: 0.14 },
  { id: "teal", label: "Teal", hue: 175, chroma: 0.13 },
  { id: "lime", label: "Lime", hue: 135, chroma: 0.15 },
  { id: "amber", label: "Amber", hue: 75, chroma: 0.15 },
  { id: "rose", label: "Rose", hue: 15, chroma: 0.17 },
  { id: "magenta", label: "Magenta", hue: 330, chroma: 0.17 },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

type ThemeState = {
  mode: ThemeMode;
  accent: AccentId;
  density: Density;
  radius: number;
};

const DEFAULTS: ThemeState = {
  mode: "system",
  accent: "indigo",
  density: "comfortable",
  radius: 0.75,
};

const STORAGE_KEY = "opspilot.theme";

type ThemeContextValue = ThemeState & {
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentId) => void;
  setDensity: (density: Density) => void;
  setRadius: (radius: number) => void;
  reset: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(state: ThemeState) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prefersDark =
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = state.mode === "dark" || (state.mode === "system" && prefersDark);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";

  const accent = ACCENTS.find((a) => a.id === state.accent) ?? ACCENTS[0];
  root.style.setProperty("--brand-hue", String(accent.hue));
  root.style.setProperty("--brand-chroma", String(accent.chroma));
  root.style.setProperty("--radius", `${state.radius}rem`);
  root.dataset["density"] = state.density;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ThemeState>(DEFAULTS);

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<ThemeState>) });
      else applyTheme(DEFAULTS);
    } catch {
      applyTheme(DEFAULTS);
    }
  }, []);

  useEffect(() => {
    applyTheme(state);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  }, [state]);

  useEffect(() => {
    if (state.mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(state);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [state]);

  const patch = useCallback(
    (next: Partial<ThemeState>) => setState((prev) => ({ ...prev, ...next })),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...state,
      setMode: (mode) => patch({ mode }),
      setAccent: (accent) => patch({ accent }),
      setDensity: (density) => patch({ density }),
      setRadius: (radius) => patch({ radius }),
      reset: () => setState(DEFAULTS),
    }),
    [state, patch],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
