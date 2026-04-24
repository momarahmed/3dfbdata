/**
 * Legacy `__esri` namespace for ArcGIS JS types (no official global in strict TS).
 * @see https://developers.arcgis.com/javascript/latest/
 */
export {};

declare global {
  namespace __esri {
    type Extent = import("@arcgis/core/geometry/Extent").default;
    type Point = import("@arcgis/core/geometry/Point").default;
    type GeometryProperties = import("@arcgis/core/geometry/Geometry").GeometryProperties;
    type SymbolProperties = import("@arcgis/core/symbols/Symbol").SymbolProperties;
    type PopupTemplateProperties = import("@arcgis/core/PopupTemplate").PopupTemplateProperties;
    type GraphicHit = import("@arcgis/core/views/types").GraphicHit;
  }
}
