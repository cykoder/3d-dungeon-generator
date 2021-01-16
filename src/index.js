import seedrandom from 'seedrandom';
import Delaunay from 'delaunay';
import prim from 'prim-mst';
import AStar from 'dynamic-astar/dist/astar.esm.js';

export const NODE_TYPE_EMPTY = 0;
export const NODE_TYPE_ROOM = 1;
export const NODE_TYPE_CORRIDOR = 2;
export const NODE_TYPE_VERTICAL = 3;

export const defaultProperties = {
  seed: 'hello world',
  roomCount: 4,
  roomSpacing: 1,
  width: 16,
  height: 16,
  levels: 3,
  predefined: [{
    location: {
      x: 0,
      y: 2,
      z: 0,
    },
    size: {
      x: 2,
      y: 1,
      z: 2,
    },
  }],
  minRoomWidth: 3,
  minRoomHeight: 3,
  minRoomDepth: 1,
  maxRoomWidth: 6,
  maxRoomHeight: 6,
  maxRoomDepth: 1,
  overlapRooms: false,
  allowStairs: true,
  intersectCorridors: true,
  cycleEdges: true,
  maxTries: 256,
};

function randomInt(min, max, rng) {
  const randValue = rng ? rng() : Math.random();
  return Math.floor(randValue * ((max-min)+1) + min);
}

function getDistance(pointA, pointB) {
  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;
  const dz = pointB.z - pointA.z;
  return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2) + Math.pow(dz, 2));
}

function roomIntersectsRoom(roomA, roomB) {
  return !((roomA.location.x >= (roomB.location.x + roomB.size.x))
    || ((roomA.location.x + roomA.size.x) <= roomB.location.x)
    || (roomA.location.y >= (roomB.location.y + roomB.size.y))
    || ((roomA.location.y + roomA.size.y) <= roomB.location.y)
    || (roomA.location.z >= (roomB.location.z + roomB.size.z))
    || ((roomA.location.z + roomA.size.z) <= roomB.location.z));
}

function roomIntersectsRoom2D(roomA, roomB) {
  return !((roomA.location.x >= (roomB.location.x + roomB.size.x))
    || ((roomA.location.x + roomA.size.x) <= roomB.location.x)
    || (roomA.location.z >= (roomB.location.z + roomB.size.z))
    || ((roomA.location.z + roomA.size.z) <= roomB.location.z));
}

