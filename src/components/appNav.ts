import { createContext, useContext } from "react";

interface AppNav {
  /** How many things need attention (currently just the quarterly reminder). */
  reminderCount: number;
  /** Where tapping the logo/badge goes. */
  onLogoClick: () => void;
}

const AppNavContext = createContext<AppNav>({ reminderCount: 0, onLogoClick: () => {} });
export const AppNavProvider = AppNavContext.Provider;
export const useAppNav = () => useContext(AppNavContext);
