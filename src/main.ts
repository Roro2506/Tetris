/**
 * Inside this file you will use the classes and functions from rx.js
 * to add visuals to the svg element in index.html, animate them, and make them interactive.
 *
 * Study and complete the tasks in observable exercises first to get ideas.
 *
 * Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
 *
 * You will be marked on your functional programming style
 * as well as the functionality that you implement.
 *
 * Document your code!
 */

import "./style.css";

import { fromEvent, interval, merge } from "rxjs";
import { map, filter, scan, startWith, withLatestFrom, switchMap } from "rxjs/operators";
import type { Observable } from "rxjs";


/** Constants */

const Viewport = {
  CANVAS_WIDTH: 200,
  CANVAS_HEIGHT: 400,
  PREVIEW_WIDTH: 160,
  PREVIEW_HEIGHT: 80,
} as const;

const Constants = {
  TICK_RATE_MS: 500,
  TICK_RATE_MULTIPLIER: 10,
  GRID_WIDTH: 10,
  GRID_HEIGHT: 20,
} as const;

const Block = {
  WIDTH: Viewport.CANVAS_WIDTH / Constants.GRID_WIDTH,
  HEIGHT: Viewport.CANVAS_HEIGHT / Constants.GRID_HEIGHT,
};


/** User input */

type Key = "KeyS" | "KeyA" | "KeyD" | "KeyW" | "Space";

type Event = "keydown" | "keyup" | "keypress";

/** Utility functions */
/**
 * Utility function which updates the grid with cubes at specific coordinates
 * @param grid the current state of the grid
 * @param x the x coordinate of the cube to be placed
 * @param y the y coordinate of the cube to be placed
 * @param value 1 if a cube is to be placed, 0 if it is an empty space
 * @returns an updated grid with the cube placed
 */
const setCubeAtCoordinates = (
  grid: Grid,
  x: number,
  y: number,
  value: number
): Grid => {
  if (x < 0 || x >= Constants.GRID_WIDTH || y < 0 || y >= Constants.GRID_HEIGHT) { // checks if the coordinates are within the grids boundaries
    return grid;
  }

  const newRow = [...grid[y]]; // makes a shallow copy of the row where the cube is to be added
  newRow[x] = value; // Updates the value at that x coordinate in newRow
  const newGrid = [...grid]; // makes a shallow copy of the grid
  newGrid[y] = newRow; // replaces the y row with newRow

  return newGrid;
};

/**
 * Checks if a given block shape collides with existing blocks on the grid
 * @param shape The shape of the block we are checking collisions
 * @param x The X coordinate of the Block
 * @param y The Y coordinate of the Block
 * @param direction The direction of movement
 * @param grid The current state of the grid
 * @returns A boolean representing if a collision has occured
 */
const checkAgainstExistingBlocks = (
  shape: BlockShape,
  x: number,
  y: number,
  direction: string,
  grid: Grid
): boolean => {
  // The shape parameter is an array representing the shape of the block so we iterate through
  return shape.some((row, shapeY) => // Shape Y is the number of rows indicating the height of the shape
    row.some((cube, shapeX) => { // Iterate over each cube in the shape
      if (cube === 1) { // Check if the current cube in the shape has one which indicates its occupied
        const gridX = x + shapeX; // add the current X coordinate of the falling block with the relative coordinates of a cube within the falling block shape
        const gridY = y + shapeY; // same with the y coordinate
        // This allows to check individual cubes in the shape for collisions
        
        if (gridX < 0 || gridX >= Constants.GRID_WIDTH) {
          return true; // Collision with grid boundary
        }

        return grid[gridY][gridX] === 1; // Collision with another block
      }
      return false;
    })
  );
};


/**
 * Checks if a given shape collides with existing blocks on grid with downwards movement
 * @param shape An array representing the shape of the block
 * @param x The X coordinate of the block
 * @param y The Y coordinate of the block
 * @param direction The direction of movement
 * @param grid The same grid, which is a 2D array representing the current state of occupied cells
 * @returns A boolean representing the shapes collide with existing blocks in the specified direction
 */
