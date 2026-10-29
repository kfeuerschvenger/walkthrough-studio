/**
 * Builds the bundled demo house, `public/demo/house.glb`.
 *
 * The house is assembled from a handful of pieces of Kenney's Building
 * Kit (CC0, see `assets-src/kenney-building-kit/License.txt`) placed on a
 * 2 m grid, so the output is reproducible with `npm run build:demo-house`
 * and no manual modelling step.
 *
 * Layout (cells are 2 m x 2 m, x grows to the right, z grows downward):
 *
 *        i=0  i=1  i=2  i=3  i=4
 *   j=0 [ living room  ][ bedroom ]
 *   j=1 [ living room  ][ bedroom ]
 *   j=2 [ living room  ][ bathroom]
 *
 * Living room 6 x 6 m, bedroom 4 x 4 m, bathroom 4 x 2 m. The front door
 * is in the south wall of the living room; doorways connect the rooms.
 *
 * Usage: node scripts/build-demo-house.mjs
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { dedup, mergeDocuments, prune } from '@gltf-transform/functions';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PIECES_DIR = path.join(root, 'assets-src', 'kenney-building-kit', 'glb');
const OUTPUT = path.join(root, 'public', 'demo', 'house.glb');

/** Edge length of one grid cell, in meters. Matches the kit's tile size. */
const CELL = 2;
/** Height of the wall pieces, in meters. */
const WALL_HEIGHT = 2.4;

/** Grid size in cells. */
const COLS = 5;
const ROWS = 3;

/** Ground plane size in meters, centered on the footprint. */
const GROUND_SIZE = 60;

/**
 * Wall kinds. `wall` is solid, `door` is a doorway, `window` is a wall
 * with a window opening.
 */
const WALL = 'wall';
const DOOR = 'door';
const WINDOW = 'window';

const PIECE_FILES = {
  floor: 'floor',
  wall: 'wall',
  door: 'wall-doorway-square',
  window: 'wall-window-square',
  column: 'column',
  roofCenter: 'roof-flat-center',
  roofSide: 'roof-flat-side',
  roofCorner: 'roof-flat-corner',
};

/**
 * Vertical walls (running along z) on the grid line x = 2 * i, covering
 * the cell in row j. Key: `i,j`.
 */
const VERTICAL_WALLS = new Map([
  // West exterior wall.
  ['0,0', WINDOW],
  ['0,1', WALL],
  ['0,2', WINDOW],
  // Partition between the living room and the bedroom / bathroom.
  ['3,0', DOOR],
  ['3,1', WALL],
  ['3,2', DOOR],
  // East exterior wall.
  ['5,0', WINDOW],
  ['5,1', WALL],
  ['5,2', WALL],
]);

/**
 * Horizontal walls (running along x) on the grid line z = 2 * j, covering
 * the cell in column i. Key: `i,j`.
 */
const HORIZONTAL_WALLS = new Map([
  // North exterior wall.
  ['0,0', WALL],
  ['1,0', WINDOW],
  ['2,0', WALL],
  ['3,0', WINDOW],
  ['4,0', WALL],
  // Partition between the bedroom and the bathroom.
  ['3,2', DOOR],
  ['4,2', WALL],
  // South exterior wall, with the front door in the living room.
  ['0,3', WINDOW],
  ['1,3', DOOR],
  ['2,3', WINDOW],
  ['3,3', WINDOW],
  ['4,3', WALL],
]);

/** Quaternion for a rotation of `angle` radians around the Y axis. */
function yRotation(angle) {
  return [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
}

/**
 * Loads each piece into the target document and returns its mesh. Glass
 * primitives are dropped: the viewer renders every material opaque, so a
 * glass pane would become a solid wall inside the window opening.
 */
async function loadPieces(io, target) {
  const meshes = {};
  for (const [key, file] of Object.entries(PIECE_FILES)) {
    const source = await io.read(path.join(PIECES_DIR, `${file}.glb`));
    // `mergeDocuments` copies the source into the target and returns a map
    // from each source property to its copy.
    const copies = mergeDocuments(target, source);
    for (const node of source.getRoot().listNodes()) copies.get(node)?.dispose();
    for (const scene of source.getRoot().listScenes()) copies.get(scene)?.dispose();

    const sourceMesh = source.getRoot().listMeshes()[0];
    const mesh = sourceMesh ? copies.get(sourceMesh) : undefined;
    if (!mesh) throw new Error(`piece ${file} contains no mesh`);
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMaterial()?.getName() === 'glass') {
        mesh.removePrimitive(primitive);
        primitive.dispose();
      }
    }
    meshes[key] = mesh;
  }
  return meshes;
}

