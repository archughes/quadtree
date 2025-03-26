Ellipsoid Quadtree Mesh Demo
============================

Goals
-----
- Create an interactive Three.js demo of an ellipsoid with a quadtree-based mesh that adjusts density based on camera distance across three concentric LOD rings.
- Enable camera orbiting via azimuth and elevation sliders, and altitude adjustment with a third slider.
- Ensure a shiny, well-lit mesh with no LOD gaps for a seamless planetary surface visualization.
- Generate procedural terrain with seed-based randomization and hierarchical height details.

Planning
--------
- **Quadtree Design**: A recursive quadtree subdivides the ellipsoid surface based on camera proximity, with leaves representing mesh patches.
- **LOD System**: Three distance thresholds (`r1`, `r2`, `r3`) control detail levels, balanced to avoid gaps using adjacency rules.
- **Mesh Generation**: Vertices are shared via a map to prevent seams, and triangles form from quadtree leaves.
- **Terrain Generation**: A `TerrainGenerator` class handles seed-based noise for height, with coarse LOD defining base terrain and finer LODs adding detail.
- **Camera Interaction**: Sliders update camera position, dynamically regenerating the mesh to reflect LOD and terrain changes.
- **Visuals**: Phong material and directional/ambient lighting enhance the ellipsoid’s appearance.

Files
-----
- **`index.html`**: Sets up the HTML structure, sliders, and script imports.
- **`styles.css`**: Styles the canvas and control panel.
- **`main.js`**: Initializes the Three.js scene, camera, lighting, and handles slider events and rendering.
- **`EllipsoidMesh.js`**: Defines the `EllipsoidMesh` class for quadtree-driven geometry generation.
- **`QuadtreeNode.js`**: Implements the `QuadtreeNode` class for tree structure, LOD balancing, and base height storage.
- **`TerrainGenerator.js`**: New file managing procedural terrain generation with seeded noise and hierarchical height computation.

Future Enhancements
-------------------
- Optimize performance with cached geometries and selective quadtree updates.
- Add texture mapping based on height for visual terrain differentiation (e.g., mountains, plains).
- Implement erosion or fractal-based refinements for more realistic planetary features.