const checkCollision = (
  shape: BlockShape,
  x: number,
  y: number,
  direction: string,
  grid: Grid
): boolean => {
  return shape.some((row, shapeY) =>
    row.some((cube, shapeX) => {
      if (cube === 1) {// Calculates the grid coordinates of the cube within the shape
        const gridX = x + shapeX;
        const gridY = y + shapeY;

        if (direction === "down") {// Check for collisions when moving downwards
          return (
            gridY >= Constants.GRID_HEIGHT ||
            grid[gridY][gridX] === 1
          );
        }

        return false; // No collision check for sideways movement
      }
      return false;
    })
  );
};
/**
 * Checks if the shape currently falling has reached the bottom of the grid
 * @param shape  the shape of the block currently falling
 * @param y  the y coordinate
 * @returns returns a boolean representing if the block has reached the bottom of the grid
 */
const checkReachBottom = (
  shape: BlockShape,
  y: number
): boolean => {
  return y + shape.length > Constants.GRID_HEIGHT;
};

/**
 * Creates an empty grid with the specified dimensions
 * @returns a 2D array representing the game grid with all cells initialised to 0
 */
const createGrid= ():Grid =>{
  return Array.from({length:Constants.GRID_HEIGHT},()=>
    Array.from({length:Constants.GRID_WIDTH},()=> 0))
}
/**
 * Checks if a row in the grid is full
 * @param row a row in the grid
 * @returns a boolean representing if all cells in the row have a value of 1(cube exists at the position)
 */
  const isRowFull = (row: ReadonlyArray<number>): boolean => {
    return row.every(cell => cell === 1);
  };

  /**
   * Removes a full row from the grid
   * @param grid the current grid
   * @returns a grid without the row that is full
   */
  const removeFullRows = (grid: Grid): Grid => {
    return grid.filter(row => !isRowFull(row));
  };
  /**
   * Adjusts the Y positions of the blocks in the grid after removing full rows
   * @param grid The current state of the grid
   * @param removedRowCount The number of rows that have been removed
   * @returns A new grid with adjusted y positions
   */
  const adjustYPositions = (grid: Grid, removedRowCount: number): Grid => {
    const emptyRow = Array(grid[0].length).fill(0);// Create an empty row the the same length as the grid and fill with 0
    const shiftedGrid = [...Array(removedRowCount).fill(emptyRow), ...grid]; // create a new grid adding empty rows first at the top based on how many rows have been
    // removed, then append the existing grid below these rows
    return shiftedGrid.slice(0, Constants.GRID_HEIGHT); // remove the excess rows so the grid dimensions stay the same
  };

  /**
   * A function that generates a new tick rate based on the current level the player is on
   * @param level the current level the player is on
   * @returns a modified tick rate
   */
  const calculateTickRate = (level:number) => {
    return Constants.TICK_RATE_MS - level * Constants.TICK_RATE_MULTIPLIER;
  };


  abstract class RNG {
    // LCG using GCC's constants
    private static m = 0x80000000; // 2**31
    private static a = 1103515245;
    private static c = 12345;
  
    /**
     * Call `hash` repeatedly to generate the sequence of hashes.
     * @param seed
     * @returns a hash of the seed
     */
    public static hash = (seed: number) => (RNG.a * seed + RNG.c) % RNG.m;
  
    /**
     * Takes hash value and scales it to the range [-1, 1]
     */
    public static scale = (hash: number) => (2 * hash) / (RNG.m - 1) - 1;
  }

  /**
   * Generates a random block as a 2D array
   * @returns A randomly selected block shape
   */
  const getRandomBlockShape = () => {
    const randomValue = RNG.hash(Date.now()); // Generates a random hash function based on the current time
    const scaledValue = RNG.scale(randomValue) // Scale the random value to the range [1,-1] using a scaling function
    const range = blockShape.length // Determine the range of available block shapes
    const randomIndex = Math.floor(0 + (scaledValue+1)*(range/2)); // Generate a random value within the range based on the scaled value
    return blockShape[randomIndex]; // Retrieve and return the randomly selected block shape from the predefined array
  }
  /**
   * Generates a random colour as a string
   * @returns A randomly selected colour
   */
  const getRandomColour = () => { // same as the get shape but instead returns a randomly selected string from the colours array
    const randomValue = RNG.hash(Date.now());
    const scaledValue = RNG.scale(randomValue)
    const range = colours.length
    const randomIndex = Math.floor(0 + (scaledValue+1)*(range/2)); // Scale and map to [0, 6]
    return colours[randomIndex];
  }
  /**
   * Resets the game by initialising all game-related state variables to their initial values
   * @returns The initial state representing a new game
   */
  const resetGame = () => {
    // Reset all game-related state variables to their initial values
    const initialState = {
      gameEnd: false,
      fallingBlockX: 4,
      fallingBlockY: 0,
      fallingBlockShape: getRandomBlockShape(),
      grid: createGrid(),
      droppedBlocks: [],
      score: 0,
      level: 1,
      removedRows: 0,
    };
  
    return initialState;
  };
  
 /**
  * Renders the preview block
  * @param previewSvg The SVG Element representing the preview canvas
  * @param shape The shape of the block to be rendered
  * @param colour The colour of the block to be rendered
  */
  const renderNextBlockShape = (
    previewSvg: SVGGraphicsElement,
    shape: ReadonlyArray<ReadonlyArray<number>>,
    colour: string
  ) => {
    // Clear existing cubes on the preview canvas
    const cubeElements = previewSvg.querySelectorAll(".preview-cube");
    cubeElements.forEach((cubeElement) => cubeElement.remove());
  
    // Render the next block shape
    shape.forEach((row, shapeY) => {
      row.forEach((cube, shapeX) => {
        if (cube === 1) {
          const cube = createSvgElement(previewSvg.namespaceURI, "rect", {
            height: `${Block.HEIGHT}`,
            width: `${Block.WIDTH}`,
            x: `${Block.WIDTH * shapeX}`,
            y: `${Block.HEIGHT * shapeY}`,
            style: `fill : ${colour}`,
            class: "preview-cube", // Add a class to identify cubes on the preview canvas
          });
          previewSvg.appendChild(cube);
        }
      });
    });
  };
  /**
   * Updates a canvas with a block
   * @param svg The SVG Element representing the canvas
   * @param x The x coordinate
   * @param y The y coordinate
   * @param shape The block shape
   * @param colour The colour of the block to be rendered
   * @returns the updated canvas
   */
  const renderBlockShape = (
    svg: SVGGraphicsElement,
    x: number,
    y: number,
    shape: ReadonlyArray<ReadonlyArray<number>>,
    colour: string
  ) => {
    const updatedSVG = svg.cloneNode(true) as SVGGraphicsElement;
  
    shape.forEach((row, shapeY) => {
      row.forEach((cube, shapeX) => {
        if (cube === 1) {
          const cube = createSvgElement(updatedSVG.namespaceURI, "rect", {
            height: `${Block.HEIGHT}`,
            width: `${Block.WIDTH}`,
            x: `${Block.WIDTH * (x + shapeX)}`,
            y: `${Block.HEIGHT * (y + shapeY)}`,
            style: `fill : ${colour}`,
            class: "cube", // Add the cube class
          });
          updatedSVG.appendChild(cube);
        }
      });
    });
  
    return updatedSVG;
  };
  
