import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
  Play, 
  RotateCcw, 
  Settings, 
  Sliders, 
  Code, 
  Table, 
  Info, 
  Eye, 
  Zap, 
  Cpu, 
  Box,
  Copy,
  Check
} from 'lucide-react';

// HELMET SPHERE RADIUS (Units matching C++ sketch: 10.0 cm)
const HELMET_RADIUS = 10.0;

// LED Pin Mapping & Metadata matching 30-pin ESP32 DevKit V1
const LED_METADATA = [
  { id: 1,  pinName: 'D4',  gpio: 4,  label: 'Top Pole' },
  { id: 2,  pinName: 'RX2', gpio: 16, label: 'Upper Ring 1' },
  { id: 3,  pinName: 'TX2', gpio: 17, label: 'Upper Ring 2' },
  { id: 4,  pinName: 'D5',  gpio: 5,  label: 'Upper Ring 3' },
  { id: 5,  pinName: 'D18', gpio: 18, label: 'Upper Ring 4' },
  { id: 6,  pinName: 'D19', gpio: 19, label: 'Upper Ring 5' },
  { id: 7,  pinName: 'D21', gpio: 21, label: 'Upper Ring 6' },
  { id: 8,  pinName: 'D22', gpio: 22, label: 'Equator 1' },
  { id: 9,  pinName: 'D13', gpio: 13, label: 'Equator 2' },
  { id: 10, pinName: 'D14', gpio: 14, label: 'Equator 3' },
  { id: 11, pinName: 'D27', gpio: 27, label: 'Equator 4' },
  { id: 12, pinName: 'D26', gpio: 26, label: 'Equator 5' },
  { id: 13, pinName: 'D25', gpio: 25, label: 'Equator 6' }
];

// Helper: Convert Degrees to Radians
const degToRad = (deg) => (deg * Math.PI) / 180.0;

// Precompute 3D Position Coordinates for all 13 LEDs
const computeLEDPositions = () => {
  const positions = [];

  // LED 1 (Index 0): Top pole (0, 0, R)
  positions.push({ x: 0.0, y: 0.0, z: HELMET_RADIUS });

  // LEDs 2-7 (Indices 1-6): Upper Ring (40° elevation)
  const elev40 = degToRad(40.0);
  const rUpper = HELMET_RADIUS * Math.cos(elev40);
  const zUpper = HELMET_RADIUS * Math.sin(elev40);

  for (let k = 0; k < 6; k++) {
    const azimuth = degToRad(k * 60.0);
    positions.push({
      x: rUpper * Math.cos(azimuth),
      y: rUpper * Math.sin(azimuth),
      z: zUpper
    });
  }

  // LEDs 8-13 (Indices 7-12): Equatorial Ring (0° elevation, XY plane)
  for (let k = 0; k < 6; k++) {
    const azimuth = degToRad(k * 60.0);
    positions.push({
      x: HELMET_RADIUS * Math.cos(azimuth),
      y: HELMET_RADIUS * Math.sin(azimuth),
      z: 0.0
    });
  }

  return positions;
};

const LED_POSITIONS = computeLEDPositions();

