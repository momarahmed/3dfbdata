import type Map from "@arcgis/core/Map";
import type MapView from "@arcgis/core/views/MapView";

/**
 * Toggles between two basemap string ids. Replaces the deprecated
 * {@link https://developers.arcgis.com/javascript/latest/references/core/widgets/BasemapToggle/ BasemapToggle} widget
 * (use Esri map web components in new greenfield apps; a plain button keeps React + dynamic imports simple).
 */
export function addBasemapToggleToView(
  view: MapView,
  primary: string,
  secondary: string,
  position: "bottom-left" | "bottom-right" = "bottom-right"
): { remove: () => void } {
  const map = view.map as Map;
  const wrap = document.createElement("div");
  wrap.className = "esri-component esri-widget";
  const btn = document.createElement("button");
  btn.className = "esri-widget--button";
  btn.type = "button";
  let useSecondary = false;

  const refresh = () => {
    btn.textContent = useSecondary ? "Map" : "Aerial";
    btn.title = useSecondary ? "Use vector / street map" : "Use hybrid imagery";
    btn.setAttribute("aria-pressed", useSecondary ? "true" : "false");
  };

  refresh();
  btn.addEventListener("click", () => {
    useSecondary = !useSecondary;
    map.basemap = useSecondary ? secondary : primary;
    refresh();
  });

  wrap.appendChild(btn);
  view.ui.add(wrap, position);
  return {
    remove: () => {
      try {
        view.ui.remove(wrap);
      } catch {
        /* view may already be destroyed */
      }
    },
  };
}
