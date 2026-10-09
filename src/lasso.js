// Freehand lasso selection — geometry.
//
// Selection rule (documented in the README):
//   An object is selected when at least half of its sample points fall inside
//   the lasso. Strokes, lines and arrows are sampled along their actual path;
//   every other object (text, shapes, images) is sampled at its four corners
//   and centre, with rotation applied. So a stroke you mostly circled is
//   picked up, and a big image you only nicked the edge of is not.
//   Grouped objects are selected as a whole group.

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function rotate([x, y], [cx, cy], angle) {
  if (!angle) return [x, y];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos];
}

export function samplePoints(el) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  if (Array.isArray(el.points) && el.points.length) {
    // Linear/freedraw: points are relative to (x, y). Thin long strokes can
    // have hundreds of points; 40 samples is plenty for a majority vote.
    const step = Math.max(1, Math.floor(el.points.length / 40));
    const pts = [];
    for (let i = 0; i < el.points.length; i += step) {
      const [px, py] = el.points[i];
      pts.push(rotate([el.x + px, el.y + py], [cx, cy], el.angle));
    }
    return pts;
  }
  return [
    [el.x, el.y],
    [el.x + el.width, el.y],
    [el.x, el.y + el.height],
    [el.x + el.width, el.y + el.height],
    [cx, cy],
  ].map((p) => rotate(p, [cx, cy], el.angle));
}

export function isInsideLasso(el, poly) {
  const pts = samplePoints(el);
  const hits = pts.filter(([x, y]) => pointInPolygon(x, y, poly)).length;
  return hits / pts.length >= 0.5;
}

/**
 * @param elements  live scene elements
 * @param poly      lasso polygon in scene coordinates
 * @param mode      "new" | "add" | "remove"
 * @param current   current appState.selectedElementIds
 * @returns { selectedElementIds, selectedGroupIds }
 */
export function computeLassoSelection(elements, poly, mode, current = {}) {
  const live = elements.filter((e) => !e.isDeleted && !e.locked);
  const byId = new Map(live.map((e) => [e.id, e]));

  // Text bound inside a shape follows its container.
  const hit = new Set(
    live
      .filter((e) => !e.containerId && isInsideLasso(e, poly))
      .map((e) => e.id),
  );

  // Expand to whole outermost groups.
  const groupsHit = new Set();
  for (const id of hit) {
    const g = byId.get(id).groupIds;
    if (g && g.length) groupsHit.add(g[g.length - 1]);
  }
  for (const e of live) {
    const g = e.groupIds;
    if (g && g.length && groupsHit.has(g[g.length - 1])) hit.add(e.id);
  }

  let ids;
  if (mode === "add") ids = new Set([...Object.keys(current).filter((k) => current[k]), ...hit]);
  else if (mode === "remove") ids = new Set(Object.keys(current).filter((k) => current[k] && !hit.has(k)));
  else ids = hit;

  // Bound text rides along with its container.
  for (const e of live) {
    if (e.containerId && ids.has(e.containerId)) ids.add(e.id);
  }

  const selectedElementIds = {};
  ids.forEach((id) => byId.has(id) && (selectedElementIds[id] = true));

  // A group counts as selected only if every member is selected.
  const selectedGroupIds = {};
  const members = new Map();
  for (const e of live) {
    const g = e.groupIds;
    if (!g || !g.length) continue;
    const outer = g[g.length - 1];
    if (!members.has(outer)) members.set(outer, []);
    members.get(outer).push(e.id);
  }
  for (const [gid, list] of members) {
    if (list.every((id) => selectedElementIds[id])) selectedGroupIds[gid] = true;
  }
  return { selectedElementIds, selectedGroupIds };
}
