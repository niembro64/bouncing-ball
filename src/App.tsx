// App.tsx

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './App.css';
// @ts-ignore
import bmwModelUrl from './assets/bmw_1.glb';

const carMult = 2;
// Configuration
const CONFIG = {
  PHYSICS: {
    GRAVITY: new THREE.Vector3(0, 0, 0),
    CAR_DOWNFORCE: 0, // Increased downforce to keep car grounded
    JUMP_VELOCITY: 0, // Reduced jump height
    CAR_ACCELERATION: 350, // Balanced acceleration
    CAR_MAX_SPEED: 40,
    CAR_REVERSE_MAX_SPEED: 15, // Reduced reverse speed
    CAR_TURNING_SPEED: 9.0, // Adjusted for more natural turning
    CAR_FRICTION: 0.96,
    CAR_BRAKING_FORCE: 0.92,
    GROUND_RESTITUTION: 5, // Drastically reduced bounce for ground
    OBJECT_RESTITUTION: 0.3, // Lower bounce for object collisions
    HOUSE_RESTITUTION: 0.4, // Still higher for house but more realistic
    AIR_RESISTANCE: 0.99999, // Slightly increased air resistance
    POSITION_CORRECTION: 0.01, // Reduced position correction to prevent popping
    DAMPING: 0.9, // Increased damping (lower value = more damping)
    REST_SPEED: 0.05, // Lower threshold for objects to come to rest
    REST_THRESHOLD_Y: 0.2, // Very small threshold for vertical movement
    VELOCITY_THRESHOLD: 0.01, // Threshold to zero out tiny velocities
    SETTLEMENT_DELAY: 30, // Frames to wait before forcing settlement
  },
  CAR: {
    MODEL_PATH: bmwModelUrl,
    // MODEL_PATH: '/bmw_1.glb',
    SCALE: 1 * carMult,
    // Modified: Adjusted collision size to better center with the car model
    COLLISION_SIZE: new THREE.Vector3(2 * carMult, 1 * carMult, 4.5 * carMult),
    // Added offset to center the hitbox with the visual model
    COLLISION_OFFSET: new THREE.Vector3(
      -0.4 * carMult,
      1 * carMult,
      0.5 * carMult
    ),
    MASS: 10,
  },
  GROUND: {
    SIZE: 200,
    TILE_SIZE: 10, // Size of each tile
    COLORS: {
      DARK: 0x005500,
      LIGHT: 0x008800,
    },
  },
  SPHERES: {
    COUNT: 8, // Reduced count of objects
    MIN_SIZE: 1.0,
    MAX_SIZE: 2.0,
    COLORS: [0x0000ff, 0xff00ff, 0xffff00, 0x00ffff, 0xff8800],
  },
  HOUSES: {
    COUNT: 12, // Number of houses to create
    MIN_DISTANCE: 20, // Minimum distance from center
    MAX_DISTANCE: 80, // Maximum distance from center
    // Modified: Now using only a single house type with fixed dimensions
    TYPE: {
      WIDTH: 8,
      DEPTH: 8,
      HEIGHT: 5,
      ROOF_HEIGHT: 2.5,
      COLOR: 0xf5deb3, // Wheat color
      ROOF_COLOR: 0x800000, // Maroon color
    },
  },
  // Added: Ramp configuration
  RAMPS: {
    COUNT: 5, // Number of ramps to create
    MIN_DISTANCE: 15, // Minimum distance from center
    MAX_DISTANCE: 60, // Maximum distance from center
    WIDTH: 6, // Width of the ramp
    LENGTH: 10, // Length of the ramp
    HEIGHT: 3, // Maximum height of the ramp
    COLOR: 0x9b7653, // Brown color for ramps
  },
};

// PhysicsObject interface
interface PhysicsObject {
  mesh: THREE.Mesh | THREE.Group;
  velocity: THREE.Vector3;
  angularVelocity?: THREE.Vector3;
  mass: number;
  isStatic: boolean;
  type:
    | 'sphere'
    | 'box'
    | 'cylinder'
    | 'cone'
    | 'torus'
    | 'icosahedron'
    | 'tetrahedron'
    | 'car'
    | 'house'
    | 'ramp'; // Added 'ramp' type
  size: THREE.Vector3 | number;
  onGround?: boolean;
  direction?: THREE.Vector3;
  speed?: number;
  settlementCounter?: number; // Added for tracking how long object has been on ground
  // Added slope property for ramps
  slope?: THREE.Vector3;
}

