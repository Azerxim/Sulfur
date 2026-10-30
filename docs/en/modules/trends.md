# Trends module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/trends.md)

- Periodic sampling (50 ms minimum) of up to 8 points: server variables and points, values monitored
  by the OPC UA and Modbus clients (booleans as 0 / 1). The last 100,000 samples are kept.
- Real-time chart with a sliding window (1 min to 1 h, or the whole recording), drag to zoom,
  crosshair and tooltip listing every curve; one shared chart (one axis) or one chart per point
  for points on different scales. Colorblind-safe palette, light and dark variants.
- Table of the points with the value at the cursor (or the last one), min and max.
- **CSV export** (`;` separator, ISO timestamps, decimal point or comma), one column per point.
