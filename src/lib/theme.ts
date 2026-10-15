export const themeChoices = [
  {
    id: "teal",
    label: "Teal",
    vars: {
      "--primary": "168 72% 27%",
      "--ring": "168 72% 27%",
      "--sidebar": "168 68% 15%",
      "--accent": "168 42% 94%",
      "--accent-foreground": "168 72% 22%",
      "--hero": "168 74% 26%",
      "--canvas": "216 16% 90%",
    },
  },
  {
    id: "navy",
    label: "Navy",
    vars: {
      "--primary": "221 70% 32%",
      "--ring": "221 70% 32%",
      "--sidebar": "222 47% 14%",
      "--accent": "214 70% 94%",
      "--accent-foreground": "221 70% 28%",
      "--hero": "221 70% 32%",
      "--canvas": "214 24% 92%",
    },
  },
  {
    id: "plum",
    label: "Plum",
    vars: {
      "--primary": "270 50% 36%",
      "--ring": "270 50% 36%",
      "--sidebar": "270 35% 16%",
      "--accent": "270 40% 95%",
      "--accent-foreground": "270 45% 30%",
      "--hero": "270 50% 36%",
      "--canvas": "270 20% 94%",
    },
  },
  {
    id: "amber",
    label: "Amber",
    vars: {
      "--primary": "28 80% 32%",
      "--ring": "28 80% 32%",
      "--sidebar": "24 40% 14%",
      "--accent": "36 80% 94%",
      "--accent-foreground": "24 70% 28%",
      "--hero": "28 80% 32%",
      "--canvas": "36 30% 93%",
    },
  },
] as const;

export type AppTheme = (typeof themeChoices)[number]["id"];

const STORAGE_KEY = "starline.theme.v1";

export function loadTheme(): AppTheme {
  const raw = localStorage.getItem(STORAGE_KEY);
  return themeChoices.some((theme) => theme.id === raw) ? (raw as AppTheme) : "teal";
}

export function applyTheme(id: AppTheme) {
  const theme = themeChoices.find((item) => item.id === id) ?? themeChoices[0];
  for (const [key, value] of Object.entries(theme.vars)) {
    document.documentElement.style.setProperty(key, value);
  }
}

export function saveTheme(id: AppTheme) {
  localStorage.setItem(STORAGE_KEY, id);
  applyTheme(id);
}

export function applySavedTheme() {
  applyTheme(loadTheme());
}