const colours : ReadonlyArray <string> =  ["green","cyan","pink","violet","red","yellow","blue"]
type BlockShape = ReadonlyArray<ReadonlyArray<number>>
const blockShape : ReadonlyArray<BlockShape> = [
  [
    [1,1],
    [1,1],
  ],// 2x2 Square
  [
    [1,1,1,1] // I
  ],
  [// Inverted Z
    [0,1,1],
    [1,1,0]
  ],
  [ // Z
    [1,1,0],
    [0,1,1]
  ],
  [ // L
    [1,0,0],
    [1,1,1]
  ],
  [ // Inverted L
    [0,0,1],
    [1,1,1]
  ],  
  [ // T
    [0,1,0],
    [1,1,1]
  ]

] as const
//Implemented rotation system is the Best Rotation System uses in Tetris Best
const rotatedBlockShape1 : ReadonlyArray<BlockShape> = [
  [
    [0,1,1],
    [0,1,1],
  ],// 2x2 Square
  [
    [0,1],
    [0,1],
    [0,1],
    [0,1]
  ],
  [
    [0,1,0],
    [0,1,1],
    [0,0,1]
  ],
  [
    [0,0,1],
    [0,1,1],
    [0,1,0]
  ],
  [// REVERSE L SHAPE ROTATION 1
    [0,1,1],
    [0,1,0],
    [0,1,0]
  ],
  [ // L SHAPE ROTATION 1
    [0,1,0],
    [0,1,0],
    [0,1,1]
  ],  
  [ // T ROTATION 1
    [0,1,0],
    [0,1,1],
    [0,1,0]
  ]

] as const