/** Builds a flat, upward-facing square mesh with a plain color material. */
function createGround(doc, size, color) {
  const half = size / 2;
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([-half, 0, -half, half, 0, -half, half, 0, half, -half, 0, half]))
    .setBuffer(buffer);
  const normal = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const indices = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint16Array([0, 2, 1, 0, 3, 2]))
    .setBuffer(buffer);
  const material = doc
    .createMaterial('ground')
    .setBaseColorFactor([...color, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(1);
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setIndices(indices)
    .setMaterial(material);
  return doc.createMesh('ground').addPrimitive(primitive);
}

async function main() {
  const io = new NodeIO();
  const doc = new Document();
  doc.createBuffer();
  const meshes = await loadPieces(io, doc);

  const scene = doc.createScene('demo-house');
  const place = (name, mesh, [x, y, z], rotationY = 0) => {
    const node = doc
      .createNode(name)
      .setMesh(mesh)
      .setTranslation([x, y, z])
      .setRotation(yRotation(rotationY));
    scene.addChild(node);
  };

  // Ground first, so it is the lowest point and carries a recognizable name.
  const groundMesh = createGround(doc, GROUND_SIZE, [0.36, 0.52, 0.3]);
  scene.addChild(
    doc
      .createNode('ground')
      .setMesh(groundMesh)
      .setTranslation([(COLS * CELL) / 2, -0.001, (ROWS * CELL) / 2]),
  );

  // Floor and ceiling: one tile per cell. Floor tiles are centered on the
  // cell; the ceiling sits on top of the walls. Border cells get the roof
  // piece with a lip on their outward side(s).
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      const cx = i * CELL + CELL / 2;
      const cz = j * CELL + CELL / 2;
      place(`floor_${i}_${j}`, meshes.floor, [cx, 0, cz]);

      const north = j === 0;
      const south = j === ROWS - 1;
      const west = i === 0;
      const east = i === COLS - 1;
      const outward = [north, south, west, east].filter(Boolean).length;
      const at = [cx, WALL_HEIGHT, cz];
      // The kit's side piece has its lip on +X and the corner piece on
      // +X/+Z. Rotating by theta around Y sends the lip to (cos, -sin).
      if (outward === 0) {
        place(`roof_${i}_${j}`, meshes.roofCenter, at);
      } else if (outward === 1) {
        const theta = east ? 0 : north ? Math.PI / 2 : west ? Math.PI : -Math.PI / 2;
        place(`roof_${i}_${j}`, meshes.roofSide, at, theta);
      } else {
        const theta =
          south && east ? 0 : north && east ? Math.PI / 2 : north && west ? Math.PI : -Math.PI / 2;
        place(`roof_${i}_${j}`, meshes.roofCorner, at, theta);
      }
    }
  }

  // Walls, plus a column at every grid point a wall touches so the
  // 0.1 m wall ends never leave a notch at corners and junctions.
  const columns = new Set();
  for (const [key, kind] of VERTICAL_WALLS) {
    const [i, j] = key.split(',').map(Number);
    place(`wall_v_${i}_${j}`, meshes[kind], [i * CELL, 0, j * CELL + CELL / 2]);
    columns.add(`${i},${j}`).add(`${i},${j + 1}`);
  }
  for (const [key, kind] of HORIZONTAL_WALLS) {
    const [i, j] = key.split(',').map(Number);
    place(`wall_h_${i}_${j}`, meshes[kind], [i * CELL + CELL / 2, 0, j * CELL], Math.PI / 2);
    columns.add(`${i},${j}`).add(`${i + 1},${j}`);
  }
  for (const key of columns) {
    const [i, j] = key.split(',').map(Number);
    place(`column_${i}_${j}`, meshes.column, [i * CELL, 0, j * CELL]);
  }

  // The kit's materials are glTF defaults (fully metallic); a house is not.
  for (const material of doc.getRoot().listMaterials()) {
    if (material.getName() === 'ground') continue;
    material.setMetallicFactor(0).setRoughnessFactor(0.9);
  }

  await doc.transform(dedup(), prune());

  // Every merged piece brought its own buffer, and a GLB holds exactly one.
  const [mainBuffer, ...extraBuffers] = doc.getRoot().listBuffers();
  for (const accessor of doc.getRoot().listAccessors()) accessor.setBuffer(mainBuffer);
  for (const buffer of extraBuffers) buffer.dispose();

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await io.write(OUTPUT, doc);
  console.log(`wrote ${path.relative(root, OUTPUT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