function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const physicsObjects = useRef<PhysicsObject[]>([]);
  const carRef = useRef<PhysicsObject | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const clockRef = useRef<THREE.Clock | null>(null);
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const loadingRef = useRef<boolean>(false);

  // Force re-render to help with potential hot reload issues
  const [isReady, setIsReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Initialize scene, camera, renderer
  useEffect(() => {
    // Clear any previous state
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }

    if (!mountRef.current) return;
    console.log('Initializing THREE.js scene');

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue background
    sceneRef.current = scene;

    // Create camera - position it for better viewing
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 15, 30);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Better shadow quality
    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create clock for animation
    clockRef.current = new THREE.Clock();

    // Reset physics objects
    physicsObjects.current = [];
    carRef.current = null;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    scene.add(directionalLight);

    // Create tiled ground
    createTiledGround(scene);

    // Load car model
    const loadCar = () => {
      if (loadingRef.current || !sceneRef.current) return;

      loadingRef.current = true;
      console.log('Loading car model...');

      const loader = new GLTFLoader();
      loader.load(
        CONFIG.CAR.MODEL_PATH,
        (gltf) => {
          if (!sceneRef.current) return;

          console.log('Car model loaded successfully');

          const carModel = gltf.scene;
          carModel.scale.set(
            CONFIG.CAR.SCALE,
            CONFIG.CAR.SCALE,
            CONFIG.CAR.SCALE
          );
          carModel.rotation.y = Math.PI; // Rotate to face correct direction

          // Modified: Adjusted initial position with the collision box centered
          carModel.position.set(0, CONFIG.CAR.COLLISION_SIZE.y / 2 + 0.5, 0);

          carModel.castShadow = true;
          carModel.receiveShadow = true;
          carModel.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          sceneRef.current.add(carModel);

          // Create car physics object with corrected hitbox
          const car: PhysicsObject = {
            mesh: carModel,
            velocity: new THREE.Vector3(0, 0, 0),
            angularVelocity: new THREE.Vector3(0, 0, 0),
            mass: CONFIG.CAR.MASS,
            isStatic: false,
            type: 'car',
            size: CONFIG.CAR.COLLISION_SIZE.clone(),
            onGround: false,
            direction: new THREE.Vector3(0, 0, -1), // Forward is negative Z
            speed: 0,
            settlementCounter: 0,
          };

          physicsObjects.current.push(car);
          carRef.current = car;

          setLoadingProgress(100);
          loadingRef.current = false;

          const helperMesh = false;

          // Add a helper box to visualize the car's collision boundary in development
          if (helperMesh) {
            const helperGeometry = new THREE.BoxGeometry(
              CONFIG.CAR.COLLISION_SIZE.x,
              CONFIG.CAR.COLLISION_SIZE.y,
              CONFIG.CAR.COLLISION_SIZE.z
            );
            const helperMaterial = new THREE.MeshBasicMaterial({
              color: 0xff0000,
              wireframe: true,
              transparent: true,
              opacity: 0.5,
            });
            const helperMesh = new THREE.Mesh(helperGeometry, helperMaterial);
            // Apply offset to the helper mesh to show the actual collision box position
            helperMesh.position.copy(CONFIG.CAR.COLLISION_OFFSET);
            carModel.add(helperMesh);
          }
        },
        (progress) => {
          const percentage = (progress.loaded / progress.total) * 100;
          setLoadingProgress(percentage);
          console.log(`Loading progress: ${percentage.toFixed(2)}%`);
        },
        (error) => {
          console.error('Error loading car model:', error);
          loadingRef.current = false;

          // Fallback: create a simple car shape if model fails to load
          if (sceneRef.current) {
            createFallbackCar(sceneRef.current);
          }
        }
      );
    };

    // Create a simple fallback car if model loading fails
    const createFallbackCar = (scene: THREE.Scene) => {
      console.log('Creating fallback car');

      // Create a simple car-like shape from boxes
      const carGroup = new THREE.Group();
      scene.add(carGroup);

      // Car body
      const bodyGeometry = new THREE.BoxGeometry(2, 0.75, 4);
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
      const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
      bodyMesh.position.y = 0.75;
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      carGroup.add(bodyMesh);

      // Car cabin
      const cabinGeometry = new THREE.BoxGeometry(1.8, 0.6, 2);
      const cabinMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
      const cabinMesh = new THREE.Mesh(cabinGeometry, cabinMaterial);
      cabinMesh.position.set(0, 1.35, -0.2);
      cabinMesh.castShadow = true;
      cabinMesh.receiveShadow = true;
      carGroup.add(cabinMesh);

      // Wheels
      const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
      const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });

      // Front left wheel
      const wheelFL = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheelFL.rotation.z = Math.PI / 2;
      wheelFL.position.set(-1.1, 0.4, -1.2);
      wheelFL.castShadow = true;
      carGroup.add(wheelFL);

      // Front right wheel
      const wheelFR = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheelFR.rotation.z = Math.PI / 2;
      wheelFR.position.set(1.1, 0.4, -1.2);
      wheelFR.castShadow = true;
      carGroup.add(wheelFR);

      // Rear left wheel
      const wheelRL = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheelRL.rotation.z = Math.PI / 2;
      wheelRL.position.set(-1.1, 0.4, 1.2);
      wheelRL.castShadow = true;
      carGroup.add(wheelRL);

      // Rear right wheel
      const wheelRR = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheelRR.rotation.z = Math.PI / 2;
      wheelRR.position.set(1.1, 0.4, 1.2);
      wheelRR.castShadow = true;
      carGroup.add(wheelRR);

      carGroup.position.y = 0.5;

      // Create car physics object with the same properties
      const car: PhysicsObject = {
        mesh: carGroup,
        velocity: new THREE.Vector3(0, 0, 0),
        angularVelocity: new THREE.Vector3(0, 0, 0),
        mass: CONFIG.CAR.MASS,
        isStatic: false,
        type: 'car',
        size: CONFIG.CAR.COLLISION_SIZE.clone(),
        onGround: false,
        direction: new THREE.Vector3(0, 0, -1), // Forward is negative Z
        speed: 0,
        settlementCounter: 0,
      };

      physicsObjects.current.push(car);
      carRef.current = car;

      // Add a helper box to visualize the car's collision boundary
      if (process.env.NODE_ENV === 'development') {
        const helperGeometry = new THREE.BoxGeometry(
          CONFIG.CAR.COLLISION_SIZE.x,
          CONFIG.CAR.COLLISION_SIZE.y,
          CONFIG.CAR.COLLISION_SIZE.z
        );
        const helperMaterial = new THREE.MeshBasicMaterial({
          color: 0xff0000,
          wireframe: true,
          transparent: true,
          opacity: 0.5,
        });
        const helperMesh = new THREE.Mesh(helperGeometry, helperMaterial);
        carGroup.add(helperMesh);
      }
    };

    // Load the car
    loadCar();

    // Create houses around the scene
    // for (let i = 0; i < CONFIG.HOUSES.COUNT; i++) {
    //   createHouse(scene, i);
    // }

    // Create ramps around the scene
    // for (let i = 0; i < CONFIG.RAMPS.COUNT; i++) {
    //   createRamp(scene, i);
    // }

    // Create sphere objects for interaction
    for (let i = 0; i < CONFIG.SPHERES.COUNT; i++) {
      createSphere(scene, i);
    }

    // Set up resize handler
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;

      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Signal ready
    setIsReady(true);

    return () => {
      console.log('Cleaning up THREE.js scene');

      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }

      window.removeEventListener('resize', handleResize);

      if (rendererRef.current) {
        rendererRef.current.dispose();
      }

      if (mountRef.current) {
        mountRef.current.innerHTML = '';
      }

      sceneRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      clockRef.current = null;
      physicsObjects.current = [];
      carRef.current = null;
    };
  }, []); // Only run once on component mount

  // Create a tiled ground with alternating dark and light green
  const createTiledGround = (scene: THREE.Scene) => {
    // Use a simpler approach with multiple plane meshes for the checkerboard pattern
    const tileSize = CONFIG.GROUND.TILE_SIZE;
    const groundSize = CONFIG.GROUND.SIZE;
    const tilesPerSide = Math.floor(groundSize / tileSize);

    // Create parent group for all tiles
    const groundGroup = new THREE.Group();

    // Create materials for the two colors
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: CONFIG.GROUND.COLORS.DARK,
      roughness: 0.8,
    });

    const lightMaterial = new THREE.MeshStandardMaterial({
      color: CONFIG.GROUND.COLORS.LIGHT,
      roughness: 0.8,
    });

    // Create a single geometry for all tiles to reuse
    const tileGeometry = new THREE.PlaneGeometry(tileSize, tileSize);

    // Create tiles in a grid
    for (let x = 0; x < tilesPerSide; x++) {
      for (let z = 0; z < tilesPerSide; z++) {
        // Determine if this should be a light or dark tile
        const isEven = (x + z) % 2 === 0;
        const material = isEven ? lightMaterial : darkMaterial;

        // Create the tile
        const tile = new THREE.Mesh(tileGeometry, material);

        // Position in the grid
        // Center the grid by subtracting half the ground size
        const xPos = x * tileSize - groundSize / 2 + tileSize / 2;
        const zPos = z * tileSize - groundSize / 2 + tileSize / 2;

        tile.position.set(xPos, 0, zPos);
        tile.rotation.x = -Math.PI / 2; // Make it horizontal
        tile.receiveShadow = true;

        // Add to the ground group
        groundGroup.add(tile);
      }
    }

    scene.add(groundGroup);
  };

  // Modified: Create a house with a single consistent style
  const createHouse = (scene: THREE.Scene, index: number) => {
    const houseGroup = new THREE.Group();

    // Place house at a random location around the perimeter
    const angle = Math.random() * Math.PI * 2;
    const distance =
      CONFIG.HOUSES.MIN_DISTANCE +
      Math.random() * (CONFIG.HOUSES.MAX_DISTANCE - CONFIG.HOUSES.MIN_DISTANCE);

    const xPos = Math.cos(angle) * distance;
    const zPos = Math.sin(angle) * distance;

    // Get house parameters from config
    const width = CONFIG.HOUSES.TYPE.WIDTH;
    const depth = CONFIG.HOUSES.TYPE.DEPTH;
    const height = CONFIG.HOUSES.TYPE.HEIGHT;
    const roofHeight = CONFIG.HOUSES.TYPE.ROOF_HEIGHT;
    const color = CONFIG.HOUSES.TYPE.COLOR;
    const roofColor = CONFIG.HOUSES.TYPE.ROOF_COLOR;

    // Create house body
    const bodyGeometry = new THREE.BoxGeometry(width, height, depth);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.8,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    houseGroup.add(body);

    // Create roof
    const roofGeometry = new THREE.ConeGeometry(
      Math.max(width, depth) * 0.6,
      roofHeight,
      4
    );
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: roofColor,
      roughness: 0.6,
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = height + roofHeight / 2;
    roof.rotation.y = Math.PI / 4; // Rotate to align corners with walls
    roof.castShadow = true;
    houseGroup.add(roof);

    // Create door
    const doorWidth = 1.2;
    const doorHeight = 2.2;
    const doorGeometry = new THREE.PlaneGeometry(doorWidth, doorHeight);
    const doorMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.9,
    });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    // Place door on a random side of the house
    const doorSide = Math.floor(Math.random() * 4);

    if (doorSide === 0) {
      // Front
      door.position.set(0, doorHeight / 2, depth / 2 + 0.01);
    } else if (doorSide === 1) {
      // Right
      door.position.set(width / 2 + 0.01, doorHeight / 2, 0);
      door.rotation.y = Math.PI / 2;
    } else if (doorSide === 2) {
      // Back
      door.position.set(0, doorHeight / 2, -depth / 2 - 0.01);
      door.rotation.y = Math.PI;
    } else {
      // Left
      door.position.set(-width / 2 - 0.01, doorHeight / 2, 0);
      door.rotation.y = -Math.PI / 2;
    }
    door.castShadow = true;
    door.receiveShadow = true;
    houseGroup.add(door);

    // Add windows in a consistent pattern
    const windowSize = 1;
    const windowGeometry = new THREE.PlaneGeometry(windowSize, windowSize);
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0xadd8e6, // Light blue
      transparent: true,
      opacity: 0.7,
    });

    // Add windows - more consistent placement
    const sides = [
      { x: 0, z: depth / 2 + 0.01, rotY: 0 }, // Front
      { x: width / 2 + 0.01, z: 0, rotY: Math.PI / 2 }, // Right
      { x: 0, z: -depth / 2 - 0.01, rotY: Math.PI }, // Back
      { x: -width / 2 - 0.01, z: 0, rotY: -Math.PI / 2 }, // Left
    ];

    // Add 2 windows per side
    for (let i = 0; i < sides.length; i++) {
      const side = sides[i];

      // Skip the side with the door
      if (i === doorSide) continue;

      for (let j = -1; j <= 1; j += 2) {
        const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);

        // Position windows symmetrically on each side
        const offset = width * 0.25 * j;

        if (i % 2 === 0) {
          // Front/back
          windowMesh.position.set(offset, height * 0.6, side.z);
        } else {
          // Left/right
          windowMesh.position.set(side.x, height * 0.6, offset);
        }

        windowMesh.rotation.y = side.rotY;
        windowMesh.castShadow = false;
        windowMesh.receiveShadow = true;
        houseGroup.add(windowMesh);
      }
    }

    // Add chimney
    const chimneyWidth = 0.8;
    const chimneyHeight = roofHeight + 1;
    const chimneyGeometry = new THREE.BoxGeometry(
      chimneyWidth,
      chimneyHeight,
      chimneyWidth
    );
    const chimneyMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b0000, // Dark red
      roughness: 0.9,
    });
    const chimney = new THREE.Mesh(chimneyGeometry, chimneyMaterial);

    // Place chimney near a corner of the roof
    chimney.position.set(width / 3, height + chimneyHeight / 2, depth / 3);
    chimney.castShadow = true;
    houseGroup.add(chimney);

    // Position the house
    houseGroup.position.set(xPos, 0, zPos);

    // Rotate house to face a random direction
    houseGroup.rotation.y = Math.random() * Math.PI * 2;

    scene.add(houseGroup);

    // Add to physics objects as a static object with proper collision size
    // Include the roof height in the collision box
    const totalHeight = height + roofHeight;
    physicsObjects.current.push({
      mesh: houseGroup,
      velocity: new THREE.Vector3(0, 0, 0),
      mass: 0, // Static objects have 0 mass
      isStatic: true,
      type: 'house',
      // Increased the y size to include the roof for better collision detection
      size: new THREE.Vector3(width, totalHeight, depth),
    });
  };

  // Added: Create a ramp for the car to jump
  const createRamp = (scene: THREE.Scene, index: number) => {
    const rampGroup = new THREE.Group();

    // Place ramp at a random location
    const angle =
      (index / CONFIG.RAMPS.COUNT) * Math.PI * 2 + Math.random() * 0.5;
    const distance =
      CONFIG.RAMPS.MIN_DISTANCE +
      Math.random() * (CONFIG.RAMPS.MAX_DISTANCE - CONFIG.RAMPS.MIN_DISTANCE);

    const xPos = Math.cos(angle) * distance;
    const zPos = Math.sin(angle) * distance;

    // Define ramp dimensions
    const width = CONFIG.RAMPS.WIDTH;
    const length = CONFIG.RAMPS.LENGTH;
    const height = CONFIG.RAMPS.HEIGHT;

    // Create custom geometry for the ramp
    const rampGeometry = new THREE.BufferGeometry();

    // Define vertices for a triangular ramp
    const vertices = new Float32Array([
      // Bottom face
      -width / 2,
      0,
      0,
      width / 2,
      0,
      0,
      width / 2,
      0,
      length,

      -width / 2,
      0,
      0,
      width / 2,
      0,
      length,
      -width / 2,
      0,
      length,

      // Front triangular face
      -width / 2,
      0,
      0,
      width / 2,
      0,
      0,
      0,
      height,
      0,

      // Left face
      -width / 2,
      0,
      0,
      -width / 2,
      0,
      length,
      0,
      height,
      0,

      // Right face
      width / 2,
      0,
      0,
      0,
      height,
      0,
      width / 2,
      0,
      length,

      // Back slope face
      -width / 2,
      0,
      length,
      width / 2,
      0,
      length,
      0,
      height,
      0,
    ]);

    // Calculate and set normals
    const normalizeVector = (v: number[]) => {
      const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      return [v[0] / length, v[1] / length, v[2] / length];
    };

    const normals = new Float32Array([
      // Bottom face normals (pointing down)
      0,
      -1,
      0,
      0,
      -1,
      0,
      0,
      -1,
      0,

      0,
      -1,
      0,
      0,
      -1,
      0,
      0,
      -1,
      0,

      // Front face normals
      0,
      0,
      -1,
      0,
      0,
      -1,
      0,
      0,
      -1,

      // Left face normals
      ...normalizeVector([-1, 0.5, 0]),
      ...normalizeVector([-1, 0.5, 0]),
      ...normalizeVector([-1, 0.5, 0]),

      // Right face normals
      ...normalizeVector([1, 0.5, 0]),
      ...normalizeVector([1, 0.5, 0]),
      ...normalizeVector([1, 0.5, 0]),

      // Sloped face normals
      ...normalizeVector([0, 0.5, 1]),
      ...normalizeVector([0, 0.5, 1]),
      ...normalizeVector([0, 0.5, 1]),
    ]);

    rampGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(vertices, 3)
    );
    rampGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

    // Create material and mesh
    const rampMaterial = new THREE.MeshStandardMaterial({
      color: CONFIG.RAMPS.COLOR,
      roughness: 0.7,
    });

    const rampMesh = new THREE.Mesh(rampGeometry, rampMaterial);
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;

    rampGroup.add(rampMesh);

    // Position and rotate the ramp
    rampGroup.position.set(xPos, 0, zPos);
    rampGroup.rotation.y = Math.random() * Math.PI * 2; // Random rotation

    scene.add(rampGroup);

    // Create helper wireframe to visualize collision box (in development)
    if (process.env.NODE_ENV === 'development') {
      const boxGeometry = new THREE.BoxGeometry(width, height, length);
      const boxMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true,
        transparent: true,
        opacity: 0.3,
      });
      const boxHelper = new THREE.Mesh(boxGeometry, boxMaterial);
      boxHelper.position.set(0, height / 2, length / 2);
      rampGroup.add(boxHelper);
    }

    // Calculate slope direction for physics
    const slopeDirection = new THREE.Vector3(0, height, length).normalize();

    // Add to physics objects as a static ramp
    physicsObjects.current.push({
      mesh: rampGroup,
      velocity: new THREE.Vector3(0, 0, 0),
      mass: 0, // Static objects have 0 mass
      isStatic: true,
      type: 'ramp',
      size: new THREE.Vector3(width, height, length),
      slope: slopeDirection, // Add slope direction for physics calculations
    });
  };

  // Create a sphere for interaction
  const createSphere = (scene: THREE.Scene, index: number) => {
    const radius =
      CONFIG.SPHERES.MIN_SIZE +
      Math.random() * (CONFIG.SPHERES.MAX_SIZE - CONFIG.SPHERES.MIN_SIZE);

    const geometry = new THREE.SphereGeometry(radius, 24, 24);
    const material = new THREE.MeshStandardMaterial({
      color: CONFIG.SPHERES.COLORS[index % CONFIG.SPHERES.COLORS.length],
      roughness: 0.7,
      metalness: 0.3,
    });

    const mesh = new THREE.Mesh(geometry, material);

    // Position spheres around the scene
    // Organize them in a circle pattern
    const angle = (index / CONFIG.SPHERES.COUNT) * Math.PI * 2;
    const distance = 15 + Math.random() * 10;
    const xPos = Math.cos(angle) * distance;
    const zPos = Math.sin(angle) * distance;
    const yOffset = radius + 0.1; // Just above ground

    mesh.position.set(xPos, yOffset, zPos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Add to physics objects
    physicsObjects.current.push({
      mesh: mesh,
      velocity: new THREE.Vector3(0, 0, 0),
      mass: radius * 5, // Mass proportional to size
      isStatic: false,
      type: 'sphere',
      size: radius,
      onGround: true,
      settlementCounter: 0,
    });
  };

  // Set up keyboard controls
  useEffect(() => {
    console.log('Setting up keyboard controls');

    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = true;
      console.log(`Key down: ${e.code}`);

      // Jump when spacebar is pressed and car is on ground
      if (e.code === 'Space' && carRef.current?.onGround) {
        console.log('Jump triggered!');
        carRef.current.velocity.y = CONFIG.PHYSICS.JUMP_VELOCITY;
        carRef.current.onGround = false;
        carRef.current.settlementCounter = 0;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = false;
      console.log(`Key up: ${e.code}`);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isReady]); // Run after scene is initialized

  // Animation loop
  useEffect(() => {
    if (
      !isReady ||
      !sceneRef.current ||
      !rendererRef.current ||
      !cameraRef.current ||
      !clockRef.current
    ) {
      return;
    }

    console.log('Starting animation loop');
    clockRef.current.start();

    const animate = () => {
      if (
        !clockRef.current ||
        !sceneRef.current ||
        !rendererRef.current ||
        !cameraRef.current
      ) {
        return;
      }

      const dt = Math.min(clockRef.current.getDelta(), 0.1);
      updatePhysics(dt);

      rendererRef.current.render(sceneRef.current, cameraRef.current);
      animationFrameId.current = requestAnimationFrame(animate);
    };

    // Start animation loop
    animate();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [isReady]); // Run after scene is initialized

  // Update physics for all objects - updated with car physics and ramp handling
  const updatePhysics = (dt: number) => {
    // First, update car controls
    if (carRef.current) {
      const car = carRef.current;

      // Default: apply friction to slow down the car
      car.speed! *= CONFIG.PHYSICS.CAR_FRICTION;

      // Get input from keyboard for car controls
      let acceleration = 0;
      let turning = 0;
      let braking = false;

      // Forward/backward
      if (keysPressed.current['ArrowUp'] || keysPressed.current['KeyW']) {
        acceleration = 1; // Accelerate forward
      }
      if (keysPressed.current['ArrowDown'] || keysPressed.current['KeyS']) {
        acceleration = -1; // Accelerate backward/brake
      }

      // Left/right turning
      if (keysPressed.current['ArrowLeft'] || keysPressed.current['KeyA']) {
        turning = 1; // Turn left
      }
      if (keysPressed.current['ArrowRight'] || keysPressed.current['KeyD']) {
        turning = -1; // Turn right
      }

      // Spacebar for handbrake
      if (keysPressed.current['Space']) {
        braking = true;
      }

      // Apply acceleration
      if (acceleration !== 0) {
        // Accelerate based on current direction
        const accelerationForce =
          CONFIG.PHYSICS.CAR_ACCELERATION * acceleration * dt;

        // Different handling for forward vs reverse
        if (acceleration > 0) {
          car.speed! += accelerationForce;
          if (car.speed! > CONFIG.PHYSICS.CAR_MAX_SPEED) {
            car.speed! = CONFIG.PHYSICS.CAR_MAX_SPEED;
          }
        } else {
          // Reverse is slower
          car.speed! += accelerationForce;
          if (car.speed! < -CONFIG.PHYSICS.CAR_REVERSE_MAX_SPEED) {
            car.speed! = -CONFIG.PHYSICS.CAR_REVERSE_MAX_SPEED;
          }
        }
      }

      // Apply braking
      if (braking && car.onGround) {
        car.speed! *= CONFIG.PHYSICS.CAR_BRAKING_FORCE;
      }

      // IMPROVED: Car turning logic that works in all movement states
      const absSpeed = Math.abs(car.speed!);
      const isMoving = absSpeed > 0.1;
      const isReversing = car.speed! < -0.1;

      // Ground-based turning (allow turning when stationary or moving)
      if (turning !== 0 && car.onGround) {
        // Adaptive turning based on movement state
        let turnFactor = 1;

        // Calculate turn amount
        const turnAmount =
          CONFIG.PHYSICS.CAR_TURNING_SPEED * turning * dt * turnFactor;

        // Update car direction using proper rotation matrix
        const rotationMatrix = new THREE.Matrix4().makeRotationY(turnAmount);
        car.direction!.applyMatrix4(rotationMatrix);
        car.direction!.normalize();

        // Apply the same rotation to the car model
        car.mesh.rotateY(turnAmount);
      }

      // ADDED: Allow limited air control
      if (turning !== 0) {
        // Reduced turning capability when airborne
        const airTurnFactor = 0.3; // Significantly reduced for realistic physics
        const airTurnAmount =
          CONFIG.PHYSICS.CAR_TURNING_SPEED * turning * dt * airTurnFactor;

        // Apply air rotation to both direction vector and visual model
        const rotationMatrix = new THREE.Matrix4().makeRotationY(airTurnAmount);
        car.direction!.applyMatrix4(rotationMatrix);
        car.direction!.normalize();
        car.mesh.rotateY(airTurnAmount);
      }

      // Calculate velocity from speed and direction
      car.velocity.copy(car.direction!.clone().multiplyScalar(car.speed!));

      // Always apply gravity
      car.velocity.y += CONFIG.PHYSICS.GRAVITY.y * dt;
    }

    // Update all physics objects - revised for better driving game physics
    for (const obj of physicsObjects.current) {
      if (obj.isStatic) continue;

      // Apply velocity to position
      obj.mesh.position.add(obj.velocity.clone().multiplyScalar(dt));

      // Additional downforce for car to keep it on the ground
      if (obj.type === 'car') {
        // Apply extra downward force to the car based on speed
        // This simulates aerodynamic downforce that increases with speed
        const downforce = Math.abs(obj.speed!) * CONFIG.PHYSICS.CAR_DOWNFORCE;
        obj.velocity.y -= downforce * dt;
      } else {
        // Apply air resistance to flying objects (not the car)
        // This helps reduce perpetual bouncing
        obj.velocity.multiplyScalar(CONFIG.PHYSICS.AIR_RESISTANCE);

        // Additional damping to reduce endless bouncing
        if (!obj.onGround && obj.velocity.y < 0) {
          obj.velocity.y *= CONFIG.PHYSICS.DAMPING;
        }
      }

      // Apply gravity
      obj.velocity.add(CONFIG.PHYSICS.GRAVITY.clone().multiplyScalar(dt));

      // Ground collision check
      let collisionHeight = 0;

      if (obj.type === 'car') {
        collisionHeight = (obj.size as THREE.Vector3).y / 2;
      } else if (obj.type === 'box') {
        collisionHeight = (obj.size as THREE.Vector3).y / 2;
      } else if (
        obj.type === 'sphere' ||
        obj.type === 'icosahedron' ||
        obj.type === 'tetrahedron'
      ) {
        collisionHeight = obj.size as number;
      } else if (
        obj.type === 'cylinder' ||
        obj.type === 'cone' ||
        obj.type === 'torus'
      ) {
        collisionHeight = obj.size as number;
      }

      // Ground collision with improved settlement
      if (obj.mesh.position.y < collisionHeight) {
        // Position correction - ensure objects never go below the ground
        obj.mesh.position.y = collisionHeight;

        if (obj.velocity.y < 0) {
          // Almost no bounce for car
          if (obj.type === 'car') {
            // Absorb most energy for car on ground collision
            obj.velocity.y = -obj.velocity.y * 0.05;

            // Immediately stop vertical movement if it's a small bounce
            if (Math.abs(obj.velocity.y) < 0.5) {
              obj.velocity.y = 0;
            }

            // Apply stronger horizontal damping for car on ground
            obj.velocity.x *= 0.98;
            obj.velocity.z *= 0.98;
          } else {
            // Reduced bounce for regular objects
            obj.velocity.y =
              -obj.velocity.y * CONFIG.PHYSICS.GROUND_RESTITUTION;

            // Apply extra ground friction to help objects settle
            obj.velocity.x *= 0.9; // Increased horizontal damping
            obj.velocity.z *= 0.9;
          }

          // Consider object on ground with stricter threshold
          obj.onGround =
            Math.abs(obj.velocity.y) < CONFIG.PHYSICS.REST_THRESHOLD_Y;

          // Apply gentle position correction (reduced to prevent popping)
          obj.mesh.position.y +=
            collisionHeight * CONFIG.PHYSICS.POSITION_CORRECTION;

          // Initialize or increment settlement counter for objects on ground
          obj.settlementCounter = (obj.settlementCounter || 0) + 1;

          // Force object to settle after sufficient time on ground
          if (obj.settlementCounter > CONFIG.PHYSICS.SETTLEMENT_DELAY) {
            if (obj.type !== 'car') {
              // Don't force car to stop completely
              obj.velocity.set(0, 0, 0);
            } else {
              // For car, just zero out vertical velocity
              obj.velocity.y = 0;
            }
          }
        }
      } else {
        // Not touching ground
        obj.onGround = false;
        obj.settlementCounter = 0; // Reset settlement counter when airborne
      }

      // Enhanced rest condition - applies to all objects including car
      if (obj.onGround) {
        // Check if object is moving very slowly
        const speedSquaredXZ =
          obj.velocity.x * obj.velocity.x + obj.velocity.z * obj.velocity.z;

        const isSlowHorizontally =
          speedSquaredXZ <
          CONFIG.PHYSICS.REST_SPEED * CONFIG.PHYSICS.REST_SPEED;

        const isSlowVertically =
          Math.abs(obj.velocity.y) < CONFIG.PHYSICS.REST_THRESHOLD_Y;

        // Different handling for car vs. other objects
        if (obj.type !== 'car') {
          if (isSlowHorizontally && isSlowVertically) {
            // Non-car objects come to complete rest
            obj.velocity.set(0, 0, 0);
          }
        } else {
          // Car should stop vertical bouncing but maintain horizontal momentum
          if (isSlowVertically) {
            obj.velocity.y = 0;
          }
        }
      }

      // Zero out tiny velocities to prevent micro-movement
      if (Math.abs(obj.velocity.x) < CONFIG.PHYSICS.VELOCITY_THRESHOLD)
        obj.velocity.x = 0;
      if (Math.abs(obj.velocity.y) < CONFIG.PHYSICS.VELOCITY_THRESHOLD)
        obj.velocity.y = 0;
      if (Math.abs(obj.velocity.z) < CONFIG.PHYSICS.VELOCITY_THRESHOLD)
        obj.velocity.z = 0;
    }

    // Special case for the car - update camera to follow with a smooth trailing effect
    // Special case for the car - update camera to follow
    if (carRef.current && cameraRef.current) {
      const car = carRef.current;

      // Camera configuration
      const cameraHeight = 15; // Height offset for camera
      const cameraDistance = 15; // Distance behind the car
      const cameraLerpFactor = 0.01; // How quickly camera moves to trail point (0.1 = 10% per frame)

      // Calculate the trail point behind the car based on car's direction
      // We need to use the car's direction (which is a normalized vector) to determine "behind"
      const trailPoint = new THREE.Vector3();

      // Get the reverse direction of the car (to position camera behind car)
      const reverseDirX = -car.direction!.x;
      const reverseDirZ = -car.direction!.z;

      // Calculate position behind car using direction vector multiplied by desired distance
      trailPoint.x = car.mesh.position.x + reverseDirX * cameraDistance;
      trailPoint.y = car.mesh.position.y + cameraHeight; // Fixed height above car
      trailPoint.z = car.mesh.position.z + reverseDirZ * cameraDistance;

      // Smoothly interpolate current camera position toward the trail point
      // Formula: newPosition = currentPosition * (1 - lerpFactor) + targetPosition * lerpFactor
      cameraRef.current.position.x =
        cameraRef.current.position.x * (1 - cameraLerpFactor) +
        trailPoint.x * cameraLerpFactor;
      cameraRef.current.position.y = trailPoint.y;
      cameraRef.current.position.z =
        cameraRef.current.position.z * (1 - cameraLerpFactor) +
        trailPoint.z * cameraLerpFactor;

      // Always look directly at the car
      cameraRef.current.lookAt(car.mesh.position);
    }

    // Handle collisions between objects
    handleCollisions();
  };

  // Modified: Handle collisions between objects, including ramps
  const handleCollisions = () => {
    const objects = physicsObjects.current;

    for (let i = 0; i < objects.length; i++) {
      for (let j = i + 1; j < objects.length; j++) {
        const objA = objects[i];
        const objB = objects[j];

        // Skip if both objects are static
        if (objA.isStatic && objB.isStatic) continue;

        let collision = false;
        let normal = new THREE.Vector3();
        let depth = 0;

        // Sphere to Sphere collision
        if (objA.type === 'sphere' && objB.type === 'sphere') {
          const radiusA = objA.size as number;
          const radiusB = objB.size as number;
          const distanceVec = objB.mesh.position
            .clone()
            .sub(objA.mesh.position);
          const distance = distanceVec.length();
          const minDistance = radiusA + radiusB;

          if (distance < minDistance) {
            collision = true;
            normal = distanceVec.clone().normalize();
            depth = minDistance - distance;
          }
        }
        // Car to Sphere collision
        else if (
          (objA.type === 'car' && objB.type === 'sphere') ||
          (objA.type === 'sphere' && objB.type === 'car')
        ) {
          const car = objA.type === 'car' ? objA : objB;
          const sphere = objA.type === 'sphere' ? objA : objB;

          const carSize = car.size as THREE.Vector3;
          const sphereRadius = sphere.size as number;

          // Simplified collision using distance between centers
          const carRadius = Math.max(carSize.x, carSize.z) / 2;

          const distanceVec = sphere.mesh.position
            .clone()
            .sub(car.mesh.position);
          const distance = distanceVec.length();
          const minDistance = carRadius + sphereRadius;

          if (distance < minDistance) {
            collision = true;
            normal = distanceVec.clone().normalize();
            depth = minDistance - distance;

            // Flip normal if car is objB
            if (car === objB) {
              normal.negate();
            }
          }
        }
        // Car to House collision (improved with better bounce)
        else if (
          (objA.type === 'car' && objB.type === 'house') ||
          (objA.type === 'house' && objB.type === 'car')
        ) {
          const car = objA.type === 'car' ? objA : objB;
          const house = objA.type === 'house' ? objA : objB;

          const carSize = car.size as THREE.Vector3;
          const houseSize = house.size as THREE.Vector3;

          // Calculate the world position of the house, considering any rotation
          const houseWorldPos = new THREE.Vector3();
          house.mesh.getWorldPosition(houseWorldPos);

          // Calculate distances between centers on each axis
          const dx = Math.abs(car.mesh.position.x - houseWorldPos.x);
          const dy = Math.abs(car.mesh.position.y - houseWorldPos.y);
          const dz = Math.abs(car.mesh.position.z - houseWorldPos.z);

          // Add a small buffer to house size for earlier collision detection
          const buffer = 0.2;

          // Calculate minimum distance for collision
          const minX = (carSize.x + houseSize.x) / 2 + buffer;
          const minY = (carSize.y + houseSize.y) / 2 + buffer;
          const minZ = (carSize.z + houseSize.z) / 2 + buffer;

          // Check collision
          if (dx < minX && dy < minY && dz < minZ) {
            collision = true;

            // Calculate penetration depth on each axis
            const px = minX - dx;
            const py = minY - dy;
            const pz = minZ - dz;

            // Find axis of minimum penetration
            if (px <= py && px <= pz) {
              // X-axis collision
              normal.set(car.mesh.position.x < houseWorldPos.x ? -1 : 1, 0, 0);
              depth = px;
            } else if (py <= px && py <= pz) {
              // Y-axis collision
              normal.set(0, car.mesh.position.y < houseWorldPos.y ? -1 : 1, 0);
              depth = py;
            } else {
              // Z-axis collision
              normal.set(0, 0, car.mesh.position.z < houseWorldPos.z ? -1 : 1);
              depth = pz;
            }

            // Flip normal if car is objB
            if (car === objB) {
              normal.negate();
            }

            // Set collision parameters for a better bounce
            if (car === objA) {
              // Apply an immediate bounce effect by reflecting velocity along the normal
              const normalVelocityComponent = car.velocity.dot(normal);
              if (normalVelocityComponent < 0) {
                // Only bounce if moving toward the house
                car.velocity.sub(
                  normal.clone().multiplyScalar(2 * normalVelocityComponent)
                );

                // Reduce speed after collision to simulate energy loss
                car.speed! *= 0.8;
              }
            }
          }
        }
        // Sphere to House collision (simplified)
        else if (
          (objA.type === 'sphere' && objB.type === 'house') ||
          (objA.type === 'house' && objB.type === 'sphere')
        ) {
          const sphere = objA.type === 'sphere' ? objA : objB;
          const house = objA.type === 'house' ? objA : objB;

          const sphereRadius = sphere.size as number;
          const houseSize = house.size as THREE.Vector3;

          // Calculate closest point on house box to sphere center
          const closestPoint = new THREE.Vector3(
            Math.max(
              house.mesh.position.x - houseSize.x / 2,
              Math.min(
                sphere.mesh.position.x,
                house.mesh.position.x + houseSize.x / 2
              )
            ),
            Math.max(
              house.mesh.position.y - houseSize.y / 2,
              Math.min(
                sphere.mesh.position.y,
                house.mesh.position.y + houseSize.y / 2
              )
            ),
            Math.max(
              house.mesh.position.z - houseSize.z / 2,
              Math.min(
                sphere.mesh.position.z,
                house.mesh.position.z + houseSize.z / 2
              )
            )
          );

          // Calculate distance from closest point to sphere center
          const distanceVec = sphere.mesh.position.clone().sub(closestPoint);
          const distance = distanceVec.length();

          if (distance < sphereRadius) {
            collision = true;
            normal = distanceVec.clone().normalize();
            depth = sphereRadius - distance;

            // Flip normal if sphere is objB
            if (sphere === objB) {
              normal.negate();
            }
          }
        }
        // Added: Car to Ramp collision
        else if (
          (objA.type === 'car' && objB.type === 'ramp') ||
          (objA.type === 'ramp' && objB.type === 'car')
        ) {
          const car = objA.type === 'car' ? objA : objB;
          const ramp = objA.type === 'ramp' ? objA : objB;

          const carSize = car.size as THREE.Vector3;
          const rampSize = ramp.size as THREE.Vector3;

          // Get world position of ramp
          const rampWorldPos = new THREE.Vector3();
          ramp.mesh.getWorldPosition(rampWorldPos);

          // Create box representation of ramp and car for collision
          const rampBox = new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(
              rampWorldPos.x,
              rampWorldPos.y + rampSize.y / 2,
              rampWorldPos.z + rampSize.z / 2
            ),
            new THREE.Vector3(rampSize.x, rampSize.y, rampSize.z)
          );

          const carBox = new THREE.Box3().setFromCenterAndSize(
            car.mesh.position.clone(),
            new THREE.Vector3(carSize.x, carSize.y, carSize.z)
          );

          // Check if boxes intersect
          if (rampBox.intersectsBox(carBox)) {
            // Car is on the ramp - get height of ramp at car position
            // Calculate car's position relative to the ramp
            const localCarPos = car.mesh.position.clone().sub(rampWorldPos);

            // Rotate to match ramp orientation
            localCarPos.applyQuaternion(ramp.mesh.quaternion.clone().invert());

            // Get normalized position along ramp length (0 at start, 1 at end)
            const normalizedPos = Math.max(
              0,
              Math.min(1, localCarPos.z / rampSize.z)
            );

            // Calculate height at this position (linear interpolation)
            const rampHeightAtPos = normalizedPos * rampSize.y;

            // If car is above the ramp height at this position, it's a collision
            if (localCarPos.y < rampHeightAtPos + carSize.y / 2) {
              collision = true;

              // Set normal based on ramp slope
              if (ramp.slope) {
                normal.copy(ramp.slope).negate(); // Point away from ramp
              } else {
                // Default upward normal if no slope defined
                normal.set(0, 1, 0);
              }

              // Calculate penetration depth
              depth = rampHeightAtPos + carSize.y / 2 - localCarPos.y;

              // Apply ramp physics to car
              // 1. Align car velocity to ramp surface
              if (car === objA) {
                // Get component of velocity along the ramp
                const carSpeed = car.speed || 0;

                // If car is accelerating up the ramp
                if (carSpeed > 1) {
                  const dt = 0.1;
                  // Add upward component to velocity based on ramp slope
                  // This simulates the car going up the ramp
                  car.velocity.y += normalizedPos * 2.5 * carSpeed * dt;

                  // If near the end of the ramp, add extra upward velocity for a jump
                  if (normalizedPos > 0.8) {
                    car.velocity.y += carSpeed * 0.2;
                    car.onGround = false; // Car is now airborne
                  }
                }
              }

              // Flip normal if car is objB
              if (car === objB) {
                normal.negate();
              }
            }
          }
        }
        // Added: Sphere to Ramp collision
        else if (
          (objA.type === 'sphere' && objB.type === 'ramp') ||
          (objA.type === 'ramp' && objB.type === 'sphere')
        ) {
          const sphere = objA.type === 'sphere' ? objA : objB;
          const ramp = objA.type === 'ramp' ? objA : objB;

          const sphereRadius = sphere.size as number;
          const rampSize = ramp.size as THREE.Vector3;

          // Get world position of ramp
          const rampWorldPos = new THREE.Vector3();
          ramp.mesh.getWorldPosition(rampWorldPos);

          // Create box for ramp collision
          const rampBox = new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(
              rampWorldPos.x,
              rampWorldPos.y + rampSize.y / 2,
              rampWorldPos.z + rampSize.z / 2
            ),
            new THREE.Vector3(rampSize.x, rampSize.y, rampSize.z)
          );

          // Convert sphere to a point for simple distance check
          const sphereCenter = sphere.mesh.position.clone();

          // Check if sphere center is within expanded ramp box (expanded by sphere radius)
          const expandedRampBox = rampBox.clone().expandByScalar(sphereRadius);

          if (expandedRampBox.containsPoint(sphereCenter)) {
            // Calculate closest point on ramp to sphere
            // This is a simplified approach - in reality would need more complex calculation
            // for the exact ramp surface

            // Get normalized position of sphere on ramp (0-1 along ramp length)
            const localSpherePos = sphereCenter.clone().sub(rampWorldPos);
            localSpherePos.applyQuaternion(
              ramp.mesh.quaternion.clone().invert()
            );

            const normalizedPos = Math.max(
              0,
              Math.min(1, localSpherePos.z / rampSize.z)
            );

            // Calculate expected height at this position
            const rampHeightAtPos = normalizedPos * rampSize.y;

            // If sphere is too low (hitting the ramp)
            if (localSpherePos.y < rampHeightAtPos + sphereRadius) {
              collision = true;

              // Use ramp slope for normal
              if (ramp.slope) {
                normal.copy(ramp.slope).negate();
              } else {
                normal.set(0, 1, 0);
              }

              depth = rampHeightAtPos + sphereRadius - localSpherePos.y;

              // Flip normal if sphere is objB
              if (sphere === objB) {
                normal.negate();
              }
            }
          }
        }

        // Resolve collision if detected
        if (collision) {
          resolveCollision(objA, objB, normal, depth);
        }
      }
    }
  };

  // Resolve collision between two objects - improved for better physics
  const resolveCollision = (
    objA: PhysicsObject,
    objB: PhysicsObject,
    normal: THREE.Vector3,
    depth: number
  ) => {
    // Skip if both objects are static
    if (objA.isStatic && objB.isStatic) return;

    // Calculate relative velocity
    const relativeVelocity = objB.velocity
      ? objB.velocity.clone().sub(objA.velocity)
      : objA.velocity.clone().negate();

    const velocityAlongNormal = relativeVelocity.dot(normal);

    // Skip if objects are moving away from each other
    if (velocityAlongNormal > 0) return;

    // Choose appropriate restitution based on object types
    let restitution;

    // Car-to-house collisions
    if (
      (objA.type === 'car' && objB.type === 'house') ||
      (objA.type === 'house' && objB.type === 'car')
    ) {
      restitution = CONFIG.PHYSICS.HOUSE_RESTITUTION;
    }
    // Car-to-sphere collisions
    else if (
      (objA.type === 'car' && objB.type === 'sphere') ||
      (objA.type === 'sphere' && objB.type === 'car')
    ) {
      restitution = CONFIG.PHYSICS.OBJECT_RESTITUTION;
    }
    // Sphere-to-sphere collisions
    else if (objA.type === 'sphere' && objB.type === 'sphere') {
      restitution = CONFIG.PHYSICS.OBJECT_RESTITUTION * 0.7; // Reduced for sphere-to-sphere
    }
    // Ramp collisions - lower restitution for smoother ramp interaction
    else if (objA.type === 'ramp' || objB.type === 'ramp') {
      restitution = 0.1; // Very low restitution for ramps
    }
    // Default fallback
    else {
      restitution = CONFIG.PHYSICS.OBJECT_RESTITUTION;
    }

    // Scale down restitution based on impact velocity to simulate energy loss
    // This makes faster collisions less bouncy, more realistic
    const impactSpeed = Math.abs(velocityAlongNormal);
    if (impactSpeed > 10) {
      // Scale down restitution for high-speed impacts
      restitution *= 0.7;
    }

    // Calculate impulse scalar with normal physics formula
    let impulseMagnitude;

    // Special case for ramps - apply gentle upward force for the car
    if (
      (objA.type === 'car' && objB.type === 'ramp') ||
      (objB.type === 'car' && objA.type === 'ramp')
    ) {
      const car = objA.type === 'car' ? objA : objB;

      // Modified impulse calculation for ramps - allow car to drive up them
      if (car.velocity.y < 0) {
        // If car is falling onto ramp, absorb most downward velocity
        car.velocity.y *= 0.2;
      }

      // Set car as on ground when on ramp
      car.onGround = true;

      // Use low restitution for ramps
      restitution = 0.1;
    }

    if (objA.isStatic) {
      // If A is static, B gets all the impulse
      impulseMagnitude = -(1 + restitution) * velocityAlongNormal;
    } else if (objB.isStatic) {
      // If B is static, A gets all the impulse
      impulseMagnitude = -(1 + restitution) * velocityAlongNormal;
    } else {
      // Normal two-way collision with mass factored in
      impulseMagnitude =
        (-(1 + restitution) * velocityAlongNormal) /
        (1 / objA.mass + 1 / objB.mass);
    }

    // Apply impulse
    const impulse = normal.clone().multiplyScalar(impulseMagnitude);

    if (!objA.isStatic) {
      objA.velocity.sub(impulse.clone().multiplyScalar(1 / objA.mass));

      // Apply additional damping to reduce post-collision energy
      objA.velocity.multiplyScalar(0.95);

      // Update car speed if it's a car
      if (objA.type === 'car') {
        // Project velocity onto the direction vector
        const forwardVelocity = objA.velocity.dot(objA.direction!);
        objA.speed = forwardVelocity;
      }
    }

    if (!objB.isStatic) {
      objB.velocity.add(impulse.clone().multiplyScalar(1 / objB.mass));

      // Apply additional damping to reduce post-collision energy
      objB.velocity.multiplyScalar(0.95);

      // Update car speed if it's a car
      if (objB.type === 'car') {
        // Project velocity onto the direction vector
        const forwardVelocity = objB.velocity.dot(objB.direction!);
        objB.speed = forwardVelocity;
      }
    }

    // Gentler position correction to prevent objects from sinking into each other
    let correctionFactor = 0.2; // Reduced from 0.4
    if (
      (objA.type === 'car' && objB.type === 'house') ||
      (objB.type === 'car' && objA.type === 'house')
    ) {
      correctionFactor = 0.3; // Reduced from 0.6 for car-house
    }

    // Minimal correction for ramps to allow smooth transitions
    if (objA.type === 'ramp' || objB.type === 'ramp') {
      correctionFactor = 0.05;
    }

    const correction = normal.clone().multiplyScalar(depth * correctionFactor);

    // Apply position correction with mass ratio consideration
    if (!objA.isStatic && !objB.isStatic) {
      // If both objects are dynamic, distribute correction based on mass
      const totalMass = objA.mass + objB.mass;
      const ratioA = objB.mass / totalMass;
      const ratioB = objA.mass / totalMass;

      objA.mesh.position.sub(correction.clone().multiplyScalar(ratioA));
      objB.mesh.position.add(correction.clone().multiplyScalar(ratioB));
    } else {
      // If one object is static, apply full correction to the dynamic object
      if (!objA.isStatic) {
        objA.mesh.position.sub(correction);
      }
      if (!objB.isStatic) {
        objB.mesh.position.add(correction);
      }
    }
  };

  return (
    <div
      className="App"
      style={{
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        outline: 'none',
      }}
      tabIndex={0} // Make the div focusable
      ref={mountRef}
      onFocus={() => console.log('Game container focused')}
    />
  );
}

export default App;
