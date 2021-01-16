3D Dungeon Generator
===========

## Installation
```sh
yarn add 3d-dungeon-generator
```
or
```sh
npm install 3d-dungeon-generator
```

## Basic Usage
```js
const generator = new DungeonGenerator();
const { maze, rooms, corridors, stairs } = generator.generate({
  seed: 'starter',
});
```

- `maze` is a 3D array representing different node types, useful for bitmasking
- `rooms` is an array of rooms with location/size
- `corridors` is an array of corridors with a path array (x/y/z location)
- `stairs` is an array of stairs with a path array and directional info

## Parameters
```js
{
  seed: 'hello world', // Seeded RNG
  roomCount: 4, // Max room count, not including predefined
  roomSpacing: 1, // How many tiles between rooms
  width: 16, // Max width of grid
  height: 16, // Max height of grid
  levels: 3, // Max amount of levels to generate
  predefined: [{ // List of predefined rooms
    location: {
      x: 0,
      y: 0,
      z: 0,
    },
    size: {
      x: 2,
      y: 1,
      z: 2,
    },
  }],
  minRoomWidth: 3, // Min room width (x)
  minRoomHeight: 3, // Min room height (z)
  minRoomDepth: 1, // Min room depth (y aka levels)
  maxRoomWidth: 6, // Max room width (x)
  maxRoomHeight: 6, // Max room height (z)
  maxRoomDepth: 1, // Max room depth (y aka levels)
  overlapRooms: false, // Should rooms overlap on the y axis
  allowStairs: true, // Stair generation insted of mineshafts
  intersectCorridors: true, // Can corridors cross eachother?
  cycleEdges: true, // Not yet used!
  maxTries: 256, // How many attempts to generate a room
}
```

## Tests

Due to time limitations and this library being in active development/experimenting, there are no tests yet. Coming soon.

## License

MIT

## Credits

Thanks to @liady for the library starter kit: https://github.com/liady/es6-lib-starter-light
