import type { Config } from "tailwindcss";

// Tokens are declared as CSS variables in app/globals.css and consumed here.
// Variables use oklch() directly — do NOT wrap with hsl() as that produces invalid CSS.
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // All oklch-based tokens — referenced directly as CSS custom properties
        background:          "var(--background)",
        foreground:          "var(--foreground)",
        card:                "var(--card)",
        "card-foreground":   "var(--card-foreground)",
        muted:               "var(--muted)",
        "muted-foreground":  "var(--muted-foreground)",
        border:              "var(--border)",
        input:               "var(--input)",
        ring:                "var(--ring)",
        primary:             "var(--primary)",
        "primary-foreground":"var(--primary-foreground)",
        secondary:           "var(--secondary)",
        "secondary-foreground":"var(--secondary-foreground)",
        accent:              "var(--accent)",
        "accent-foreground": "var(--accent-foreground)",
        popover:             "var(--popover)",
        "popover-foreground":"var(--popover-foreground)",
        destructive:         "var(--destructive)",
        // success/danger use raw HSL triplets — must keep hsl() wrapper
        success:             "hsl(var(--success))",
        danger:              "hsl(var(--danger))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
