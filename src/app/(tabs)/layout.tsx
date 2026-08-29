import { TabBar } from "@/components/nav/tab-bar";

/**
 * The five signed-in destinations, grouped so the tab bar is a *layout* rather
 * than part of each page.
 *
 * Two things follow from that, and both are the point:
 *
 * - The bar survives a navigation between tabs. React keeps a layout mounted
 *   and re-renders only the segment below it, so the icons and the active
 *   indicator move the instant the click lands instead of waiting for the
 *   destination's data.
 * - `loading.tsx` beside this file can paint. A boundary only covers what is
 *   *below* it, so the skeleton replaces the page while the bar stays put.
 *
 * Deliberately synchronous, with nothing awaited. Anything fetched here would
 * block above the loading boundary — the navigation would sit on the old screen
 * waiting for it, which is the behaviour this group exists to remove. Every
 * page below still calls `requireAccount()` for itself.
 *
 * Home (`/`) is not in this group: it renders a signed-out landing as well as
 * the signed-in screen, and a layout cannot tell which one it got. It keeps its
 * own `<TabBar />`, so only Home↔tab remounts the bar — the other twenty
 * combinations do not.
 */
export default function TabsLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {children}
      <TabBar />
    </>
  );
}
