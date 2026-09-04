import * as React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation";

export interface ThemeToggleProps {
  variant?: "default" | "compact";
  className?: string;
}

const ThemeToggle = React.forwardRef<HTMLButtonElement, ThemeToggleProps>(
  ({ variant = "default", className, ...props }, ref) => {
    const { theme, setTheme } = useTheme();
    const { t } = useTranslation();

    const toggleTheme = () => {
      const currentTheme = theme || "light";
      if (currentTheme === "dark") {
        setTheme("light");
      } else {
        setTheme("dark");
      }
    };

    const isDark = theme === "dark";
    const ariaLabel = isDark
      ? t("common.theme_toggle.switch_to_light", "Switch to light mode")
      : t("common.theme_toggle.switch_to_dark", "Switch to dark mode");

    if (variant === "compact") {
      return (
        <Button
          ref={ref}
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={ariaLabel}
          className={cn("transition-all duration-200", className)}
          {...props}
        >
          {isDark ? (
            <Sun className="h-4 w-4 transition-all duration-200" />
          ) : (
            <Moon className="h-4 w-4 transition-all duration-200" />
          )}
        </Button>
      );
    }

    return (
      <Button
        ref={ref}
        variant="ghost"
        size="sm"
        onClick={toggleTheme}
        aria-label={ariaLabel}
        className={cn(
          "transition-all duration-200 hover:bg-accent hover:text-accent-foreground",
          className
        )}
        {...props}
      >
        {isDark ? (
          <>
            <Sun className="h-4 w-4 transition-all duration-200" />
            <span>{t("common.theme_toggle.light_mode", "Light Mode")}</span>
          </>
        ) : (
          <>
            <Moon className="h-4 w-4 transition-all duration-200" />
            <span>{t("common.theme_toggle.dark_mode", "Dark Mode")}</span>
          </>
        )}
      </Button>
    );
  }
);

ThemeToggle.displayName = "ThemeToggle";

export default ThemeToggle;