function pointIntersectsRoom2D(roomA, point) {
  return !((roomA.location.x >= (point.x))
    || ((roomA.location.x + roomA.size.x) <= point.x)
    || (roomA.location.z >= (point.z))
    || ((roomA.location.z + roomA.size.z) <= point.z));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default class DungeonGenerator {
  generateRooms(rng) {
    const {
      roomCount, roomSpacing, maxTries, width,
      height, levels, minRoomWidth, minRoomHeight,
      minRoomDepth, maxRoomWidth, maxRoomHeight,
      maxRoomDepth, overlapRooms, predefined,
    } = this.props;

    let i = 0;
    const rooms = [...predefined];
    while (i < roomCount) {
      let canAdd = true;
      let tries = 0;

      const location = {
        x: randomInt(0, width, rng),
        y: i > 0 ? randomInt(0, Math.max(levels - 1, 0), rng) : 0,
        z: randomInt(0, height, rng),
      };

      const size = {
        x: randomInt(minRoomWidth, maxRoomWidth, rng),
        y: randomInt(minRoomDepth, Math.min(levels, maxRoomDepth), rng),
        z: randomInt(minRoomHeight, maxRoomHeight, rng),
      };

      // Create new room of location and size
      const newRoom = {
        location,
        size,
      };

      // Create a buffer around the room based on spacing parameter
      const bufferScale = roomSpacing * 2;
      const roomBuffer = {
        location: {
          x: newRoom.location.x - roomSpacing,
          y: newRoom.location.y,
          z: newRoom.location.z - roomSpacing,
        },
        size: {
          x: newRoom.size.x + bufferScale,
          y: newRoom.size.y,
          z: newRoom.size.z + bufferScale,
        },
      };

      if (newRoom.location.x + newRoom.size.x >= width ||
        newRoom.location.z + newRoom.size.z >= height ||
        newRoom.location.y + newRoom.size.y > levels) {
        canAdd = false;
      }

      // Ensure no rooms are intersecting this new room
      if (canAdd) {
        for (let c = 0; c < rooms.length; c++) {
          const roomToCheck = rooms[c];
          const doesIntersect = overlapRooms ?
            roomIntersectsRoom(roomBuffer, roomToCheck) :
            roomIntersectsRoom2D(roomBuffer, roomToCheck);
          if (doesIntersect) {
            canAdd = false;
            break;
          }
        }
      }

      // If we can still add it, then do so
      if (canAdd) {
        rooms.push(newRoom);
        i++;
      } else {
        tries++;
      }

      if (tries >= maxTries) {
        continue;
      }
    }

    return rooms;
  }

  trianglulateRooms(rooms) {
    const vertices = [];
    const vertexRoomMap = [];
    const { levels } = this.props;
    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      const roomCenter = levels === 1 ? [
        room.location.x + room.size.x / 2,
        room.location.z + room.size.z / 2,
      ] : [
        room.location.x + room.size.x / 2,
        room.location.y, // Assume path entrance/exits are on lowest level of room
        room.location.z + room.size.z / 2,
      ];
      vertices.push(roomCenter);
      vertexRoomMap.push(room);
    }

    const tetrahedrons = Delaunay.triangulate(vertices);

    if (levels === 1) {
      const convertedVertices = [];
      for (let i = 0; i < vertices.length; i++) {
        convertedVertices.push([
          vertices[i][0],
          0.0,
          vertices[i][1],
        ]);
      }

      return {
        tetrahedrons,
        vertices: convertedVertices,
        vertexRoomMap,
      };
    }

    return {
      tetrahedrons,
      vertices,
      vertexRoomMap,
    };
  }

  generateMST(vertices, tetrahedrons, roomMap) {
    const edges = [];
    const usedEdges = [];

    for (let i = 0; i < tetrahedrons.length; i++) {
      const vertexIndex = tetrahedrons[i];
      const vertexTwoIndex = tetrahedrons[i + 1];
      if (vertexTwoIndex === undefined) {
        break;
      }

      const edgeWeight = getDistance(
        roomMap[vertexIndex].location,
        roomMap[vertexTwoIndex].location
      );
      edges.push([vertexIndex, vertexTwoIndex, edgeWeight]);
      usedEdges.push(i);
    }

    if (edges.length <= 1) {
      return edges;
    }

    // TODO: we could cycle edges that arent in mst
    // and add them back at a random chance to create cycles
    // otherwise generally rooms only accessible from one room
    return prim(edges);
  }

  generateHallways(mst, roomMap, rooms) {
    const { width, height, levels, allowStairs, intersectCorridors } = this.props;

    const maze = [];
    for (let x = 0; x < width; x++) {
      maze[x] = new Array(levels+1);
      for (let y = 0; y < levels+1; y++) {
        maze[x][y] = new Array(height);
        for (let z = 0; z < height; z++) {
          maze[x][y][z] = 0;
        }
      }
    }

    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      for (let x = room.location.x; x < room.location.x + room.size.x; x++) {
        for (let y = room.location.y; y < room.location.y + room.size.y; y++) {
          for (let z = room.location.z; z < room.location.z + room.size.z; z++) {
            maze[x][y][z] = NODE_TYPE_ROOM;
          }
        }
      }
    }

    function estimationToFinish(x, y, z, finish) {
      return Math.abs(x - finish.x) + Math.abs(z - finish.z) + Math.abs(y - finish.y) * 2;
    }

    function estimation(x, y, z, fromNode) {
      const deltaY = fromNode.y - y;
      let baseCost = Math.abs(x - fromNode.x) +
        Math.abs(z - fromNode.z) +
        Math.abs(deltaY);
      if (deltaY !== 0) {
        baseCost += 100;
      }
      return baseCost;
    }

    function buildNode(x, y, z, fromNode) {
      return {
        id: `${x}-${y}-${z}`,
        cost: fromNode.cost + estimation(x, y, z, fromNode),
        costEstimation: estimationToFinish(x, y, z, fromNode.finish),
        x,
        y,
        z,
        finish: fromNode.finish,
      };
    }

    function setStair(stair, x, y, z, val) {
      if (x < 0 || y < 0 || z < 0 || x >= width || y >= levels || z >= height) {
        return;
      }
      maze[x][y][z] = val;
      stair.path.push([x, y, z]);
    }

    const corridors = [];
    const stairs = [];
    for (let i = 0; i < mst.length; i++) {
      const roomIndexA = mst[i][0];
      const roomIndexB = mst[i][1];
      const roomA = roomMap[roomIndexA];
      const roomB = roomMap[roomIndexB];

      const startX = Math.floor(roomA.location.x + roomA.size.x / 2);
      const startZ = Math.floor(roomA.location.z + roomA.size.z / 2);
      const startY = allowStairs ?
        roomA.location.y :
        Math.floor(roomA.location.y + roomA.size.y / 2);

      const endX = Math.floor(roomB.location.x + roomB.size.x / 2);
      const endZ = Math.floor(roomB.location.z + roomB.size.z / 2);
      const endY = allowStairs ?
        roomB.location.y :
        Math.floor(roomB.location.y + roomB.size.y / 2);

      const target = { x: endX, y: endY, z: endZ };
      const firstNode = {
        id: `${startX}-${startY}-${startZ}`,
        x: startX,
        y: startY,
        z: startZ,
        cost: 0,
        finish: target,
      };

      function canTraverse(x, y, z, isNodeInRoom, isVertical) {
        if (x < 0 || y < 0 || z < 0 || x >= width || y >= levels || z >= height) {
          return false;
        }

        const gridType = maze[x][y][z];
        if (gridType === NODE_TYPE_VERTICAL) {
          return false;
        }

        if (isVertical && gridType !== NODE_TYPE_EMPTY) {
          return false;
        }

        const nodeIntersectsStartRoom = pointIntersectsRoom2D(roomA, { x, y, z });
        const nodeIntersectsTargetRoom = pointIntersectsRoom2D(roomB, { x, y, z });

        if (nodeIntersectsStartRoom && (isVertical || y !== roomA.location.y)) {
          return false;
        }

        if (nodeIntersectsTargetRoom && (isVertical || y !== roomB.location.y)) {
          return false;
        }

        let can = intersectCorridors ?
          gridType < NODE_TYPE_VERTICAL :
          gridType < NODE_TYPE_CORRIDOR;
        if (isVertical && (isNodeInRoom || gridType !== NODE_TYPE_EMPTY)) {
          can = false;
        }
        return can;
      }


      function getNeighbours(node) {
        const neighbours = [];
        const x = node.x;
        const y = node.y;
        const z = node.z;
        const isNodeInRoom = maze[x][y][z] === NODE_TYPE_ROOM;

        if (x > 0 && canTraverse(x - 1, y, z)) {
          neighbours.push(buildNode(x - 1, y, z, node));
        }
        if (z > 0 && canTraverse(x, y, z - 1)) {
          neighbours.push(buildNode(x, y, z - 1, node));
        }
        if (node.x < width-1 && canTraverse(x + 1, y, z)) {
          neighbours.push(buildNode(x + 1, y, z, node));
        }
        if (node.z < height-1 && canTraverse(x, y, z + 1)) {
          neighbours.push(buildNode(x, y, z + 1, node));
        }

        // Disallow creating stairs and shafts inside rooms
        if (isNodeInRoom) {
          return neighbours;
        }

        // Straight vertical neighbours
        if (!allowStairs) { // TODO: use allowshafts?
          if (y > 0 && canTraverse(x, y - 1, z, isNodeInRoom, true)) {
            neighbours.push(buildNode(x, y - 1, z, node));
          }
          if (node.y < levels-1 && canTraverse(x, y + 1, z, isNodeInRoom, true)) {
            neighbours.push(buildNode(x, y + 1, z, node));
          }
        } else { // Check for stair neighbours (diagonal up/down)
          const stairSkipDistance = 3;
          if (y > 0 && canTraverse(x - 1, y - 1, z, isNodeInRoom, true) &&
            canTraverse(x - 2, y - 1, z, isNodeInRoom, true) &&
            canTraverse(x - stairSkipDistance, y - 1, z, isNodeInRoom, true)) {
            neighbours.push(buildNode(x - stairSkipDistance, y - 1, z, node));
          }
          if (y > 0 && canTraverse(x, y - 1, z - 1, isNodeInRoom, true) &&
            canTraverse(x, y - 1, z - 2, isNodeInRoom, true) &&
            canTraverse(x, y - 1, z - stairSkipDistance, isNodeInRoom, true)) {
            neighbours.push(buildNode(x, y - 1, z - stairSkipDistance, node));
          }

          if (y > 0 && canTraverse(x + 1, y - 1, z, isNodeInRoom, true) &&
            canTraverse(x + 2, y - 1, z, isNodeInRoom, true) &&
            canTraverse(x + stairSkipDistance, y - 1, z, isNodeInRoom, true)) {
            neighbours.push(buildNode(x + stairSkipDistance, y - 1, z, node));
          }
          if (y > 0 && canTraverse(x, y - 1, z + 1, isNodeInRoom, true) &&
            canTraverse(x, y - 1, z + 2, isNodeInRoom, true) &&
            canTraverse(x, y - 1, z + stairSkipDistance, isNodeInRoom, true)) {
            neighbours.push(buildNode(x, y - 1, z + stairSkipDistance, node));
          }

          if (node.y < levels-1 && canTraverse(x - 1, y + 1, z, isNodeInRoom, true) &&
            canTraverse(x - 2, y + 1, z, isNodeInRoom, true) &&
            canTraverse(x - stairSkipDistance, y + 1, z, isNodeInRoom, true)) {
            neighbours.push(buildNode(x - stairSkipDistance, y + 1, z, node));
          }
          if (node.y < levels-1 && canTraverse(x, y + 1, z - 1, isNodeInRoom, true) &&
            canTraverse(x, y + 1, z - 2, isNodeInRoom, true) &&
            canTraverse(x, y + 1, z - stairSkipDistance, isNodeInRoom, true)) {
            neighbours.push(buildNode(x, y + 1, z - stairSkipDistance, node));
          }

          if (node.y < levels-1 && canTraverse(x + 1, y + 1, z, isNodeInRoom, true) &&
            canTraverse(x + 2, y + 1, z, isNodeInRoom, true) &&
            canTraverse(x + stairSkipDistance, y + 1, z, isNodeInRoom, true)) {
            neighbours.push(buildNode(x + stairSkipDistance, y + 1, z, node));
          }
          if (node.y < levels-1 && canTraverse(x, y + 1, z + 1, isNodeInRoom, true) &&
            canTraverse(x, y + 1, z + 2, isNodeInRoom, true) &&
            canTraverse(x, y + 1, z + stairSkipDistance, isNodeInRoom, true)) {
            neighbours.push(buildNode(x, y + 1, z + stairSkipDistance, node));
          }
        }

        return neighbours;
      }

      /* Run the algorithm */
      firstNode.costEstimation = estimationToFinish(startX, startY, startZ, target);
      const path = AStar(firstNode, getNeighbours);

      /* path is the list of nodes (from start to end) representing the shortest path */
      const result = path.map(node => node.id);
      const pastPathPoint = {
        x: startX,
        y: startY,
        z: startZ,
      };

      const corridor = {
        path: [],
      };

      for (let p = 0; p < result.length; p++) {
        const pathItemId = result[p];
        const pathItemIdSplit = pathItemId.split('-');
        const pathX = parseInt(pathItemIdSplit[0], 10);
        const pathY = parseInt(pathItemIdSplit[1], 10);
        const pathZ = parseInt(pathItemIdSplit[2], 10);
        const currentType = maze[pathX][pathY][pathZ];

        let deltaX = pastPathPoint.x - pathX;
        let deltaY = pastPathPoint.y - pathY;
        let deltaZ = pastPathPoint.z - pathZ;
        if (p === result.length - 1) {
          deltaX = pathX - endX;
          deltaY = pathY - endY;
          deltaZ = pathZ - endZ;
        }


        const isVertical = deltaY !== 0;
        if (isVertical) {
          if (allowStairs && result.length > 1 && p !== 0) {
            const xDir = clamp(deltaX, -1, 1);
            const yDir = clamp(deltaY, -1, 1);
            const zDir = clamp(deltaZ, -1, 1);
            const stair = {
              path: [],
              start: {
                x: pathX, y: pathY, z: pathZ,
              },
              minY: Math.min(pathY, pathY + deltaY),
              direction: {
                x: xDir, y: yDir, z: zDir,
              },
            };

            setStair(stair, pathX + xDir, pathY, pathZ + zDir, NODE_TYPE_VERTICAL);
            setStair(stair, pathX + xDir * 2, pathY, pathZ + zDir * 2, NODE_TYPE_VERTICAL);
            setStair(stair, pathX + xDir, pathY + deltaY, pathZ + zDir, NODE_TYPE_VERTICAL);
            setStair(stair, pathX + xDir * 2, pathY + deltaY, pathZ + zDir * 2, NODE_TYPE_VERTICAL);
            setStair(stair, pathX + xDir * 3, pathY + deltaY, pathZ + zDir * 3, NODE_TYPE_CORRIDOR);
            setStair(stair, pathX, pathY, pathZ, NODE_TYPE_CORRIDOR);

            if (stair.path.length > 0) {
              stairs.push(stair);
            }
            corridor.path.push([pathX, pathY, pathZ]);
            corridor.path.push([pathX + xDir * 3, pathY + deltaY, pathZ + zDir * 3]);
          } else if (currentType === NODE_TYPE_EMPTY) {
            maze[pathX][pathY][pathZ] = allowStairs ? NODE_TYPE_VERTICAL : NODE_TYPE_CORRIDOR;
            corridor.path.push([pathX, pathY, pathZ]);
          }
        } else if (currentType === NODE_TYPE_EMPTY) {
          maze[pathX][pathY][pathZ] = NODE_TYPE_CORRIDOR;
          corridor.path.push([pathX, pathY, pathZ]);
        }

        pastPathPoint.x = pathX;
        pastPathPoint.y = pathY;
        pastPathPoint.z = pathZ;
      }

      if (corridor.path.length > 0) {
        corridors.push(corridor);
      }
    }

    return {
      maze,
      corridors,
      stairs,
    };
  }

  generate(props) {
    // Set properties
    this.props = Object.assign(props, defaultProperties);

    // Seed rng
    const rng = seedrandom(this.props.seed);

    // Generate rooms
    const rooms = this.generateRooms(rng);
    if (rooms.length === 0) {
      throw new Error('Couldn\'t generate any rooms!');
    }

    // Perform triangulation and generate
    // minumum spanning tree
    let mst;
    let roomMap;
    if (rooms.length === 1) {
      mst = [];
      roomMap = rooms;
    } else if (rooms.length === 2) {
      mst = [[0, 1, 1]];
      roomMap = rooms;
    } else {
      const { vertices, tetrahedrons, vertexRoomMap } = this.trianglulateRooms(rooms);
      if (tetrahedrons.length < 2) {
        mst = [];
        for (let r = 0; r < rooms.length - 1; r++) {
          mst.push([
            r,
            r + 1,
          ]);
        }
      } else {
        mst = this.generateMST(vertices, tetrahedrons, vertexRoomMap);
      }

      roomMap = vertexRoomMap;
    }

    // Pathfind from room to room using a
    // modified A* algorithm
    const { maze, corridors, stairs } = this.generateHallways(mst, roomMap, rooms);
    return {
      maze,
      rooms,
      corridors,
      stairs,
    };
  }
}
