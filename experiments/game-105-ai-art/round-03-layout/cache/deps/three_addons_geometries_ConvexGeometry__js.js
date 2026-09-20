import {
  ConvexHull
} from "./chunk-CULDPS2E.js";
import {
  BufferGeometry,
  Float32BufferAttribute
} from "./chunk-YOWFAJAG.js";

// node_modules/three/examples/jsm/geometries/ConvexGeometry.js
var ConvexGeometry = class extends BufferGeometry {
  /**
   * Constructs a new convex geometry.
   *
   * @param {Array<Vector3>} points - An array of points in 3D space which should be enclosed by the convex hull.
   */
  constructor(points = []) {
    super();
    const vertices = [];
    const normals = [];
    const convexHull = new ConvexHull().setFromPoints(points);
    const faces = convexHull.faces;
    for (let i = 0; i < faces.length; i++) {
      const face = faces[i];
      let edge = face.edge;
      do {
        const point = edge.head().point;
        vertices.push(point.x, point.y, point.z);
        normals.push(face.normal.x, face.normal.y, face.normal.z);
        edge = edge.next;
      } while (edge !== face.edge);
    }
    this.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    this.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  }
};
export {
  ConvexGeometry
};
//# sourceMappingURL=three_addons_geometries_ConvexGeometry__js.js.map
