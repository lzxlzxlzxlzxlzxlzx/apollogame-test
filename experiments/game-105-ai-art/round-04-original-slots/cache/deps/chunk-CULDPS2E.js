import {
  Line3,
  Plane,
  Triangle,
  Vector3
} from "./chunk-YOWFAJAG.js";

// node_modules/three/examples/jsm/math/ConvexHull.js
var Visible = 0;
var Deleted = 1;
var _v1 = new Vector3();
var _line3 = new Line3();
var _plane = new Plane();
var _closestPoint = new Vector3();
var _triangle = new Triangle();
var ConvexHull = class {
  /**
   * Constructs a new convex hull.
   */
  constructor() {
    this.tolerance = -1;
    this.faces = [];
    this.newFaces = [];
    this.assigned = new VertexList();
    this.unassigned = new VertexList();
    this.vertices = [];
  }
  /**
   * Computes to convex hull for the given array of points.
   *
   * @param {Array<Vector3>} points - The array of points in 3D space.
   * @return {ConvexHull} A reference to this convex hull.
   */
  setFromPoints(points) {
    if (points.length >= 4) {
      this.makeEmpty();
      for (let i = 0, l = points.length; i < l; i++) {
        this.vertices.push(new VertexNode(points[i]));
      }
      this._compute();
    }
    return this;
  }
  /**
   * Computes the convex hull of the given 3D object (including its descendants),
   * accounting for the world transforms of both the 3D object and its descendants.
   *
   * @param {Object3D} object - The 3D object to compute the convex hull for.
   * @return {ConvexHull} A reference to this convex hull.
   */
  setFromObject(object) {
    const points = [];
    object.updateMatrixWorld(true);
    object.traverse(function(node) {
      const geometry = node.geometry;
      if (geometry !== void 0) {
        const attribute = geometry.attributes.position;
        if (attribute !== void 0) {
          for (let i = 0, l = attribute.count; i < l; i++) {
            const point = new Vector3();
            point.fromBufferAttribute(attribute, i).applyMatrix4(node.matrixWorld);
            points.push(point);
          }
        }
      }
    });
    return this.setFromPoints(points);
  }
  /**
   * Returns `true` if the given point lies in the convex hull.
   *
   * @param {Vector3} point - The point to test.
   * @return {boolean} Whether the given point lies in the convex hull or not.
   */
  containsPoint(point) {
    const faces = this.faces;
    for (let i = 0, l = faces.length; i < l; i++) {
      const face = faces[i];
      if (face.distanceToPoint(point) > this.tolerance) return false;
    }
    return true;
  }
  /**
   * Computes the intersections point of the given ray and this convex hull.
   *
   * @param {Ray} ray - The ray to test.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {?Vector3} The intersection point. Returns `null` if not intersection was detected.
   */
  intersectRay(ray, target) {
    const faces = this.faces;
    let tNear = -Infinity;
    let tFar = Infinity;
    for (let i = 0, l = faces.length; i < l; i++) {
      const face = faces[i];
      const vN = face.distanceToPoint(ray.origin);
      const vD = face.normal.dot(ray.direction);
      if (vN > 0 && vD >= 0) return null;
      const t = vD !== 0 ? -vN / vD : 0;
      if (t <= 0) continue;
      if (vD > 0) {
        tFar = Math.min(t, tFar);
      } else {
        tNear = Math.max(t, tNear);
      }
      if (tNear > tFar) {
        return null;
      }
    }
    if (tNear !== -Infinity) {
      ray.at(tNear, target);
    } else {
      ray.at(tFar, target);
    }
    return target;
  }
  /**
   * Returns `true` if the given ray intersects with this convex hull.
   *
   * @param {Ray} ray - The ray to test.
   * @return {boolean} Whether the given ray intersects with this convex hull or not.
   */
  intersectsRay(ray) {
    return this.intersectRay(ray, _v1) !== null;
  }
  /**
   * Makes the convex hull empty.
   *
   * @return {ConvexHull} A reference to this convex hull.
   */
  makeEmpty() {
    this.faces = [];
    this.vertices = [];
    return this;
  }
  // private
  /**
   * Adds a vertex to the 'assigned' list of vertices and assigns it to the given face.
   *
   * @private
   * @param {VertexNode} vertex - The vertex to add.
   * @param {Face} face - The target face.
   * @return {ConvexHull} A reference to this convex hull.
   */
  _addVertexToFace(vertex, face) {
    vertex.face = face;
    if (face.outside === null) {
      this.assigned.append(vertex);
    } else {
      this.assigned.insertBefore(face.outside, vertex);
    }
    face.outside = vertex;
    return this;
  }
  /**
   * Removes a vertex from the 'assigned' list of vertices and from the given face.
   * It also makes sure that the link from 'face' to the first vertex it sees in 'assigned'
   * is linked correctly after the removal.
   *
   * @private
   * @param {VertexNode} vertex - The vertex to remove.
   * @param {Face} face - The target face.
   * @return {ConvexHull} A reference to this convex hull.
   */
  _removeVertexFromFace(vertex, face) {
    if (vertex === face.outside) {
      if (vertex.next !== null && vertex.next.face === face) {
        face.outside = vertex.next;
      } else {
        face.outside = null;
      }
    }
    this.assigned.remove(vertex);
    return this;
  }
  /**
   * Removes all the visible vertices that a given face is able to see which are stored in
   * the 'assigned' vertex list.
   *
   * @private
   * @param {Face} face - The target face.
   * @return {VertexNode|undefined} A reference to this convex hull.
   */
  _removeAllVerticesFromFace(face) {
    if (face.outside !== null) {
      const start = face.outside;
      let end = face.outside;
      while (end.next !== null && end.next.face === face) {
        end = end.next;
      }
      this.assigned.removeSubList(start, end);
      start.prev = end.next = null;
      face.outside = null;
      return start;
    }
  }
  /**
   * Removes all the visible vertices that `face` is able to see.
   *
   * - If `absorbingFace` doesn't exist, then all the removed vertices will be added to the 'unassigned' vertex list.
   * - If `absorbingFace` exists, then this method will assign all the vertices of 'face' that can see 'absorbingFace'.
   * - If a vertex cannot see `absorbingFace`, it's added to the 'unassigned' vertex list.
   *
   * @private
   * @param {Face} face - The given face.
   * @param {Face} [absorbingFace] - An optional face that tries to absorb the vertices of the first face.
   * @return {ConvexHull} A reference to this convex hull.
   */
  _deleteFaceVertices(face, absorbingFace) {
    const faceVertices = this._removeAllVerticesFromFace(face);
    if (faceVertices !== void 0) {
      if (absorbingFace === void 0) {
        this.unassigned.appendChain(faceVertices);
      } else {
        let vertex = faceVertices;
        do {
          const nextVertex = vertex.next;
          const distance = absorbingFace.distanceToPoint(vertex.point);
          if (distance > this.tolerance) {
            this._addVertexToFace(vertex, absorbingFace);
          } else {
            this.unassigned.append(vertex);
          }
          vertex = nextVertex;
        } while (vertex !== null);
      }
    }
    return this;
  }
  /**
   * Reassigns as many vertices as possible from the unassigned list to the new faces.
   *
   * @private
   * @param {Array<Face>} newFaces - The new faces.
   * @return {ConvexHull} A reference to this convex hull.
   */
  _resolveUnassignedPoints(newFaces) {
    if (this.unassigned.isEmpty() === false) {
      let vertex = this.unassigned.first();
      do {
        const nextVertex = vertex.next;
        let maxDistance = this.tolerance;
        let maxFace = null;
        for (let i = 0; i < newFaces.length; i++) {
          const face = newFaces[i];
          if (face.mark === Visible) {
            const distance = face.distanceToPoint(vertex.point);
            if (distance > maxDistance) {
              maxDistance = distance;
              maxFace = face;
            }
            if (maxDistance > 1e3 * this.tolerance) break;
          }
        }
        if (maxFace !== null) {
          this._addVertexToFace(vertex, maxFace);
        }
        vertex = nextVertex;
      } while (vertex !== null);
    }
    return this;
  }
  /**
   * Computes the extremes values (min/max vectors) which will be used to
   * compute the initial hull.
   *
   * @private
   * @return {Object} The extremes.
   */
  _computeExtremes() {
    const min = new Vector3();
    const max = new Vector3();
    const minVertices = [];
    const maxVertices = [];
    for (let i = 0; i < 3; i++) {
      minVertices[i] = maxVertices[i] = this.vertices[0];
    }
    min.copy(this.vertices[0].point);
    max.copy(this.vertices[0].point);
    for (let i = 0, l = this.vertices.length; i < l; i++) {
      const vertex = this.vertices[i];
      const point = vertex.point;
      for (let j = 0; j < 3; j++) {
        if (point.getComponent(j) < min.getComponent(j)) {
          min.setComponent(j, point.getComponent(j));
          minVertices[j] = vertex;
        }
      }
      for (let j = 0; j < 3; j++) {
        if (point.getComponent(j) > max.getComponent(j)) {
          max.setComponent(j, point.getComponent(j));
          maxVertices[j] = vertex;
        }
      }
    }
    this.tolerance = 3 * Number.EPSILON * (Math.max(Math.abs(min.x), Math.abs(max.x)) + Math.max(Math.abs(min.y), Math.abs(max.y)) + Math.max(Math.abs(min.z), Math.abs(max.z)));
    return { min: minVertices, max: maxVertices };
  }
  /**
   * Computes the initial simplex assigning to its faces all the points that are
   * candidates to form part of the hull.
   *
   * @private
   * @return {ConvexHull} A reference to this convex hull.
   */
  _computeInitialHull() {
    const vertices = this.vertices;
    const extremes = this._computeExtremes();
    const min = extremes.min;
    const max = extremes.max;
    let maxDistance = 0;
    let index = 0;
    for (let i = 0; i < 3; i++) {
      const distance = max[i].point.getComponent(i) - min[i].point.getComponent(i);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    const v0 = min[index];
    const v1 = max[index];
    let v2;
    let v3;
    maxDistance = 0;
    _line3.set(v0.point, v1.point);
    for (let i = 0, l = this.vertices.length; i < l; i++) {
      const vertex = vertices[i];
      if (vertex !== v0 && vertex !== v1) {
        _line3.closestPointToPoint(vertex.point, true, _closestPoint);
        const distance = _closestPoint.distanceToSquared(vertex.point);
        if (distance > maxDistance) {
          maxDistance = distance;
          v2 = vertex;
        }
      }
    }
    maxDistance = -1;
    _plane.setFromCoplanarPoints(v0.point, v1.point, v2.point);
    for (let i = 0, l = this.vertices.length; i < l; i++) {
      const vertex = vertices[i];
      if (vertex !== v0 && vertex !== v1 && vertex !== v2) {
        const distance = Math.abs(_plane.distanceToPoint(vertex.point));
        if (distance > maxDistance) {
          maxDistance = distance;
          v3 = vertex;
        }
      }
    }
    const faces = [];
    if (_plane.distanceToPoint(v3.point) < 0) {
      faces.push(
        Face.create(v0, v1, v2),
        Face.create(v3, v1, v0),
        Face.create(v3, v2, v1),
        Face.create(v3, v0, v2)
      );
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        faces[i + 1].getEdge(2).setTwin(faces[0].getEdge(j));
        faces[i + 1].getEdge(1).setTwin(faces[j + 1].getEdge(0));
      }
    } else {
      faces.push(
        Face.create(v0, v2, v1),
        Face.create(v3, v0, v1),
        Face.create(v3, v1, v2),
        Face.create(v3, v2, v0)
      );
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        faces[i + 1].getEdge(2).setTwin(faces[0].getEdge((3 - i) % 3));
        faces[i + 1].getEdge(0).setTwin(faces[j + 1].getEdge(1));
      }
    }
    for (let i = 0; i < 4; i++) {
      this.faces.push(faces[i]);
    }
    for (let i = 0, l = vertices.length; i < l; i++) {
      const vertex = vertices[i];
      if (vertex !== v0 && vertex !== v1 && vertex !== v2 && vertex !== v3) {
        maxDistance = this.tolerance;
        let maxFace = null;
        for (let j = 0; j < 4; j++) {
          const distance = this.faces[j].distanceToPoint(vertex.point);
          if (distance > maxDistance) {
            maxDistance = distance;
            maxFace = this.faces[j];
          }
        }
        if (maxFace !== null) {
          this._addVertexToFace(vertex, maxFace);
        }
      }
    }
    return this;
  }
  /**
   * Removes inactive (e.g. deleted) faces from the internal face list.
   *
   * @private
   * @return {ConvexHull} A reference to this convex hull.
   */
  _reindexFaces() {
    const activeFaces = [];
    for (let i = 0; i < this.faces.length; i++) {
      const face = this.faces[i];
      if (face.mark === Visible) {
        activeFaces.push(face);
      }
    }
    this.faces = activeFaces;
    return this;
  }
  /**
   * Finds the next vertex to create faces with the current hull.
   *
   * - Let the initial face be the first face existing in the 'assigned' vertex list.
   * - If a face doesn't exist then return since there're no vertices left.
   * - Otherwise for each vertex that face sees find the one furthest away from it.
   *
   * @private
   * @return {?VertexNode} The next vertex to add.
   */
  _nextVertexToAdd() {
    if (this.assigned.isEmpty() === false) {
      let eyeVertex, maxDistance = 0;
      const eyeFace = this.assigned.first().face;
      let vertex = eyeFace.outside;
      do {
        const distance = eyeFace.distanceToPoint(vertex.point);
        if (distance > maxDistance) {
          maxDistance = distance;
          eyeVertex = vertex;
        }
        vertex = vertex.next;
      } while (vertex !== null && vertex.face === eyeFace);
      return eyeVertex;
    }
  }
  /**
   * Computes a chain of half edges in CCW order called the 'horizon'. For an edge
   * to be part of the horizon it must join a face that can see 'eyePoint' and a face
   * that cannot see 'eyePoint'.
   *
   * @private
   * @param {Vector3} eyePoint - The 3D-coordinates of a point.
   * @param {HalfEdge} crossEdge - The edge used to jump to the current face.
   * @param {Face} face - The current face being tested.
   * @param {Array<HalfEdge>} horizon - The edges that form part of the horizon in CCW order.
   * @return {ConvexHull} A reference to this convex hull.
   */
  _computeHorizon(eyePoint, crossEdge, face, horizon) {
    this._deleteFaceVertices(face);
    face.mark = Deleted;
    let edge;
    if (crossEdge === null) {
      edge = crossEdge = face.getEdge(0);
    } else {
      edge = crossEdge.next;
    }
    do {
      const twinEdge = edge.twin;
      const oppositeFace = twinEdge.face;
      if (oppositeFace.mark === Visible) {
        if (oppositeFace.distanceToPoint(eyePoint) > this.tolerance) {
          this._computeHorizon(eyePoint, twinEdge, oppositeFace, horizon);
        } else {
          horizon.push(edge);
        }
      }
      edge = edge.next;
    } while (edge !== crossEdge);
    return this;
  }
  /**
   * Creates a face with the vertices 'eyeVertex.point', 'horizonEdge.tail' and 'horizonEdge.head'
   * in CCW order. All the half edges are created in CCW order thus the face is always pointing
   * outside the hull.
   *
   * @private
   * @param {VertexNode} eyeVertex - The vertex that is added to the hull.
   * @param {HalfEdge} horizonEdge - A single edge of the horizon.
   * @return {HalfEdge} The half edge whose vertex is the eyeVertex.
   */
  _addAdjoiningFace(eyeVertex, horizonEdge) {
    const face = Face.create(eyeVertex, horizonEdge.tail(), horizonEdge.head());
    this.faces.push(face);
    face.getEdge(-1).setTwin(horizonEdge.twin);
    return face.getEdge(0);
  }
  /**
   * Adds 'horizon.length' faces to the hull, each face will be linked with the horizon
   * opposite face and the face on the left/right.
   *
   * @private
   * @param {VertexNode} eyeVertex - The vertex that is added to the hull.
   * @param {Array<HalfEdge>} horizon - The horizon.
   * @return {ConvexHull} A reference to this convex hull.
   */
  _addNewFaces(eyeVertex, horizon) {
    this.newFaces = [];
    let firstSideEdge = null;
    let previousSideEdge = null;
    for (let i = 0; i < horizon.length; i++) {
      const horizonEdge = horizon[i];
      const sideEdge = this._addAdjoiningFace(eyeVertex, horizonEdge);
      if (firstSideEdge === null) {
        firstSideEdge = sideEdge;
      } else {
        sideEdge.next.setTwin(previousSideEdge);
      }
      this.newFaces.push(sideEdge.face);
      previousSideEdge = sideEdge;
    }
    firstSideEdge.next.setTwin(previousSideEdge);
    return this;
  }
  /**
   * Adds a vertex to the hull with the following algorithm:
   *
   * - Compute the 'horizon' which is a chain of half edges. For an edge to belong to this group
   * it must be the edge connecting a face that can see 'eyeVertex' and a face which cannot see 'eyeVertex'.
   * - All the faces that can see 'eyeVertex' have its visible vertices removed from the assigned vertex list.
   * - A new set of faces is created with each edge of the 'horizon' and 'eyeVertex'. Each face is connected
   * with the opposite horizon face and the face on the left/right.
   * - The vertices removed from all the visible faces are assigned to the new faces if possible.
   *
   * @private
   * @param {VertexNode} eyeVertex - The vertex to add.
   * @return {ConvexHull} A reference to this convex hull.
   */
  _addVertexToHull(eyeVertex) {
    const horizon = [];
    this.unassigned.clear();
    this._removeVertexFromFace(eyeVertex, eyeVertex.face);
    this._computeHorizon(eyeVertex.point, null, eyeVertex.face, horizon);
    this._addNewFaces(eyeVertex, horizon);
    this._resolveUnassignedPoints(this.newFaces);
    return this;
  }
  /**
   * Cleans up internal properties after computing the convex hull.
   *
   * @private
   * @return {ConvexHull} A reference to this convex hull.
   */
  _cleanup() {
    this.assigned.clear();
    this.unassigned.clear();
    this.newFaces = [];
    return this;
  }
  /**
   * Starts the execution of the quick hull algorithm.
   *
   * @private
   * @return {ConvexHull} A reference to this convex hull.
   */
  _compute() {
    let vertex;
    this._computeInitialHull();
    while ((vertex = this._nextVertexToAdd()) !== void 0) {
      this._addVertexToHull(vertex);
    }
    this._reindexFaces();
    this._cleanup();
    return this;
  }
};
var Face = class _Face {
  /**
   * Constructs a new face.
   */
  constructor() {
    this.normal = new Vector3();
    this.midpoint = new Vector3();
    this.area = 0;
    this.constant = 0;
    this.outside = null;
    this.mark = Visible;
    this.edge = null;
  }
  /**
   * Creates a face from the given vertex nodes.
   *
   * @private
   * @param {VertexNode} a - The first vertex node.
   * @param {VertexNode} b - The second vertex node.
   * @param {VertexNode} c - The third vertex node.
   * @return {Face} The created face.
   */
  static create(a, b, c) {
    const face = new _Face();
    const e0 = new HalfEdge(a, face);
    const e1 = new HalfEdge(b, face);
    const e2 = new HalfEdge(c, face);
    e0.next = e2.prev = e1;
    e1.next = e0.prev = e2;
    e2.next = e1.prev = e0;
    face.edge = e0;
    return face.compute();
  }
  /**
   * Returns an edge by the given index.
   *
   * @private
   * @param {number} i - The edge index.
   * @return {HalfEdge} The edge.
   */
  getEdge(i) {
    let edge = this.edge;
    while (i > 0) {
      edge = edge.next;
      i--;
    }
    while (i < 0) {
      edge = edge.prev;
      i++;
    }
    return edge;
  }
  /**
   * Computes all properties of the face.
   *
   * @private
   * @return {Face} A reference to this face.
   */
  compute() {
    const a = this.edge.tail();
    const b = this.edge.head();
    const c = this.edge.next.head();
    _triangle.set(a.point, b.point, c.point);
    _triangle.getNormal(this.normal);
    _triangle.getMidpoint(this.midpoint);
    this.area = _triangle.getArea();
    this.constant = this.normal.dot(this.midpoint);
    return this;
  }
  /**
   * Returns the signed distance from a given point to the plane representation of this face.
   *
   * @private
   * @param {Vector3} point - The point to compute the distance to.
   * @return {number} The distance.
   */
  distanceToPoint(point) {
    return this.normal.dot(point) - this.constant;
  }
};
var HalfEdge = class {
  /**
   * Constructs a new half edge.
   *
   * @param {VertexNode} vertex - A reference to its destination vertex.
   * @param {Face} face - A reference to its face.
   */
  constructor(vertex, face) {
    this.vertex = vertex;
    this.prev = null;
    this.next = null;
    this.twin = null;
    this.face = face;
  }
  /**
   * Returns the destination vertex.
   *
   * @private
   * @return {VertexNode} The destination vertex.
   */
  head() {
    return this.vertex;
  }
  /**
   * Returns the origin vertex.
   *
   * @private
   * @return {?VertexNode} The destination vertex.
   */
  tail() {
    return this.prev ? this.prev.vertex : null;
  }
  /**
   * Returns the Euclidean length (straight-line length) of the edge.
   *
   * @private
   * @return {number} The edge's length.
   */
  length() {
    const head = this.head();
    const tail = this.tail();
    if (tail !== null) {
      return tail.point.distanceTo(head.point);
    }
    return -1;
  }
  /**
   * Returns the square of the Euclidean length (straight-line length) of the edge.
   *
   * @private
   * @return {number} The square of the edge's length.
   */
  lengthSquared() {
    const head = this.head();
    const tail = this.tail();
    if (tail !== null) {
      return tail.point.distanceToSquared(head.point);
    }
    return -1;
  }
  /**
   * Sets the twin edge of this half-edge. It also ensures that the twin reference
   * of the given half-edge is correctly set.
   *
   * @private
   * @param {HalfEdge} edge - The twin edge to set.
   * @return {HalfEdge} A reference to this edge.
   */
  setTwin(edge) {
    this.twin = edge;
    edge.twin = this;
    return this;
  }
};
var VertexNode = class {
  /**
   * Constructs a new vertex node.
   *
   * @param {Vector3} point - A point in 3D space.
   */
  constructor(point) {
    this.point = point;
    this.prev = null;
    this.next = null;
    this.face = null;
  }
};
var VertexList = class {
  /**
   * Constructs a new vertex list.
   */
  constructor() {
    this.head = null;
    this.tail = null;
  }
  /**
   * Returns the head reference.
   *
   * @private
   * @return {VertexNode} The head reference.
   */
  first() {
    return this.head;
  }
  /**
   * Returns the tail reference.
   *
   * @private
   * @return {VertexNode} The tail reference.
   */
  last() {
    return this.tail;
  }
  /**
   * Clears the linked list.
   *
   * @private
   * @return {VertexList} A reference to this vertex list.
   */
  clear() {
    this.head = this.tail = null;
    return this;
  }
  /**
   * Inserts a vertex before a target vertex.
   *
   * @private
   * @param {VertexNode} target - The target.
   * @param {VertexNode} vertex - The vertex to insert.
   * @return {VertexList} A reference to this vertex list.
   */
  insertBefore(target, vertex) {
    vertex.prev = target.prev;
    vertex.next = target;
    if (vertex.prev === null) {
      this.head = vertex;
    } else {
      vertex.prev.next = vertex;
    }
    target.prev = vertex;
    return this;
  }
  /**
   * Inserts a vertex after a target vertex.
   *
   * @private
   * @param {VertexNode} target - The target.
   * @param {VertexNode} vertex - The vertex to insert.
   * @return {VertexList} A reference to this vertex list.
   */
  insertAfter(target, vertex) {
    vertex.prev = target;
    vertex.next = target.next;
    if (vertex.next === null) {
      this.tail = vertex;
    } else {
      vertex.next.prev = vertex;
    }
    target.next = vertex;
    return this;
  }
  /**
   * Appends a vertex to this vertex list.
   *
   * @private
   * @param {VertexNode} vertex - The vertex to append.
   * @return {VertexList} A reference to this vertex list.
   */
  append(vertex) {
    if (this.head === null) {
      this.head = vertex;
    } else {
      this.tail.next = vertex;
    }
    vertex.prev = this.tail;
    vertex.next = null;
    this.tail = vertex;
    return this;
  }
  /**
   * Appends a chain of vertices where the given vertex is the head.
   *
   * @private
   * @param {VertexNode} vertex - The head vertex of a chain of vertices.
   * @return {VertexList} A reference to this vertex list.
   */
  appendChain(vertex) {
    if (this.head === null) {
      this.head = vertex;
    } else {
      this.tail.next = vertex;
    }
    vertex.prev = this.tail;
    while (vertex.next !== null) {
      vertex = vertex.next;
    }
    this.tail = vertex;
    return this;
  }
  /**
   * Removes a vertex from the linked list.
   *
   * @private
   * @param {VertexNode} vertex - The vertex to remove.
   * @return {VertexList} A reference to this vertex list.
   */
  remove(vertex) {
    if (vertex.prev === null) {
      this.head = vertex.next;
    } else {
      vertex.prev.next = vertex.next;
    }
    if (vertex.next === null) {
      this.tail = vertex.prev;
    } else {
      vertex.next.prev = vertex.prev;
    }
    return this;
  }
  /**
   * Removes a sublist of vertices from the linked list.
   *
   * @private
   * @param {VertexNode} a - The head of the sublist.
   * @param {VertexNode} b - The tail of the sublist.
   * @return {VertexList} A reference to this vertex list.
   */
  removeSubList(a, b) {
    if (a.prev === null) {
      this.head = b.next;
    } else {
      a.prev.next = b.next;
    }
    if (b.next === null) {
      this.tail = a.prev;
    } else {
      b.next.prev = a.prev;
    }
    return this;
  }
  /**
   * Returns `true` if the linked list is empty.
   *
   * @private
   * @return {boolean} Whether the linked list is empty or not.
   */
  isEmpty() {
    return this.head === null;
  }
};

export {
  ConvexHull,
  Face,
  HalfEdge,
  VertexNode,
  VertexList
};
//# sourceMappingURL=chunk-CULDPS2E.js.map
