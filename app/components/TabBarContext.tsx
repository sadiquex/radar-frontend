"use client";

import { createContext, useContext } from "react";

/**
 * Lets a page inside the (tabs) group stand the tab bar down.
 *
 * Home's Create and Share steps own the whole viewport — a form with a bottom
 * CTA, and a share code — but they are steps inside a page, and a layout cannot
 * see page state. The alternative is extracting them to their own routes, which
 * is a refactor of a working flow and separate work.
 *
 * In its own module because a Next.js layout may only export the default
 * component and a fixed set of fields; a stray export from `layout.tsx` fails
 * the build with "not a valid Layout export field".
 */
export interface TabBarControl {
  setHidden: (hidden: boolean) => void;
}

export const TabBarContext = createContext<TabBarControl>({ setHidden: () => {} });

export function useHideTabBar(): TabBarControl {
  return useContext(TabBarContext);
}
