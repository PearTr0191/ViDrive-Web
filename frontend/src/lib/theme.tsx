import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'vidrive-theme'

function getInitialTheme(): Theme {
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'light' || stored === 'dark') return stored
    } catch {
      // localStorage unavailable
    }
  }
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('dark', 'light')
    root.classList.add(theme)
    // Keep the favicon in sync with the in-app theme. Two distinct files + a cache-busting
    // query guarantee Chromium re-fetches and repaints the tab icon on every toggle.
    const favicon = document.querySelector("link[rel~='icon']")
    if (favicon) {
      const file = theme === 'dark' ? '/favicon-dark.svg' : '/favicon-light.svg'
      favicon.setAttribute('href', `${file}?t=${theme}`)
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignore
    }
  }, [theme])

  const value: ThemeContextValue = {
    theme,
    setTheme: setThemeState,
    toggleTheme: () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}