const rotatedBlockShape2 : ReadonlyArray<BlockShape> = [
  [
    [0,0,0],
    [0,1,1],
    [0,1,1]
  ],// 2x2 Square
  [
    [0,0,0,0],
    [0,0,0,0],
    [1,1,1,1],
  ],
  [
    [0,0,0],
    [0,1,1],
    [1,1,0]
  ],
  [
    [0,0,0],
    [1,1,0],
    [0,1,1]
  ],
  [// REVERSE L SHAPE ROTATION 1
    [0,0,0],
    [1,1,1],
    [0,0,1]
  ],
  [ // L SHAPE ROTATION 1
    [0,0,0],
    [1,1,1],
    [1,0,0]
  ],  
  [ // T ROTATION 1
    [0,0,0],
    [1,1,1],
    [0,1,0]
  ]

] as const

const rotatedBlockShape3 : ReadonlyArray<BlockShape> = [
  [
    [0,0,0],
    [1,1,0],
    [1,1,0]
  ],// 2x2 Square
  [
    [0,1,0,0],
    [0,1,0,0],
    [0,1,0,0],
    [0,1,0,0]
  ],
  [
    [1,0,0],
    [1,1,0],
    [0,1,0]
  ],
  [
    [0,0,1],
    [0,1,1],
    [0,1,0]
  ],
  [// REVERSE L SHAPE ROTATION 3
    [0,0,1],
    [0,0,1],
    [0,1,1]
  ],
  [ // L SHAPE ROTATION 3
    [1,1,0],
    [0,1,0],
    [0,1,0]
  ],  
  [ // T ROTATION 3
    [0,1,0],
    [1,1,0],
    [0,1,0]
  ]

] as const

type FallingBlock = {
  x: number
  y: number
  shape: BlockShape
}
type Grid = ReadonlyArray<ReadonlyArray<number>>

/** State processing */

type State = Readonly<{
  gameEnd: boolean,
  fallingBlockX:number,
  fallingBlockY:number,
  fallingBlockShape: BlockShape
  grid: Grid,
  droppedBlocks: Array<FallingBlock>
  score: number
  level: number
  removedRows: number
}>;

const initialState: State = {
  gameEnd: false,
  fallingBlockX : 4,
  fallingBlockY: 0,
  fallingBlockShape:blockShape[3],
  grid: createGrid(),
  droppedBlocks: Array(),
  score: 0,
  level: 1,
  removedRows: 0,

} as const;

/**
 * Updates the state by proceeding with one time step.
 *
 * @param s Current state
 * @returns Updated state
 */
const tick = (s: State) => s;

/** Rendering (side effects) */

/**
 * Displays a SVG element on the canvas. Brings to foreground.
 * @param elem SVG element to display
 */
const show = (elem: SVGGraphicsElement) => {
  elem.setAttribute("visibility", "visible");
  elem.parentNode!.appendChild(elem);
};

/**
 * Hides a SVG element on the canvas.
 * @param elem SVG element to hide
 */
const hide = (elem: SVGGraphicsElement) =>
  elem.setAttribute("visibility", "hidden");

/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param namespace Namespace of the SVG element
 * @param name SVGElement name
 * @param props Properties to set on the SVG element
 * @returns SVG element
 */
const createSvgElement = (
  namespace: string | null,
  name: string,
  props: Record<string, string> = {}
) => {
  const elem = document.createElementNS(namespace, name) as SVGElement;
  Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
  return elem;
};

/**
 * This is the function called on page load. Your main game loop
 * should be called here.
 */