export default function App() {
  // Target position controls
  const [targetPos, setTargetPos] = useState({ x: 0.0, y: 6.0, z: 4.0 });
  
  // Wave animation parameters
  const [waveSpeedFactor, setWaveSpeedFactor] = useState(120.0); // ms per distance unit
  const [glowDuration, setGlowDuration] = useState(800); // ms LED stays lit
  const [ledColor, setLedColor] = useState('#00f0ff'); // Cyan glow
  
  // Simulation playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [activeTab, setActiveTab] = useState('controls'); // 'controls', 'table', 'code'
  const [copiedCode, setCopiedCode] = useState(false);

  // Canvas Reference
  const mountRef = useRef(null);
  
  // Refs for Three.js state synchronization
  const sceneRef = useRef(null);
  const targetMeshRef = useRef(null);
  const ledMeshesRef = useRef([]);
  const ledGlowMeshesRef = useRef([]);
  const distanceLinesRef = useRef([]);

  // Animation timeline tracking
  const animationRef = useRef({
    startTime: 0,
    running: false,
    delays: []
  });

  // Calculate distances & delays whenever target position or speed factor changes
  const computedData = useMemo(() => {
    let maxDist = 0;
    const distances = LED_POSITIONS.map((pos) => {
      const dx = pos.x - targetPos.x;
      const dy = pos.y - targetPos.y;
      const dz = pos.z - targetPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > maxDist) maxDist = dist;
      return dist;
    });

    const delays = distances.map((dist) => {
      return Math.round((maxDist - dist) * waveSpeedFactor);
    });

    return LED_METADATA.map((meta, i) => ({
      ...meta,
      pos: LED_POSITIONS[i],
      distance: distances[i],
      delay: delays[i]
    }));
  }, [targetPos, waveSpeedFactor]);

  // Handle Play Wave animation trigger
  const handlePlayWave = () => {
    const delays = computedData.map(d => d.delay);
    animationRef.current = {
      startTime: performance.now(),
      running: true,
      delays: delays
    };
    setIsPlaying(true);
  };

  // Reset target position
  const handleResetTarget = () => {
    setTargetPos({ x: 0.0, y: 6.0, z: 4.0 });
  };

  // Initialize Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0d14');
    sceneRef.current = scene;

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(22, 22, 22);

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 60;
    controls.minDistance = 5;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight1.position.set(20, 30, 20);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xa855f7, 0.8);
    dirLight2.position.set(-20, -10, -20);
    scene.add(dirLight2);

    // 6. Grid and Axis Helpers
    const gridHelper = new THREE.GridHelper(30, 30, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -HELMET_RADIUS - 1;
    scene.add(gridHelper);

    // 7. Helmet Translucent Sphere Mesh
    const sphereGeo = new THREE.SphereGeometry(HELMET_RADIUS, 32, 32);
    const sphereMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.35,
      roughness: 0.2,
      metalness: 0.1,
      transmission: 0.6,
      ior: 1.2,
      wireframe: false,
      side: THREE.DoubleSide
    });
    const helmetMesh = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(helmetMesh);

    // Wireframe outline overlay for technical helmet aesthetic
    const wireframeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.08
    });
    const helmetWireframe = new THREE.Mesh(sphereGeo, wireframeMat);
    scene.add(helmetWireframe);

    // 8. Render 13 LEDs on Helmet
    const ledMeshes = [];
    const ledGlowMeshes = [];

    LED_POSITIONS.forEach((pos, idx) => {
      // LED Housing/Bulb Mesh
      const ledGeo = new THREE.SphereGeometry(0.45, 16, 16);
      const ledMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.3,
        metalness: 0.8,
        emissive: 0x000000,
        emissiveIntensity: 0
      });
      const ledMesh = new THREE.Mesh(ledGeo, ledMat);
      ledMesh.position.set(pos.x, pos.y, pos.z);
      scene.add(ledMesh);
      ledMeshes.push(ledMesh);

      // Outer Halo Glow Mesh
      const glowGeo = new THREE.SphereGeometry(0.85, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(ledColor),
        transparent: true,
        opacity: 0.0,
        wireframe: false
      });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      glowMesh.position.set(pos.x, pos.y, pos.z);
      scene.add(glowMesh);
      ledGlowMeshes.push(glowMesh);
    });

    ledMeshesRef.current = ledMeshes;
    ledGlowMeshesRef.current = ledGlowMeshes;

    // 9. Target Region Indicator (Draggable Target Marker)
    const targetGeo = new THREE.SphereGeometry(0.7, 16, 16);
    const targetMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 0.8,
      roughness: 0.2
    });
    const targetMesh = new THREE.Mesh(targetGeo, targetMat);
    targetMesh.position.set(targetPos.x, targetPos.y, targetPos.z);
    scene.add(targetMesh);
    targetMeshRef.current = targetMesh;

    // Pulsing target outer ring
    const ringGeo = new THREE.RingGeometry(0.9, 1.1, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf87171,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.lookAt(camera.position);
    targetMesh.add(ringMesh);

    // 10. Distance Vectors (Target to LEDs)
    const lines = [];
    LED_POSITIONS.forEach((pos) => {
      const lineMat = new THREE.LineDashedMaterial({
        color: 0x38bdf8,
        dashSize: 0.4,
        gapSize: 0.3,
        opacity: 0.2,
        transparent: true
      });
      const points = [
        new THREE.Vector3(pos.x, pos.y, pos.z),
        new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z)
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      scene.add(line);
      lines.push(line);
    });
    distanceLinesRef.current = lines;

    // Window Resize Handler
    const handleResize = () => {
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // Render Animation Loop
    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      controls.update();
      if (ringMesh) ringMesh.lookAt(camera.position);

      // Handle Wave Timing Animation
      if (animationRef.current.running) {
        const now = performance.now();
        const elapsed = now - animationRef.current.startTime;
        const delays = animationRef.current.delays;
        const activeColor = new THREE.Color(ledColor);

        let maxTotalTime = 0;

        ledMeshesRef.current.forEach((mesh, i) => {
          const delay = delays[i];
          const finishTime = delay + glowDuration;
          if (finishTime > maxTotalTime) maxTotalTime = finishTime;

          const glowMesh = ledGlowMeshesRef.current[i];

          if (elapsed >= delay && elapsed <= finishTime) {
            // LED is currently lit (Calculate smooth fade in / fade out curve)
            const timeLit = elapsed - delay;
            const progress = timeLit / glowDuration;
            // Smooth sine wave brightness curve
            const intensity = Math.sin(progress * Math.PI);

            mesh.material.emissive.copy(activeColor);
            mesh.material.emissiveIntensity = intensity * 2.0;

            glowMesh.material.color.copy(activeColor);
            glowMesh.material.opacity = intensity * 0.7;
            glowMesh.scale.setScalar(1.0 + intensity * 0.6);
          } else {
            // Off state
            mesh.material.emissiveIntensity = 0;
            glowMesh.material.opacity = 0.0;
          }
        });

        // Check if wave animation completed
        if (elapsed > maxTotalTime + 200) {
          if (isLooping) {
            animationRef.current.startTime = performance.now();
          } else {
            animationRef.current.running = false;
            setIsPlaying(false);
          }
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      scene.clear();
    };
  }, [isLooping]);

  // Update Target Position & Lines in 3D Scene
  useEffect(() => {
    if (targetMeshRef.current) {
      targetMeshRef.current.position.set(targetPos.x, targetPos.y, targetPos.z);
    }

    if (distanceLinesRef.current && distanceLinesRef.current.length === 13) {
      LED_POSITIONS.forEach((pos, i) => {
        const line = distanceLinesRef.current[i];
        if (line) {
          const points = [
            new THREE.Vector3(pos.x, pos.y, pos.z),
            new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z)
          ];
          line.geometry.setFromPoints(points);
          line.geometry.attributes.position.needsUpdate = true;
          line.computeLineDistances();
        }
      });
    }
  }, [targetPos]);

  // Update LED Glow Colors when color picker changes
  useEffect(() => {
    if (ledGlowMeshesRef.current) {
      const c = new THREE.Color(ledColor);
      ledGlowMeshesRef.current.forEach((glow) => {
        if (glow) glow.material.color.copy(c);
      });
    }
  }, [ledColor]);

  // Generate Arduino C++ Code Output
  const generatedCppCode = useMemo(() => {
    const delayArrayStr = computedData.map(d => d.delay).join(', ');
    return `// Target Region: (${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)}, ${targetPos.z.toFixed(1)})
// Wave Speed Factor: ${waveSpeedFactor.toFixed(1)} ms/unit | Glow Duration: ${glowDuration} ms

// Pre-calculated LED delay offsets (in milliseconds)
const unsigned long LED_DELAYS[13] = { ${delayArrayStr} };

void runCustomTargetWave() {
  unsigned long startTime = millis();
  bool ledFired[13] = {false};
  
  while (true) {
    unsigned long elapsed = millis() - startTime;
    bool allFinished = true;
    
    for (int i = 0; i < 13; i++) {
      if (elapsed >= LED_DELAYS[i] && elapsed <= (LED_DELAYS[i] + ${glowDuration})) {
        digitalWrite(ledPins[i], HIGH);
      } else {
        digitalWrite(ledPins[i], LOW);
      }

      if (elapsed < (LED_DELAYS[i] + ${glowDuration})) {
        allFinished = false;
      }
    }
    
    if (allFinished) break;
  }
}`;
  }, [computedData, targetPos, waveSpeedFactor, glowDuration]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedCppCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      
      {/* LEFT / CENTER MAIN 3D CANVAS VIEWPORT */}
      <div className="relative flex-1 h-full min-h-[400px] bg-slate-900 overflow-hidden">
        
        {/* Header Overlay */}
        <div className="absolute top-4 left-4 z-10 flex items-center space-x-3 bg-slate-900/80 backdrop-blur-md border border-slate-800 px-4 py-2.5 rounded-xl shadow-lg">
          <Cpu className="w-6 h-6 text-cyan-400" />
          <div>
            <h1 className="text-base font-bold text-white tracking-wide leading-none">SONATA: Wearable Focused Ultrasound Helmet Simulator</h1>
            <p className="text-xs text-slate-400 mt-1">Spatial Delay Timing Matrix & Phased Array Visualizer</p>
          </div>
        </div>

        {/* Viewport Floating Info Badge */}
        <div className="absolute top-4 right-4 z-10 flex items-center space-x-2 bg-slate-900/80 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-300">
          <Eye className="w-4 h-4 text-cyan-400" />
          <span>Drag to Rotate | Scroll to Zoom</span>
        </div>

        {/* Floating Play / Trigger Controller */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center space-x-3 bg-slate-900/90 backdrop-blur-md border border-slate-700 p-2.5 rounded-2xl shadow-2xl">
          <button
            onClick={handlePlayWave}
            disabled={isPlaying && !isLooping}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 shadow-md ${
              isPlaying
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 cursor-wait'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/25 hover:shadow-lg'
            }`}
          >
            <Play className={`w-4 h-4 ${isPlaying ? 'animate-spin' : ''}`} />
            <span>{isPlaying ? 'Wave Running...' : 'Fire Wave Sequence'}</span>
          </button>

          <button
            onClick={() => setIsLooping(!isLooping)}
            className={`px-3 py-2.5 rounded-xl text-xs font-medium border transition-all ${
              isLooping 
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/50' 
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Toggle Continuous Animation Loop"
          >
            Loop {isLooping ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={handleResetTarget}
            className="p-2.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition"
            title="Reset Target Coordinates"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Three.js Canvas Container */}
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      </div>

      {/* RIGHT SIDEBAR CONTROL & DATA PANEL */}
      <div className="w-full lg:w-[420px] h-full bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col shadow-2xl z-20">
        
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 p-1.5 space-x-1">
          <button
            onClick={() => setActiveTab('controls')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === 'controls'
                ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Target & Wave</span>
          </button>

          <button
            onClick={() => setActiveTab('table')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === 'table'
                ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Delay Matrix</span>
          </button>

          <button
            onClick={() => setActiveTab('code')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === 'code'
                ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>C++ Code</span>
          </button>
        </div>

        {/* TAB CONTENTS */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          
          {/* TAB 1: CONTROLS */}
          {activeTab === 'controls' && (
            <div className="space-y-6">
              
              {/* Target 3D Position Sliders */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                    <Box className="w-4 h-4 text-cyan-400" />
                    <span>Target Vector (x, y, z)</span>
                  </h3>
                  <span className="text-xs font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 px-2.5 py-1 rounded-md">
                    ({targetPos.x.toFixed(1)}, {targetPos.y.toFixed(1)}, {targetPos.z.toFixed(1)})
                  </span>
                </div>

                {/* X Axis */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Target X (Left/Right)</span>
                    <span className="font-mono text-slate-200">{targetPos.x.toFixed(1)} cm</span>
                  </div>
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="0.5"
                    value={targetPos.x}
                    onChange={(e) => setTargetPos({ ...targetPos, x: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>

                {/* Y Axis */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Target Y (Front/Back)</span>
                    <span className="font-mono text-slate-200">{targetPos.y.toFixed(1)} cm</span>
                  </div>
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="0.5"
                    value={targetPos.y}
                    onChange={(e) => setTargetPos({ ...targetPos, y: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>

                {/* Z Axis */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Target Z (Elevation)</span>
                    <span className="font-mono text-slate-200">{targetPos.z.toFixed(1)} cm</span>
                  </div>
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="0.5"
                    value={targetPos.z}
                    onChange={(e) => setTargetPos({ ...targetPos, z: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>
              </div>

              {/* Wave Dynamics & Timing Sliders */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <span>Wave Speed & Duration</span>
                </h3>

                {/* Wave Speed Factor */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Wave Speed Scale Factor</span>
                    <span className="font-mono text-slate-200">{waveSpeedFactor} ms/unit</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="300"
                    step="10"
                    value={waveSpeedFactor}
                    onChange={(e) => setWaveSpeedFactor(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-yellow-400"
                  />
                  <p className="text-[10px] text-slate-500">Higher value = slower wave pulse spread across the helmet.</p>
                </div>

                {/* LED Flash Glow Duration */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>LED Flash Duration</span>
                    <span className="font-mono text-slate-200">{glowDuration} ms</span>
                  </div>
                  <input
                    type="range"
                    min="200"
                    max="2000"
                    step="100"
                    value={glowDuration}
                    onChange={(e) => setGlowDuration(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-yellow-400"
                  />
                  <p className="text-[10px] text-slate-500">Controls how long each LED stays illuminated.</p>
                </div>

                {/* Color Picker */}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-slate-400">LED Glow Theme Color</span>
                  <div className="flex space-x-2">
                    {['#00f0ff', '#a855f7', '#22c55e', '#f59e0b', '#ef4444'].map((color) => (
                      <button
                        key={color}
                        onClick={() => setLedColor(color)}
                        className={`w-6 h-6 rounded-full border-2 transition ${
                          ledColor === color ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Geometry Overview Card */}
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-400 space-y-2">
                <div className="flex items-center space-x-2 text-slate-300 font-medium">
                  <Info className="w-4 h-4 text-cyan-400" />
                  <span>Sphere Geometry Setup</span>
                </div>
                <p>• Helmet Radius $R = 10.0$ cm</p>
                <p>• LED 1: Top Pole (0, 0, 10)</p>
                <p>• LEDs 2-7: Upper Ring at 40° elevation angle</p>
                <p>• LEDs 8-13: Equatorial Ring on XY Plane ($z=0$)</p>
              </div>

            </div>
          )}

          {/* TAB 2: LIVE DELAY MATRIX TABLE */}
          {activeTab === 'table' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-slate-200">13-LED Spatial Delay Table</h3>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded">Sorted by Pin</span>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400">
                      <th className="py-2.5 px-3">LED #</th>
                      <th className="py-2.5 px-3">Pin</th>
                      <th className="py-2.5 px-3">Distance</th>
                      <th className="py-2.5 px-3 text-right">Delay (ms)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                    {computedData.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-900/50 transition">
                        <td className="py-2 px-3 font-semibold text-cyan-400">
                          #{item.id}
                        </td>
                        <td className="py-2 px-3">
                          <span className="bg-slate-800 text-slate-200 px-1.5 py-0.5 rounded text-[11px]">
                            {item.pinName}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-400">
                          {item.distance.toFixed(1)} cm
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-yellow-400">
                          {item.delay} ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: GENERATED C++ CODE */}
          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-slate-200">Exported Arduino Array</h3>
                <button
                  onClick={copyToClipboard}
                  className="flex items-center space-x-1 text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2.5 py-1.5 rounded-lg hover:bg-cyan-500/30 transition"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied!' : 'Copy Sketch'}</span>
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-cyan-300 overflow-x-auto leading-relaxed">
                <pre>{generatedCppCode}</pre>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}