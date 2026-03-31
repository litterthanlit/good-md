import { useEffect, useMemo, useState } from "react";
import { loadState, saveState } from "../lib/store";
import type { ThemePreference } from "../lib/types";

type ResolvedTheme = "light" | "dark";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function useThemePreference() {
  const [themePreference, setThemePreference] =
    useState<ThemePreference>("system");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    getSystemTheme(),
  );
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    loadState()
      .then((state) => {
        setThemePreference(state.themePreference);
        setInitialized(true);
      })
      .catch(() => setInitialized(true));
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const updateTheme = (event?: MediaQueryListEvent) => {
      setSystemTheme(event?.matches ?? mediaQuery.matches ? "dark" : "light");
    };

    updateTheme();
    mediaQuery.addEventListener("change", updateTheme);

    return () => {
      mediaQuery.removeEventListener("change", updateTheme);
    };
  }, []);

  const resolvedTheme = useMemo(
    () => (themePreference === "system" ? systemTheme : themePreference),
    [themePreference, systemTheme],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (!initialized) return;
    saveState({ themePreference }).catch(() => {});
  }, [themePreference, initialized]);

  return {
    themePreference,
    resolvedTheme,
    setThemePreference,
  };
}