export function main() {
  // Canvas elements
  const svg = document.querySelector("#svgCanvas") as SVGGraphicsElement &
    HTMLElement;
  const preview = document.querySelector("#svgPreview") as SVGGraphicsElement &
    HTMLElement;
  const gameover = document.querySelector("#gameOver") as SVGGraphicsElement &
    HTMLElement;
  const container = document.querySelector("#main") as HTMLElement;

  svg.setAttribute("height", `${Viewport.CANVAS_HEIGHT}`);
  svg.setAttribute("width", `${Viewport.CANVAS_WIDTH}`);
  preview.setAttribute("height", `${Viewport.PREVIEW_HEIGHT}`);
  preview.setAttribute("width", `${Viewport.PREVIEW_WIDTH}`);

  // Text fields
  const levelText = document.querySelector("#levelText") as HTMLElement;
  const scoreText = document.querySelector("#scoreText") as HTMLElement;
  const highScoreText = document.querySelector("#highScoreText") as HTMLElement;

  /** User input */

  const key$ = fromEvent<KeyboardEvent>(document, "keypress");

  const fromKey = (keyCode: Key,direction:string) =>
    key$.pipe(filter(({ code }) => code === keyCode),
    map(()=> direction));
    

  const left$ = fromKey("KeyA","left");
  const right$ = fromKey("KeyD","right");
  const down$ = fromKey("KeyS","down");
  const rotate$ = fromKey("KeyW", "rotate");
  const space$ = fromKey("Space", "restart");

  /** Observables */


  /** Determines the rate of time steps */
  const tick$ = interval(Constants.TICK_RATE_MS)
  const movement$ = merge(left$,right$,down$,rotate$)
  const tickdown$ = tick$.pipe(map(() => "down"))
  const movementTickDown$ = merge(movement$,tickdown$,space$)



  /** Stream of falling blocks that contain data on their position and their shape */

  const getRandomBlockShape$ = interval(100000000000000).pipe(
    scan(()=> getRandomBlockShape(),blockShape[0]),
    startWith(blockShape[0])
  )


/**
 * Create an observable for detecting spacebar presses
 */
  const spaceBarPress$ = fromEvent<KeyboardEvent>(document, "keydown").pipe(
    filter((event) => event.key === " "),// Filter for spacebar presses
    map(() => " ") // Map the KeyboardEvent to the spacebar string
  );
    //Create an observable that merges the tick timer with space bar presses
  const fallingBlock$ = merge(movementTickDown$, spaceBarPress$).pipe(
    withLatestFrom(getRandomBlockShape$),// combine with the random block shape observable
    scan((state, [direction, fallingBlockShape]) => {
      if (state.gameEnd && direction === " ") {
        // Restart the game if space is pressed and the game is over
        return resetGame();
      }
  
      if (!state.gameEnd && state.fallingBlockShape) { // if theres a falling block and the game is not over
        // Calculate the new position of the falling block based on user input
        const newFallingBlockY = direction === "down" ? state.fallingBlockY + 1 : state.fallingBlockY;
        const newFallingBlockX =
          direction === "left"
            ? !checkAgainstExistingBlocks(state.fallingBlockShape, state.fallingBlockX - 1, state.fallingBlockY, direction, state.grid)
              ? state.fallingBlockX - 1
              : state.fallingBlockX
            : direction === "right"
            ? !checkAgainstExistingBlocks(state.fallingBlockShape, state.fallingBlockX + 1, state.fallingBlockY, direction, state.grid)
              ? state.fallingBlockX + 1
              : state.fallingBlockX
            : state.fallingBlockX;

        //Check for collisions or reaching the bottom
        const collision = checkCollision(state.fallingBlockShape, newFallingBlockX, newFallingBlockY, direction, state.grid);
        const reachBottom = checkReachBottom(state.fallingBlockShape, newFallingBlockY);
        
        if (!collision && !reachBottom) {
          // If no collision or bottom reached update the falling blocks position
          const newFallingBlock = {
            ...state,
            y: newFallingBlockY,
            fallingBlockX: newFallingBlockX,
          };
          return {
            ...state,
            fallingBlockY: newFallingBlock.y,
            fallingBlockX: newFallingBlockX,
          };
        } else {
          //Handle the block reaching the bottom or colliding with existing blocks
          const newDroppedBlock = {
            x: state.fallingBlockX,
            y: state.fallingBlockY,
            shape: state.fallingBlockShape,
          };

          //Update the game grid to include newly dropped blocks
          const newGrid = state.fallingBlockShape.reduce((grid, row, shapeY) => {
            return row.reduce((newGridRow, cube, shapeX) => {
              if (cube === 1) {
                const gridX = state.fallingBlockX + shapeX;
                const gridY = state.fallingBlockY + shapeY;
                return setCubeAtCoordinates(newGridRow, gridX, gridY, 1);
              }
              return newGridRow;
            }, grid);
          }, state.grid);

          //Remove the full rows,update the grid and state data accordingly
          const removedRowGrid = removeFullRows(newGrid);
          const removedRowCount = newGrid.length - removedRowGrid.length;
          const updatedGrid = adjustYPositions(removedRowGrid, removedRowCount);
          const newGameEnd = updatedGrid[0].some((cell) => cell === 1);
          
          //Calculate the players score,level and tick rate
          const scoreIncrease =
            removedRowCount === 1
              ? 40
              : removedRowCount === 2
              ? 100
              : removedRowCount === 3
              ? 300
              : removedRowCount === 4
              ? 1200
              : 0;
          const newScore = state.score + scoreIncrease * state.level;
          const totalRemovedRows = state.removedRows + removedRowCount;
          const levelIncrease = Math.floor(totalRemovedRows / 5) - Math.floor(state.removedRows / 5);
          const newLevel = state.level + levelIncrease;
          const tickRate = Constants.TICK_RATE_MS - Constants.TICK_RATE_MULTIPLIER * newLevel * 10;
          
          // Prepare the next block and update the game state
          const newDroppedBlocks = [...state.droppedBlocks, newDroppedBlock];
          const nextBlockShape = getRandomBlockShape(); // Generate the next block shape.
  
          // Render the next block in preview.
          renderNextBlockShape(preview, nextBlockShape, "blue");
  
          const newFallingBlock = { x: 4, y: 0, shape: nextBlockShape }; // Use the next block shape.
  
          return {
            ...state,
            gameEnd: newGameEnd,
            grid: updatedGrid,
            fallingBlockShape: nextBlockShape, // Set the falling block shape to the next block shape.
            fallingBlockY: 0,
            fallingBlockX: newFallingBlock.x,
            droppedBlocks: newDroppedBlocks,
            score: newScore,
            level: newLevel,
            removedRows: totalRemovedRows,
            highScore: newScore,
          };
        }
      } else {
        return state as State;
      }
    }, initialState as State),// Use initial state as intial value
    startWith(initialState as State)
  );


  /**
   * Renders the current state to the canvas.
   *
   * In MVC terms, this updates the View using the Model.
   *
   * @param s Current state
   */
  const render = (s: State) => {
    // Clear existing cubes
    const cubeElements = svg.querySelectorAll(".cube");
    cubeElements.forEach((cubeElement) => cubeElement.remove());
  
    // Render blocks from the grid
    s.grid.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        if (cell === 1) {
          const block = createSvgElement(svg.namespaceURI, "rect", {
            height: `${Block.HEIGHT}`,
            width: `${Block.WIDTH}`,
            x: `${Block.WIDTH * columnIndex}`,
            y: `${Block.HEIGHT * rowIndex}`,
            style: "fill: cyan",
          });
          block.classList.add("cube"); // Add a class to identify cubes
          svg.append(block);
        }
      });
    });
  
    // Render the falling block
    if (!s.gameEnd && s.fallingBlockShape) {
      const block = renderBlockShape(
        svg,
        s.fallingBlockX,
        s.fallingBlockY,
        s.fallingBlockShape,
        colours[4]
      );
      block.classList.add("cube"); // Add a class to identify cubes
      svg.append(block);
    }
    scoreText.textContent = `${s.score}`;
    levelText.textContent = `${s.level}`
    highScoreText.textContent = `${s.score}`
  
    // Add a block to the preview canvas
 
  };

  //Observable that represents the game state over time
  const source$ = fallingBlock$.pipe(
    map(tick), // map each tick to a game state update
    scan((state: State, newState: State) => newState, initialState) // Accumulate the game state updates
  );

  getRandomBlockShape$.subscribe((nextBlockShape) => {
    renderNextBlockShape(preview, nextBlockShape, "blue"); 
  });// renders the next block to be dropped in the preview canvas

   source$.subscribe((s: State) => {
    render(s);
  
    if (s.gameEnd) {
      show(gameover);// Shows game over if game ends
    } else {
      hide(gameover);
    }
  });
}

// The following simply runs your main function on window load.  Make sure to leave it in place.
if (typeof window !== "undefined") {
  window.onload = () => {
    main();
  };
}
